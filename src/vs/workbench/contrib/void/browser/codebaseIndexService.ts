/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService, IFileStat } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ILLMMessageService } from '../common/sendLLMMessageService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { tryLoadTreeSitter } from './treeSitter/wrapper.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { vloc } from '../common/voidLanguage.js';

export type CodebaseIndexState = 'idle' | 'indexing' | 'ready' | 'error';

export type CodebaseIndexStatus = {
	state: CodebaseIndexState;
	files: number;
	chunks: number;
	lastIndexedAt: number | null;
	message?: string;
	processedFiles?: number;
	totalFiles?: number;
};

export type CodebaseSearchResult = {
	uri: URI;
	startLine: number;
	endLine: number;
	score: number;
	preview: string;
};

export interface ICodebaseIndexService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeState: Event<CodebaseIndexStatus>;

	getStatus(): CodebaseIndexStatus;
	indexWorkspace(opts?: { force?: boolean }): Promise<void>;
	search(query: string, topK?: number): Promise<CodebaseSearchResult[]>;
	clear(): void;
}

export const ICodebaseIndexService = createDecorator<ICodebaseIndexService>('voidCodebaseIndexService');

type IndexChunk = {
	uri: URI;
	startLine: number;
	endLine: number;
	text: string;
	preview: string;
	tf: Map<string, number>;
	len: number;
};

const MAX_FILES = 6000;
const MAX_FILE_CHARS = 512_000;
const MAX_CHUNKS = 40_000;
const INDEX_STORAGE_KEY = 'lucky.codebaseIndex.v1';
const MAX_PERSIST_CHARS = 8_000_000;
const EMBEDDING_MODEL = 'nomic-embed-text';
const EMBEDDING_BATCH = 32;
const EMBEDDING_STORAGE_KEY = 'lucky.codebaseEmbeddings.v1';
const MAX_EMBEDDING_PERSIST_CHARS = 4_000_000;
const MAX_EMBEDDING_CACHE = 20_000;
const MAX_PERSIST_VECTORS = 800;
const MAX_SEMANTIC_CHUNKS = 12_000;
const CHUNK_LINES = 80;
const CHUNK_OVERLAP = 15;
const MAX_AST_CHUNK_LINES = 160;
const K1 = 1.5;
const B = 0.75;

const EXCLUDED_DIRS = new Set([
	'.git', '.hg', '.svn', 'node_modules', 'out', 'out-build', 'out-vscode', 'dist', 'build',
	'coverage', 'target', 'obj', 'bin', 'vendor', '__pycache__', '.venv', 'venv', 'env',
	'.next', '.nuxt', '.turbo', '.cache', 'logs', 'tmp', 'temp', 'artifacts',
]);

const INDEXABLE_EXTENSIONS = new Set([
	'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx', '.css', '.scss',
	'.less', '.html', '.htm', '.vue', '.svelte', '.py', '.java', '.kt', '.kts', '.c', '.h',
	'.cc', '.cpp', '.hpp', '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.scala', '.sql',
	'.yml', '.yaml', '.toml', '.xml', '.sh', '.ps1', '.bat', '.dockerfile', '.graphql',
	'.proto', '.ini', '.cfg', '.conf',
]);

const STOP_WORDS = new Set([
	'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'your', 'you', 'are', 'was',
	'were', 'will', 'would', 'can', 'could', 'should', 'have', 'has', 'had', 'not', 'but',
	'what', 'when', 'where', 'which', 'who', 'why', 'how', 'all', 'any', 'our', 'out', 'use',
	'using', 'get', 'set', 'var', 'let', 'const', 'function', 'return', 'true', 'false', 'null',
]);

const tokenize = (text: string): string[] => {
	const raw = text.match(/[A-Za-z_][A-Za-z0-9_]{1,}|[\u0400-\u04FF][\u0400-\u04FF0-9_]{1,}/g) ?? [];
	const out: string[] = [];
	for (const token of raw) {
		const split = token.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
		for (const part of split.split(/\s+/)) {
			if (part.length < 2 || STOP_WORDS.has(part)) continue;
			out.push(part);
		}
	}
	return out;
};

const isIndexableFile = (name: string): boolean => {
	const lower = name.toLowerCase();
	if (lower.endsWith('.min.js') || lower.endsWith('.min.css') || lower.endsWith('.map')) return false;
	if (lower === 'package-lock.json' || lower === 'yarn.lock' || lower === 'pnpm-lock.yaml') return false;
	const dot = lower.lastIndexOf('.');
	if (dot < 0) return lower === 'dockerfile' || lower === 'makefile';
	return INDEXABLE_EXTENSIONS.has(lower.slice(dot));
};

