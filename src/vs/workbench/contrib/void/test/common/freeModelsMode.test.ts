/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isFreeModelSelection, modelSelectionKey } from '../../common/freeModelsMode.js';

suite('Free Models Mode', () => {

	test('local and self-hosted providers are always free', () => {
		for (const provider of ['ollama', 'vLLM', 'lmStudio', 'openAICompatible', 'liteLLM'] as const) {
			assert.strictEqual(isFreeModelSelection(provider, 'any-model'), true, provider);
		}
	});

	test('OpenRouter :free suffix marks free models', () => {
		assert.strictEqual(isFreeModelSelection('openRouter', 'deepseek/deepseek-r1-zero:free'), true);
		assert.strictEqual(isFreeModelSelection('openRouter', 'deepseek/deepseek-r1-zero'), false);
	});

	test('free suffix is case-insensitive', () => {
		assert.strictEqual(isFreeModelSelection('openRouter', 'some/model:FREE'), true);
	});

	test('cloud providers with keys have no free models', () => {
		assert.strictEqual(isFreeModelSelection('openAI', 'gpt-4o'), false);
		assert.strictEqual(isFreeModelSelection('anthropic', 'claude-sonnet-4'), false);
		assert.strictEqual(isFreeModelSelection('gemini', 'gemini-2.5-pro'), false);
	});

	test('model selection key combines provider and model', () => {
		assert.strictEqual(modelSelectionKey('openRouter', 'x:free'), 'openRouter::x:free');
		assert.notStrictEqual(modelSelectionKey('openRouter', 'x'), modelSelectionKey('openAI', 'x'));
	});
});