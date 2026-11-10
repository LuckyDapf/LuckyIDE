/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { buildAutocompleteContext, commentPrefixForLanguage } from '../../common/autocompleteContext.js';

suite('Autocomplete Context', () => {

	test('comment prefixes per language', () => {
		assert.strictEqual(commentPrefixForLanguage('typescript'), '//');
		assert.strictEqual(commentPrefixForLanguage('javascript'), '//');
		assert.strictEqual(commentPrefixForLanguage('python'), '#');
		assert.strictEqual(commentPrefixForLanguage('shellscript'), '#');
		assert.strictEqual(commentPrefixForLanguage('sql'), '--');
		assert.strictEqual(commentPrefixForLanguage('clojure'), ';');
	});

	test('markup and comment-less languages get no context', () => {
		assert.strictEqual(commentPrefixForLanguage('html'), null);
		assert.strictEqual(commentPrefixForLanguage('json'), null);
		assert.strictEqual(commentPrefixForLanguage('css'), null);
		assert.strictEqual(commentPrefixForLanguage('markdown'), null);
		assert.strictEqual(buildAutocompleteContext({
			currentUri: 'a.html',
			languageId: 'html',
			files: [{ uri: 'b.html', languageId: 'html', text: '<div></div>' }],
		}), '');
	});

	test('includes same-language files, excludes current file and other languages', () => {
		const context = buildAutocompleteContext({
			currentUri: 'E:/proj/main.ts',
			languageId: 'typescript',
			files: [
				{ uri: 'E:/proj/main.ts', languageId: 'typescript', text: 'current file' },
				{ uri: 'E:/proj/util.ts', languageId: 'typescript', text: 'export const x = 1' },
				{ uri: 'E:/proj/style.css', languageId: 'css', text: 'body {}' },
			],
		});
		assert.ok(context.includes('util.ts'));
		assert.ok(context.includes('export const x = 1'));
		assert.ok(!context.includes('current file'));
		assert.ok(!context.includes('body {}'));
	});

	test('every context line is commented', () => {
		const context = buildAutocompleteContext({
			currentUri: 'main.py',
			languageId: 'python',
			files: [{ uri: 'helpers.py', languageId: 'python', text: 'def f():\n    return 1' }],
		});
		assert.ok(context.length > 0);
		for (const line of context.split('\n')) {
			if (line === '') continue // trailing separator before the real prefix
			assert.ok(line.startsWith('#'), `uncommented line: ${line}`);
		}
		assert.ok(context.endsWith('\n\n'));
	});

	test('CRLF is normalized', () => {
		const context = buildAutocompleteContext({
			currentUri: 'main.ts',
			languageId: 'typescript',
			files: [{ uri: 'other.ts', languageId: 'typescript', text: 'line1\r\nline2' }],
		});
		assert.ok(!context.includes('\r'));
		assert.ok(context.includes('// line1\n// line2'));
	});

	test('respects maxFiles', () => {
		const files = [1, 2, 3, 4].map(i => ({ uri: `f${i}.ts`, languageId: 'typescript', text: `content ${i}` }));
		const context = buildAutocompleteContext({ currentUri: 'main.ts', languageId: 'typescript', files, maxFiles: 2 });
		assert.ok(context.includes('f1.ts'));
		assert.ok(context.includes('f2.ts'));
		assert.ok(!context.includes('f3.ts'));
	});

	test('respects maxCharsPerFile and maxTotalChars', () => {
		const context = buildAutocompleteContext({
			currentUri: 'main.ts',
			languageId: 'typescript',
			files: [{ uri: 'big.ts', languageId: 'typescript', text: 'x'.repeat(5000) }],
			maxCharsPerFile: 100,
		});
		assert.ok(context.includes('x'.repeat(100)));
		assert.ok(!context.includes('x'.repeat(101)));

		const context2 = buildAutocompleteContext({
			currentUri: 'main.ts',
			languageId: 'typescript',
			files: [
				{ uri: 'a.ts', languageId: 'typescript', text: 'a'.repeat(100) },
				{ uri: 'b.ts', languageId: 'typescript', text: 'b'.repeat(100) },
			],
			maxTotalChars: 150,
		});
		assert.ok(context2.includes('a.ts'));
		assert.ok(!context2.includes('b.ts'));
	});

	test('empty and whitespace-only files are skipped', () => {
		const context = buildAutocompleteContext({
			currentUri: 'main.ts',
			languageId: 'typescript',
			files: [
				{ uri: 'empty.ts', languageId: 'typescript', text: '' },
				{ uri: 'blank.ts', languageId: 'typescript', text: '  \n\t\n' },
			],
		});
		assert.strictEqual(context, '');
	});

	test('no matching files gives empty context', () => {
		assert.strictEqual(buildAutocompleteContext({ currentUri: 'main.ts', languageId: 'typescript', files: [] }), '');
	});
});