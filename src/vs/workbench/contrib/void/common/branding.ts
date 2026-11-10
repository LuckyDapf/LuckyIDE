/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Единственное место, где задаётся название продукта и его адрес.
 *
 * Важно: `PRODUCT_SHORT_NAME` обязан совпадать с `nameShort` в product.json —
 * от него зависит путь профиля пользователя (%APPDATA%\<nameShort>). Если они
 * разойдутся, редактор стартует с пустым профилем и «теряет» все настройки.
 */
export const PRODUCT_DISPLAY_NAME = 'Lucky IDE';
export const PRODUCT_SHORT_NAME = 'LuckyIDE';

/**
 * Адрес приложения для внешних сервисов (OpenRouter и т.п.).
 * OpenRouter показывает приложение в разделе Top Apps по этим заголовкам,
 * поэтому здесь должно быть имя/адрес Lucky IDE, а не прежнее название.
 */
export const PRODUCT_APP_URL = 'https://luckyide.dev';

/** Где пользователи скачивают новые версии. */
export const PRODUCT_RELEASES_URL = 'https://github.com/LuckyDapf/LuckyIDE/releases';

/** Заголовки, по которым OpenRouter атрибутирует приложение. */
export const OPENROUTER_APP_HEADERS = {
	'HTTP-Referer': PRODUCT_APP_URL,
	'X-Title': PRODUCT_DISPLAY_NAME,
} as const;
