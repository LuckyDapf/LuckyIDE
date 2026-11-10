/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { parse, ParsedPattern } from '../../../../base/common/glob.js';

/**
 * Правила проекта в стиле Cursor: файл `.md`/`.mdc` может начинаться с frontmatter
 *
 *   ---
 *   globs: src/**\/*.ts, **\/*.test.ts
 *   alwaysApply: false
 *   ---
 *
 * Без frontmatter (или с alwaysApply: true) правило применяется ко всем запросам.
 * С globs — только когда хотя бы один открытый файл подходит под один из шаблонов.
 */
export type ProjectRule = {
	readonly body: string;
	readonly globs: string[] | null;
	readonly alwaysApply: boolean;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

const parseListValue = (value: string): string[] =>
	value
		.split(',')
		.map(part => part.trim().replace(/^['"]|['"]$/g, ''))
		.filter(part => part.length > 0);

export const parseProjectRuleFile = (content: string): ProjectRule => {
	const match = content.match(FRONTMATTER_RE);
	if (!match) {
		return { body: content.trim(), globs: null, alwaysApply: true };
	}

	const body = content.slice(match[0].length).trim();
	let globs: string[] | null = null;
	let alwaysApply = false;
	let hasKnownKey = false;

	for (const line of match[1].split(/\r?\n/)) {
		const kv = line.match(/^\s*([A-Za-z_]+)\s*:\s*(.*)$/);
		if (!kv) continue;
		const key = kv[1].toLowerCase();
		const value = kv[2].trim();
		if (key === 'globs') {
			hasKnownKey = true;
			const list = parseListValue(value);
			globs = list.length > 0 ? list : null;
		}
		else if (key === 'alwaysapply') {
			hasKnownKey = true;
			alwaysApply = value.toLowerCase() === 'true';
		}
	}

	// frontmatter without recognized keys (e.g. description-only) still strips the header
	if (!hasKnownKey) {
		return { body, globs: null, alwaysApply: true };
	}
	if (alwaysApply) {
		return { body, globs: null, alwaysApply: true };
	}
	return { body, globs, alwaysApply: false };
};

const patternCache = new Map<string, ParsedPattern>();
const compilePattern = (pattern: string): ParsedPattern => {
	let parsed = patternCache.get(pattern);
	if (!parsed) {
		parsed = parse(pattern);
		if (patternCache.size > 256) patternCache.clear();
		patternCache.set(pattern, parsed);
	}
	return parsed;
};

/**
 * `paths` — относительные пути открытых файлов (прямые слэши).
 * Правило без globs применяется всегда; с globs — если любой путь подходит.
 */
export const projectRuleApplies = (rule: ProjectRule, paths: readonly string[]): boolean => {
	if (rule.alwaysApply || rule.globs === null) return true;
	if (!rule.body) return false;
	for (const rawGlob of rule.globs) {
		const glob = rawGlob.replace(/\\/g, '/');
		const matches = compilePattern(glob);
		// как в Cursor: шаблон без слэшей сопоставляется с именем файла, а не с полным путём
		const matchBasenameOnly = !glob.includes('/');
		for (const path of paths) {
			const normalized = path.replace(/\\/g, '/');
			const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
			if (matchBasenameOnly ? matches(basename) : matches(normalized, basename)) return true;
		}
	}
	return false;
};

export const combineApplicableRules = (rules: readonly ProjectRule[], paths: readonly string[]): string =>
	rules
		.filter(rule => rule.body && projectRuleApplies(rule, paths))
		.map(rule => rule.body)
		.join('\n\n');