/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { combineApplicableRules, parseProjectRuleFile, projectRuleApplies } from '../../common/projectRules.js';

suite('Project Rules', () => {

	test('plain content applies always', () => {
		const rule = parseProjectRuleFile('  Always write tests.  \n');
		assert.strictEqual(rule.body, 'Always write tests.');
		assert.strictEqual(rule.globs, null);
		assert.strictEqual(rule.alwaysApply, true);
		assert.strictEqual(projectRuleApplies(rule, []), true);
	});

	test('frontmatter globs are parsed and quoted values unquoted', () => {
		const rule = parseProjectRuleFile('---\nglobs: "src/**/*.ts", **/*.test.ts\nalwaysApply: false\n---\nUse strict types.');
		assert.deepStrictEqual(rule.globs, ['src/**/*.ts', '**/*.test.ts']);
		assert.strictEqual(rule.alwaysApply, false);
		assert.strictEqual(rule.body, 'Use strict types.');
	});

	test('alwaysApply true overrides globs', () => {
		const rule = parseProjectRuleFile('---\nglobs: **/*.py\nalwaysApply: true\n---\nBody.');
		assert.strictEqual(rule.globs, null);
		assert.strictEqual(rule.alwaysApply, true);
		assert.strictEqual(projectRuleApplies(rule, ['src/main.ts']), true);
	});

	test('description-only frontmatter is stripped and rule applies always', () => {
		const rule = parseProjectRuleFile('---\ndescription: Some rule\n---\nBody text.');
		assert.strictEqual(rule.body, 'Body text.');
		assert.strictEqual(rule.alwaysApply, true);
	});

	test('CRLF frontmatter is supported', () => {
		const rule = parseProjectRuleFile('---\r\nglobs: **/*.rs\r\n---\r\nRust rules.');
		assert.deepStrictEqual(rule.globs, ['**/*.rs']);
		assert.strictEqual(rule.body, 'Rust rules.');
	});

	test('empty globs value means always-apply', () => {
		const rule = parseProjectRuleFile('---\nglobs:\n---\nBody.');
		assert.strictEqual(rule.globs, null);
		assert.strictEqual(projectRuleApplies(rule, []), true);
	});

	test('glob rule matches only matching open files', () => {
		const rule = parseProjectRuleFile('---\nglobs: src/**/*.ts\n---\nTS rules.');
		assert.strictEqual(projectRuleApplies(rule, ['src/app/main.ts']), true);
		assert.strictEqual(projectRuleApplies(rule, ['src/app/main.py']), false);
		assert.strictEqual(projectRuleApplies(rule, []), false);
	});

	test('basename patterns match nested files', () => {
		const rule = parseProjectRuleFile('---\nglobs: *.test.ts\n---\nTest rules.');
		assert.strictEqual(projectRuleApplies(rule, ['src/deep/file.test.ts']), true);
		assert.strictEqual(projectRuleApplies(rule, ['src/deep/file.ts']), false);
	});

	test('windows separators are normalized', () => {
		const rule = parseProjectRuleFile('---\nglobs: **/*.ts\n---\nBody.');
		assert.strictEqual(projectRuleApplies(rule, ['src\\app\\main.ts']), true);
	});

	test('combine filters and joins applicable rules', () => {
		const rules = [
			parseProjectRuleFile('Global rule.'),
			parseProjectRuleFile('---\nglobs: **/*.py\n---\nPython rule.'),
			parseProjectRuleFile('---\nglobs: **/*.ts\n---\nTS rule.'),
		];
		assert.strictEqual(combineApplicableRules(rules, ['main.ts']), 'Global rule.\n\nTS rule.');
		assert.strictEqual(combineApplicableRules(rules, []), 'Global rule.');
	});

	test('empty bodies are skipped', () => {
		const rules = [parseProjectRuleFile('---\nglobs: **/*.ts\n---\n   ')];
		assert.strictEqual(combineApplicableRules(rules, ['main.ts']), '');
	});
});