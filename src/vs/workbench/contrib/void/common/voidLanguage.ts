/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { ILocalizedString } from '../../../../nls.js';

/**
 * Язык интерфейса самого Lucky IDE.
 *
 * Тексты, которые регистрируются в VS Code (заголовки вкладок, команд, меню,
 * уведомления), попадают в реестр до отрисовки, поэтому их нельзя перевести
 * на уровне DOM. Для них используется `vloc(en, ru)`.
 *
 * Значение по умолчанию — русский; после старта оно синхронизируется с
 * настройкой `void.app.language` (см. `installVoidAutoTranslate`).
 */
export type VoidLanguage = 'en' | 'ru';

const readInitialLanguage = (): VoidLanguage => {
	// Главный процесс выставляет Chromium-локаль (`--lang`) из выбранного языка,
	// поэтому `navigator.language` уже содержит нужное значение при загрузке вкладок.
	const locale = typeof navigator !== 'undefined' ? (navigator.language || '') : '';
	return locale.toLowerCase().startsWith('en') ? 'en' : 'ru';
};

let currentLanguage: VoidLanguage = readInitialLanguage();

export const setVoidLanguage = (language: VoidLanguage): void => {
	currentLanguage = language;
};

export const getVoidLanguage = (): VoidLanguage => currentLanguage;

export const vloc = (en: string, ru: string): ILocalizedString => {
	const value = currentLanguage === 'ru' ? ru : en;
	return { value, original: value };
};
