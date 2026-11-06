/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Идентификаторы (ключи) данных в IStorageService.
 *
 * ВАЖНО: менять значение ключа можно ТОЛЬКО вместе с миграцией.
 * Пользовательские данные (настройки моделей, ключи провайдеров, чаты) уже лежат
 * на диске под старыми ключами, поэтому:
 *   1) сначала читаем новый ключ;
 *   2) если его нет — читаем устаревший (LEGACY_*);
 *   3) первая успешная запись переносит данные под новый ключ.
 * Иначе любое переименование = «настройки слетели».
 */

// ---------- настройки моделей / провайдеров / функций ----------

/** Актуальный ключ настроек. */
export const SETTINGS_STORAGE_KEY = 'lucky.settingsServiceStorage';

/** Устаревшие ключи. Только чтение — нужны для миграции данных пользователя. */
export const LEGACY_SETTINGS_STORAGE_KEYS: readonly string[] = [
	'void.settingsServiceStorageII', // 1.0.3 - 1.4.x
	'void.settingsServiceStorage', // до 1.0.3
];

/**
 * Кольцо резервных копий настроек: перед каждой записью актуальное состояние
 * сдвигается на один шаг вниз. Если основное значение не читается (повреждение
 * файла / смена ключа шифрования), состояние восстанавливается из копии.
 */
export const SETTINGS_BACKUP_STORAGE_KEYS: readonly string[] = [
	'lucky.settingsServiceStorage.backup1',
	'lucky.settingsServiceStorage.backup2',
	'lucky.settingsServiceStorage.backup3',
];

/** Сюда складывается нечитаемое значение, чтобы ничего не потерять молча. */
export const SETTINGS_CORRUPT_STORAGE_KEY = 'lucky.settingsServiceStorage.corrupt';

// ---------- история чатов ----------

/** Актуальный ключ истории чатов. */
export const THREAD_STORAGE_KEY = 'lucky.chatThreadStorage';

/** Устаревшие ключи истории чатов. */
export const LEGACY_THREAD_STORAGE_KEYS: readonly string[] = [
	'void.chatThreadStorageII', // 1.0.3 - 1.4.x
	'void.chatThreadStorage', // до 1.0.3
];

// ---------- прочее ----------

/** Отказ от телеметрии. */
export const OPT_OUT_KEY = 'lucky.app.optOutAll';

/** Устаревший ключ отказа от телеметрии (для миграции). */
export const LEGACY_OPT_OUT_KEY = 'void.app.optOutAll';