export const formatCodebaseSearchResults = (results: CodebaseSearchResult[]): string => {
	return results.map((r, i) => {
		const path = r.uri.fsPath;
		return `[${i + 1}] ${path}:${r.startLine}-${r.endLine} (score ${r.score.toFixed(2)})\n${r.preview}`;
	}).join('\n\n');
};

export class CodebaseIndexService extends Disposable implements ICodebaseIndexService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState = this._register(new Emitter<CodebaseIndexStatus>());
	readonly onDidChangeState: Event<CodebaseIndexStatus> = this._onDidChangeState.event;

	private _status: CodebaseIndexStatus = {
		state: 'idle',
		files: 0,
		chunks: 0,
		lastIndexedAt: null,
	};

	private _chunks: IndexChunk[] = [];
	private _postings = new Map<string, Map<number, number>>();
	private _docFreq = new Map<string, number>();
	private _avgdl = 1;
	private _stale = true;
	private _dirtyURIs = new Map<string, URI>();
	private _building: Promise<void> | null = null;
	private _loadedFromStorage = false;
	private _embeddingsUnavailable = false;
	private _embeddingCache = new Map<string, number[]>();
	private _embeddingsLoaded = false;
	private _embeddingsDirty = false;
	private _embeddingModelUsed = '';
	private _embeddingAll = false;
	private _treeSitterInit: Promise<boolean> | null = null;
	private _treeSitterLanguages = new Map<string, Promise<any>>();

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILLMMessageService private readonly _llmMessageService: ILLMMessageService,
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
	) {
		super();
		this._register(this._fileService.onDidFilesChange(e => {
			for (const uri of [...e.rawAdded, ...e.rawUpdated, ...e.rawDeleted]) {
				if (!isIndexableFile(uri.path)) continue;
				this._dirtyURIs.set(uri.toString(), uri);
			}
			if (this._dirtyURIs.size > 0) this._stale = true;
		}));
	}

	getStatus(): CodebaseIndexStatus {
		return { ...this._status };
	}

	clear(): void {
		this._chunks = [];
		this._postings.clear();
		this._docFreq.clear();
		this._avgdl = 1;
		this._stale = true;
		this._dirtyURIs.clear();
		this._embeddingCache = new Map<string, number[]>();
		this._embeddingsLoaded = false;
		this._embeddingsDirty = false;
		this._embeddingsUnavailable = false;
		this._status = { state: 'idle', files: 0, chunks: 0, lastIndexedAt: null };
		this._storageService.remove(INDEX_STORAGE_KEY, StorageScope.WORKSPACE);
		this._storageService.remove(EMBEDDING_STORAGE_KEY, StorageScope.WORKSPACE);
		this._onDidChangeState.fire(this.getStatus());
	}

	private _workspaceKey(): string {
		return this._workspaceContextService.getWorkspace().folders.map(f => f.uri.toString()).join('|');
	}

	private async _ensureLoaded(): Promise<void> {
		if (this._loadedFromStorage) return;
		this._loadedFromStorage = true;
		const raw = this._storageService.get(INDEX_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) return;
		try {
			const data = JSON.parse(raw) as {
				version?: number;
				workspace?: string;
				savedAt?: number;
				chunks?: { u: string; s: number; e: number; t: string }[];
			};
			if (data.version !== 1 || data.workspace !== this._workspaceKey() || !Array.isArray(data.chunks)) {
				this._storageService.remove(INDEX_STORAGE_KEY, StorageScope.WORKSPACE);
				return;
			}
			const chunks: IndexChunk[] = [];
			for (const c of data.chunks) {
				const uri = URI.parse(c.u);
				const text = c.t;
				const tokens = tokenize(text);
				if (tokens.length === 0) continue;
				const tf = new Map<string, number>();
				for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
				chunks.push({
					uri,
					startLine: c.s,
					endLine: c.e,
					text,
					preview: text.length > 700 ? text.slice(0, 700) + '\n…' : text,
					tf,
					len: tokens.length,
				});
			}
			if (chunks.length === 0) return;
			this._chunks = chunks;
			this._rebuildPostings();
			this._stale = false;
			const files = new Set(chunks.map(c => c.uri.toString())).size;
			this._setStatus({ state: 'ready', files, chunks: chunks.length, lastIndexedAt: data.savedAt ?? Date.now(), processedFiles: files, totalFiles: files, message: 'restored' });
		}
		catch (e) {
			this._logService.warn('[Lucky IDE] codebase index: failed to restore cache', e);
			this._storageService.remove(INDEX_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	private _persist(): void {
		try {
			const payload = {
				version: 1,
				workspace: this._workspaceKey(),
				savedAt: Date.now(),
				chunks: this._chunks.map(c => ({ u: c.uri.toString(), s: c.startLine, e: c.endLine, t: c.text })),
			};
			const raw = JSON.stringify(payload);
			if (raw.length > MAX_PERSIST_CHARS) {
				this._storageService.remove(INDEX_STORAGE_KEY, StorageScope.WORKSPACE);
				this._logService.info('[Lucky IDE] codebase index: too large to persist', raw.length);
				return;
			}
			this._storageService.store(INDEX_STORAGE_KEY, raw, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		catch (e) {
			this._logService.warn('[Lucky IDE] codebase index: failed to persist', e);
		}
	}

	async indexWorkspace(opts: { force?: boolean } = {}): Promise<void> {
		await this._ensureLoaded();
		await this._ensureEmbeddingsLoaded();
		if (this._building) return this._building;
		if (!opts.force && !this._stale && this._chunks.length > 0) return;

		const canIncremental = !opts.force && this._chunks.length > 0 && this._dirtyURIs.size > 0;
		this._building = (canIncremental ? this._refreshDirtyFiles() : this._build()).finally(() => {
			this._building = null;
		});
		return this._building;
	}

	private async _build(): Promise<void> {
		this._dirtyURIs.clear();
		this._setStatus({ state: 'indexing', files: 0, chunks: 0, lastIndexedAt: this._status.lastIndexedAt, message: 'indexing', processedFiles: 0, totalFiles: 0 });
		this._notificationService.notify({
			severity: Severity.Info,
			message: vloc('Lucky IDE: indexing codebase…', 'Lucky IDE: индексирую базу кода…').value,
		});

		try {
			const files = await this._collectFiles();
			const chunks: IndexChunk[] = [];
			this._setStatus({ state: 'indexing', files: files.length, chunks: 0, lastIndexedAt: this._status.lastIndexedAt, message: 'indexing', processedFiles: 0, totalFiles: files.length });

			for (let i = 0; i < files.length; i++) {
				if (chunks.length >= MAX_CHUNKS) break;
				const uri = files[i];
				try {
					const content = await this._fileService.readFile(uri);
					const text = content.value.toString();
					const clipped = text.length > MAX_FILE_CHARS ? text.slice(0, MAX_FILE_CHARS) : text;
					await this._addFileChunks(uri, clipped, chunks);
				}
				catch (e) {
					this._logService.warn('[Lucky IDE] codebase index: cannot read file', uri.fsPath, e);
				}
				this._setStatus({ state: 'indexing', files: files.length, chunks: chunks.length, lastIndexedAt: this._status.lastIndexedAt, message: 'indexing', processedFiles: i + 1, totalFiles: files.length });
			}

			this._chunks = chunks;
			this._rebuildPostings();

			this._stale = this._dirtyURIs.size > 0;
			this._persist();
			void this._embedAllChunksInBackground();
			this._setStatus({
				state: 'ready',
				files: files.length,
				chunks: chunks.length,
				lastIndexedAt: Date.now(),
				processedFiles: files.length,
				totalFiles: files.length,
			});
			this._notificationService.notify({
				severity: Severity.Info,
				message: vloc(
					`Lucky IDE: codebase indexed — ${files.length} files, ${chunks.length} chunks.`,
					`Lucky IDE: база кода проиндексирована — ${files.length} файлов, ${chunks.length} фрагментов.`,
				).value,
			});
		}
		catch (e) {
			this._logService.error('[Lucky IDE] codebase indexing failed', e);
			this._setStatus({
				state: 'error',
				files: 0,
				chunks: 0,
				lastIndexedAt: this._status.lastIndexedAt,
				message: e instanceof Error ? e.message : String(e),
			});
			this._notificationService.notify({
				severity: Severity.Warning,
				message: vloc(
					'Lucky IDE: codebase indexing failed. See the log for details.',
					'Lucky IDE: не удалось проиндексировать базу кода. Подробности в логе.',
				).value,
			});
		}
	}

	private async _addFileChunks(uri: URI, text: string, out: IndexChunk[]): Promise<void> {
		const lines = text.split(/\r?\n/);
		if (lines.length === 0) return;

		// Real tree-sitter first; declaration heuristic and fixed windows are fallbacks.
		if (this._isCodeFile(uri.path) && await this._addTreeSitterChunks(uri, text, lines, out)) return;
		if (this._isCodeFile(uri.path) && this._addDeclarationChunks(uri, lines, out)) return;

		for (let start = 0; start < lines.length; start += CHUNK_LINES - CHUNK_OVERLAP) {
			const end = Math.min(lines.length, start + CHUNK_LINES);
			this._pushChunk(uri, lines, start, end, out);
			if (end === lines.length) break;
		}
	}

	private _wasmUrl(name: string): string {
		const base = new URL('../../../../../node_modules/@vscode/tree-sitter-wasm/wasm/', document.baseURI);
		return new URL(name, base).toString();
	}

	private async _ensureTreeSitter(): Promise<boolean> {
		if (this._treeSitterInit) return this._treeSitterInit;
		this._treeSitterInit = (async () => {
			try {
				const treeSitter = await tryLoadTreeSitter(this._logService);
				if (!treeSitter) return false;
				await treeSitter.Parser.init({ locateFile: () => this._wasmUrl('tree-sitter.wasm') });
				return true;
			}
			catch (e) {
				this._logService.warn('[Lucky IDE] codebase index: tree-sitter unavailable, using heuristic', e);
				return false;
			}
		})();
		return this._treeSitterInit;
	}

	private _treeSitterLanguageFor(path: string): string | null {
		const lower = path.toLowerCase();
		if (/\.tsx$/.test(lower)) return 'tsx';
		if (/\.jsx$/.test(lower)) return 'tsx';
		if (/\.(ts|mts|cts)$/.test(lower)) return 'typescript';
		if (/\.(js|mjs|cjs)$/.test(lower)) return 'javascript';
		if (/\.py$/.test(lower)) return 'python';
		if (/\.java$/.test(lower)) return 'java';
		if (/\.go$/.test(lower)) return 'go';
		if (/\.rs$/.test(lower)) return 'rust';
		if (/\.(c|h|cc|cpp|hpp)$/.test(lower)) return 'cpp';
		if (/\.cs$/.test(lower)) return 'c-sharp';
		if (/\.rb$/.test(lower)) return 'ruby';
		return null;
	}

	private _getTreeSitterLanguage(path: string): Promise<any> {
		const name = this._treeSitterLanguageFor(path);
		if (!name) return Promise.resolve(null);
		let lang = this._treeSitterLanguages.get(name);
		if (lang) return lang;
		lang = (async () => {
			if (!await this._ensureTreeSitter()) return null
			try {
				const treeSitter = await tryLoadTreeSitter(this._logService);
				if (!treeSitter) return null;
				return await treeSitter.Language.load(this._wasmUrl(`tree-sitter-${name}.wasm`));
			}
			catch (e) {
				this._logService.warn('[Lucky IDE] codebase index: cannot load tree-sitter grammar', name, e);
				return null;
			}
		})();
		this._treeSitterLanguages.set(name, lang);
		return lang;
	}

	private async _addTreeSitterChunks(uri: URI, text: string, lines: string[], out: IndexChunk[]): Promise<boolean> {
		const language = await this._getTreeSitterLanguage(uri.path);
		if (!language) return false;

		let parser: any;
		try {
			const treeSitter = await tryLoadTreeSitter(this._logService);
			if (!treeSitter) return false;
			parser = new treeSitter.Parser();
			parser.setLanguage(language);
			const tree = parser.parse(text);
			if (!tree) return false;

			const declTypes = new Set([
				'function_declaration', 'class_declaration', 'interface_declaration', 'type_alias_declaration',
				'enum_declaration', 'lexical_declaration', 'export_statement', 'function_definition',
				'class_definition', 'decorated_definition', 'method_declaration', 'impl_item', 'struct_item',
				'enum_item', 'trait_item', 'const_item', 'static_item', 'mod_item', 'type_declaration',
			]);
			const nodes = [];
			for (const n of tree.rootNode.children) {
				if (n && declTypes.has(n.type)) nodes.push(n);
			}
			if (nodes.length === 0) {
				tree.delete();
				return false;
			}

			const ranges: Array<[number, number]> = [];
			let cursor = 0;
			for (const node of nodes) {
				if (!node) continue;
				const startLine = text.slice(0, node.startIndex).split('\n').length - 1;
				const endLine = text.slice(0, node.endIndex).split('\n').length;
				if (startLine > cursor) ranges.push([cursor, startLine]);
				ranges.push([startLine, endLine]);
				cursor = Math.max(cursor, endLine);
			}
			if (cursor < lines.length) ranges.push([cursor, lines.length]);
			tree.delete();

			for (const [from, to] of ranges) this._pushChunk(uri, lines, from, to, out);
			return out.length > 0;
		}
		catch (e) {
			this._logService.warn('[Lucky IDE] codebase index: tree-sitter parse failed', uri.fsPath, e);
			return false;
		}
	}

	private _isCodeFile(path: string): boolean {
		return /\.(ts|tsx|js|jsx|mjs|cjs|java|kt|kts|c|h|cc|cpp|hpp|cs|go|rs|php|swift|scala|py)$/i.test(path);
	}

	private _addDeclarationChunks(uri: URI, lines: string[], out: IndexChunk[]): boolean {
		const isPython = /\.py$/i.test(uri.path);
		const declRe = /^\s*(?:(?:export|default|declare|public|private|protected|internal|static|final|abstract|async|override|suspend|inline|open|data|sealed|partial|namespace|module|impl|pub)\s+)*(?:function|class|interface|type|enum|struct|trait|impl|def|func|fn|object|record|const|let|var)\b/;
		const pyDeclRe = /^(?:async\s+)?(?:def|class)\s+/;

		const ranges: Array<[number, number]> = [];
		let start = 0;
		let depth = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const isDecl = isPython ? (pyDeclRe.test(line) && !/^\s/.test(line)) : (depth === 0 && declRe.test(line));
			if (isDecl && i > start + 4) {
				ranges.push([start, i - 1]);
				start = i;
			}

			if (!isPython) {
				const opens = (line.match(/\{/g) ?? []).length;
				const closes = (line.match(/\}/g) ?? []).length;
				depth = Math.max(0, depth + opens - closes);
			}

			if (i - start + 1 >= MAX_AST_CHUNK_LINES) {
				ranges.push([start, i]);
				start = i + 1;
			}
		}

		if (start < lines.length) ranges.push([start, lines.length - 1]);
		if (ranges.length === 0) return false;

		for (const [from, to] of ranges) {
			this._pushChunk(uri, lines, from, to + 1, out);
		}
		return true;
	}

	private _pushChunk(uri: URI, lines: string[], start: number, endExclusive: number, out: IndexChunk[]): void {
		const end = Math.min(lines.length, endExclusive);
		if (end - start > MAX_AST_CHUNK_LINES) {
			for (let s = start; s < end; s += MAX_AST_CHUNK_LINES) {
				this._pushChunk(uri, lines, s, Math.min(end, s + MAX_AST_CHUNK_LINES), out);
			}
			return;
		}
		const chunkText = lines.slice(start, end).join('\n');
		if (chunkText.trim().length < 20) return;

		const tokens = tokenize(chunkText);
		if (tokens.length === 0) return;

		const tf = new Map<string, number>();
		for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);

		out.push({
			uri,
			startLine: start + 1,
			endLine: end,
			text: chunkText,
			preview: chunkText.length > 700 ? chunkText.slice(0, 700) + '\n…' : chunkText,
			tf,
			len: tokens.length,
		});
	}

	private _rebuildPostings(): void {
		this._postings.clear();
		this._docFreq.clear();
		let totalLen = 0;

		for (let i = 0; i < this._chunks.length; i++) {
			const chunk = this._chunks[i];
			totalLen += chunk.len;
			for (const [token, tf] of chunk.tf) {
				let posting = this._postings.get(token);
				if (!posting) {
					posting = new Map<number, number>();
					this._postings.set(token, posting);
				}
				posting.set(i, tf);
				this._docFreq.set(token, (this._docFreq.get(token) ?? 0) + 1);
			}
		}

		this._avgdl = this._chunks.length > 0 ? totalLen / this._chunks.length : 1;
	}

	private async _refreshDirtyFiles(): Promise<void> {
		const dirty = new Map(this._dirtyURIs);
		this._dirtyURIs.clear();
		if (dirty.size === 0) return;

		const dirtyKeys = new Set(dirty.keys());
		this._chunks = this._chunks.filter(c => !dirtyKeys.has(c.uri.toString()));
		this._setStatus({ state: 'indexing', files: 0, chunks: this._chunks.length, lastIndexedAt: this._status.lastIndexedAt, message: 'indexing', processedFiles: 0, totalFiles: dirty.size });

		let processed = 0;
		for (const uri of dirty.values()) {
			processed++;
			try {
				if (await this._fileService.exists(uri) && isIndexableFile(uri.path)) {
					const content = await this._fileService.readFile(uri);
					const text = content.value.toString();
					const clipped = text.length > MAX_FILE_CHARS ? text.slice(0, MAX_FILE_CHARS) : text;
					await this._addFileChunks(uri, clipped, this._chunks);
				}
			}
			catch (e) {
				this._logService.warn('[Lucky IDE] codebase index: cannot refresh file', uri.fsPath, e);
			}
			this._setStatus({ state: 'indexing', files: 0, chunks: this._chunks.length, lastIndexedAt: this._status.lastIndexedAt, message: 'indexing', processedFiles: processed, totalFiles: dirty.size });
		}

		this._rebuildPostings();
		this._stale = this._dirtyURIs.size > 0;
		this._persist();
		void this._embedAllChunksInBackground();
		const fileCount = new Set(this._chunks.map(c => c.uri.toString())).size;
		this._setStatus({ state: 'ready', files: fileCount, chunks: this._chunks.length, lastIndexedAt: Date.now(), processedFiles: fileCount, totalFiles: fileCount });
	}

	private async _collectFiles(): Promise<URI[]> {
		const folders = this._workspaceContextService.getWorkspace().folders;
		const out: URI[] = [];
		for (const folder of folders) {
			await this._walk(folder.uri, out, 0);
			if (out.length >= MAX_FILES) break;
		}
		return out;
	}

	private async _walk(uri: URI, out: URI[], depth: number): Promise<void> {
		if (out.length >= MAX_FILES || depth > 30) return;

		let stat: IFileStat;
		try {
			stat = await this._fileService.resolve(uri, { resolveMetadata: false });
		}
		catch {
			return;
		}
		if (!stat.isDirectory) return;

		for (const child of stat.children ?? []) {
			if (out.length >= MAX_FILES) return;
			if (child.isDirectory) {
				if (EXCLUDED_DIRS.has(child.name.toLowerCase())) continue;
				if (child.name.startsWith('.')) continue;
				await this._walk(child.resource, out, depth + 1);
			}
			else if (isIndexableFile(child.name)) {
				out.push(child.resource);
			}
		}
	}

	async search(query: string, topK = 8): Promise<CodebaseSearchResult[]> {
		const cleaned = query.replace(/@codebase\b/gi, ' ').trim();
		if (!cleaned) return [];

		await this.indexWorkspace();
		if (this._chunks.length === 0) return [];

		const terms = [...new Set(tokenize(cleaned))];
		if (terms.length === 0) return [];

		const N = this._chunks.length;
		const scores = new Map<number, number>();

		for (const term of terms) {
			const posting = this._postings.get(term);
			if (!posting) continue;
			const df = this._docFreq.get(term) ?? 1;
			const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
			for (const [chunkIdx, tf] of posting) {
				const chunk = this._chunks[chunkIdx];
				const denom = tf + K1 * (1 - B + B * (chunk.len / this._avgdl));
				const score = idf * ((tf * (K1 + 1)) / Math.max(denom, 0.0001));
				scores.set(chunkIdx, (scores.get(chunkIdx) ?? 0) + score);
			}
		}

		const fullSemantic = await this._fullSemanticRank(cleaned, scores, topK);
		let ranked = fullSemantic ?? [...scores.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, Math.max(1, topK * 4))
			.map(([chunkIdx, score]) => {
				const chunk = this._chunks[chunkIdx];
				return {
					chunk,
					uri: chunk.uri,
					startLine: chunk.startLine,
					endLine: chunk.endLine,
					score,
					preview: chunk.preview,
				};
			});

		// If the whole index is not embedded yet, fall back to a top-BM25 semantic rerank.
		if (!fullSemantic) {
			try {
				const queryEmbedding = await this._embedTexts([cleaned]);
				if (queryEmbedding && queryEmbedding.length === 1) {
					const missing = ranked.map(r => r.chunk).filter(c => !this._embeddingCache.has(this._chunkKey(c)));
					if (missing.length > 0) {
						const vectors = await this._embedTexts(missing.map(c => c.text));
						if (vectors && vectors.length === missing.length) {
							missing.forEach((chunk, i) => this._cacheEmbedding(this._chunkKey(chunk), vectors[i]));
						}
					}
					const q = queryEmbedding[0];
					ranked = ranked
						.map(r => {
							const v = this._embeddingCache.get(this._chunkKey(r.chunk));
							const cosine = v ? this._cosine(q, v) : 0;
							return { ...r, score: r.score + cosine * 2.5 };
						})
						.sort((a, b) => b.score - a.score);
				}
			}
			catch (e) {
				this._logService.info('[Lucky IDE] codebase index: semantic rerank skipped', e);
			}
		}

		this._persistEmbeddings();

		// Keep the context budget small: at most 2 chunks per file and ~8k chars total.
		const picked: typeof ranked = [];
		const perFile = new Map<string, number>();
		let totalChars = 0;
		for (const hit of ranked) {
			const key = hit.uri.fsPath;
			const count = perFile.get(key) ?? 0;
			if (count >= 2) continue;
			if (picked.length >= topK) break;
			if (totalChars + hit.preview.length > 8000 && picked.length >= 3) break;
			picked.push(hit);
			perFile.set(key, count + 1);
			totalChars += hit.preview.length;
		}

		return picked.map(({ chunk, ...rest }) => rest);
	}

	private _chunkKey(chunk: IndexChunk): string {
		let hash = 2166136261;
		for (let i = 0; i < chunk.text.length; i++) {
			hash ^= chunk.text.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		return `${chunk.uri.toString()}#${chunk.startLine}-${chunk.endLine}#${(hash >>> 0).toString(16)}`;
	}

	private _cacheEmbedding(key: string, vector: number[]): void {
		this._embeddingCache.set(key, vector);
		this._embeddingsDirty = true;
		while (this._embeddingCache.size > MAX_EMBEDDING_CACHE) {
			const first = this._embeddingCache.keys().next().value;
			if (first === undefined) break;
			this._embeddingCache.delete(first);
		}
	}

	private async _ensureEmbeddingsLoaded(): Promise<void> {
		if (this._embeddingsLoaded) return;
		this._embeddingsLoaded = true;
		const raw = this._storageService.get(EMBEDDING_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) return;
		try {
			const data = JSON.parse(raw) as { version?: number; workspace?: string; model?: string; vectors?: { [key: string]: number[] } };
			const model = this._settingsService.state.globalSettings.codebaseEmbeddingModel?.trim() || EMBEDDING_MODEL;
			this._embeddingModelUsed = model;
			if (data.version !== 1 || data.workspace !== this._workspaceKey() || data.model !== model || !data.vectors) {
				this._storageService.remove(EMBEDDING_STORAGE_KEY, StorageScope.WORKSPACE);
				return;
			}
			for (const key of Object.keys(data.vectors)) {
				const v = data.vectors[key];
				if (Array.isArray(v) && v.length > 0) this._embeddingCache.set(key, v);
			}
		}
		catch (e) {
			this._logService.warn('[Lucky IDE] codebase index: failed to restore embeddings', e);
			this._storageService.remove(EMBEDDING_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	private _persistEmbeddings(): void {
		if (!this._embeddingsDirty) return;
		this._embeddingsDirty = false;
		try {
			const vectors: { [key: string]: number[] } = {};
			for (const [key, v] of [...this._embeddingCache].slice(-MAX_PERSIST_VECTORS)) vectors[key] = v.map(x => Math.round(x * 10000) / 10000);
			const payload = {
				version: 1,
				workspace: this._workspaceKey(),
				model: this._settingsService.state.globalSettings.codebaseEmbeddingModel?.trim() || EMBEDDING_MODEL,
				vectors,
			};
			const raw = JSON.stringify(payload);
			if (raw.length > MAX_EMBEDDING_PERSIST_CHARS) {
				this._storageService.remove(EMBEDDING_STORAGE_KEY, StorageScope.WORKSPACE);
				return;
			}
			this._storageService.store(EMBEDDING_STORAGE_KEY, raw, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		catch (e) {
			this._logService.warn('[Lucky IDE] codebase index: failed to persist embeddings', e);
		}
	}

	private async _fullSemanticRank(query: string, bm25Scores: Map<number, number>, topK: number): Promise<Array<{ chunk: IndexChunk; uri: URI; startLine: number; endLine: number; score: number; preview: string }> | null> {
		if (this._chunks.length === 0 || this._chunks.length > MAX_SEMANTIC_CHUNKS) return null;
		if (!this._settingsService.state.globalSettings.enableCodebaseSemanticRerank) return null;

		let covered = 0;
		for (const chunk of this._chunks) {
			if (this._embeddingCache.has(this._chunkKey(chunk))) covered++;
		}
		if (covered < this._chunks.length) return null;

		const queryVector = await this._embedTexts([query]);
		if (!queryVector || queryVector.length !== 1) return null;
		const q = queryVector[0];

		const ranked = [];
		for (let i = 0; i < this._chunks.length; i++) {
			const chunk = this._chunks[i];
			const v = this._embeddingCache.get(this._chunkKey(chunk));
			if (!v) continue;
			const bm25 = bm25Scores.get(i) ?? 0;
			const cosine = this._cosine(q, v);
			const score = bm25 + cosine * 2.5;
			if (score <= 0) continue;
			ranked.push({
				chunk,
				uri: chunk.uri,
				startLine: chunk.startLine,
				endLine: chunk.endLine,
				score,
				preview: chunk.preview,
			});
		}
		ranked.sort((a, b) => b.score - a.score);
		return ranked.slice(0, Math.max(1, topK * 4));
	}

	private async _embedAllChunksInBackground(): Promise<void> {
		if (this._embeddingAll) return;
		if (!this._settingsService.state.globalSettings.enableCodebaseSemanticRerank) return;
		if (this._chunks.length === 0 || this._chunks.length > MAX_SEMANTIC_CHUNKS) return;

		this._embeddingAll = true;
		try {
			const chunks = [...this._chunks];
			const missing = chunks.filter(c => !this._embeddingCache.has(this._chunkKey(c)));
			for (let i = 0; i < missing.length; i += EMBEDDING_BATCH) {
				const batch = missing.slice(i, i + EMBEDDING_BATCH);
				const vectors = await this._embedTexts(batch.map(c => c.text));
				if (!vectors || vectors.length !== batch.length) break;
				batch.forEach((chunk, j) => this._cacheEmbedding(this._chunkKey(chunk), vectors[j]));
				await new Promise(resolve => setTimeout(resolve, 0));
			}
			this._persistEmbeddings();
		}
		finally {
			this._embeddingAll = false;
		}
	}

	private async _embedTexts(inputs: string[]): Promise<number[][] | null> {
		if (this._embeddingsUnavailable || inputs.length === 0) return null;

		const globalSettings = this._settingsService.state.globalSettings;
		if (!globalSettings.enableCodebaseSemanticRerank) return null;
		const model = globalSettings.codebaseEmbeddingModel?.trim() || EMBEDDING_MODEL;
		if (this._embeddingModelUsed !== model) {
			this._embeddingCache.clear();
			this._embeddingsDirty = false;
			this._embeddingsUnavailable = false;
			this._embeddingModelUsed = model;
		}
		const endpoint = this._settingsService.state.settingsOfProvider.ollama?.endpoint?.trim() || 'http://127.0.0.1:11434';
		try {
			const out: number[][] = [];
			for (let i = 0; i < inputs.length; i += EMBEDDING_BATCH) {
				const batch = inputs.slice(i, i + EMBEDDING_BATCH);
				const res = await this._llmMessageService.embed({ endpoint, model, input: batch });
				if (!res?.embeddings || res.embeddings.length !== batch.length) {
					this._embeddingsUnavailable = true;
					return null;
				}
				out.push(...res.embeddings);
			}
			return out;
		}
		catch (e) {
			this._embeddingsUnavailable = true;
			this._logService.info('[Lucky IDE] codebase index: embeddings unavailable, BM25 only', e);
			return null;
		}
	}

	private _cosine(a: number[], b: number[]): number {
		let dot = 0, an = 0, bn = 0;
		const n = Math.min(a.length, b.length);
		for (let i = 0; i < n; i++) {
			dot += a[i] * b[i];
			an += a[i] * a[i];
			bn += b[i] * b[i];
		}
		if (an === 0 || bn === 0) return 0;
		return dot / (Math.sqrt(an) * Math.sqrt(bn));
	}

	private _setStatus(status: CodebaseIndexStatus): void {
		this._status = status;
		this._onDidChangeState.fire(this.getStatus());
	}
}

registerSingleton(ICodebaseIndexService, CodebaseIndexService, InstantiationType.Delayed);
