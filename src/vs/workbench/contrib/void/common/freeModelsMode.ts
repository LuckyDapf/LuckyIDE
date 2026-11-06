/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { ProviderName } from './voidSettingsTypes.js';

/**
 * Провайдеры, работающие локально или на своём железе пользователя:
 * их запросы ничего не стоят, поэтому в режиме «только бесплатные» они считаются free.
 */
const FREE_BY_DEFAULT_PROVIDERS: readonly ProviderName[] = [
	'ollama',
	'vLLM',
	'lmStudio',
	'openAICompatible', // свой endpoint
	'liteLLM', // свой шлюз
];

/**
 * Бесплатная ли модель у провайдера.
 *
 * У OpenRouter бесплатные модели помечены суффиксом `:free` (например
 * `deepseek/deepseek-r1-zero:free`). У облачных провайдеров с ключом (OpenAI,
 * Anthropic, Gemini, xAI, Mistral, Groq) бесплатных моделей нет.
 */
export const isFreeModelSelection = (providerName: ProviderName, modelName: string): boolean => {
	if (FREE_BY_DEFAULT_PROVIDERS.includes(providerName)) return true;
	return modelName.toLowerCase().endsWith(':free');
};

/** Ключ модели для сравнения «провайдер + модель». */
export const modelSelectionKey = (providerName: ProviderName, modelName: string): string =>
	`${providerName}::${modelName}`;
