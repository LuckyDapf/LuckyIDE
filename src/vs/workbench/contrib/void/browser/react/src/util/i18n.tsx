/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useCallback } from 'react';
import { useAccessor } from './services.js';
import { getVoidLanguage, VoidLanguage } from '../../../../common/voidLanguage.js';
import { StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../../../base/common/resources.js';

/**
 * Файл в профиле пользователя, который читает главный процесс при старте,
 * чтобы выбрать язык всего приложения (ядро + UI).
 */
export const VOID_LANGUAGE_FILE = 'lucky-ide-language.json';

/**
 * Interface language of Void's own UI (sidebar, settings, onboarding).
 * VS Code's built-in UI is not affected by this setting.
 */
export type { VoidLanguage };

export const LANGUAGE_STORAGE_KEY = 'lucky.app.language';

export const voidLanguageLabels: Record<VoidLanguage, string> = {
	en: 'English',
	ru: 'Русский',
};

const dictionary = {
	'settings.title': { en: `Lucky IDE's Settings`, ru: 'Настройки Lucky IDE' },
	'language.label': { en: 'Language', ru: 'Язык' },
	'language.hint': { en: `Language of Lucky IDE's interface`, ru: 'Язык интерфейса Lucky IDE' },
	'freeOnly.label': { en: 'Free models only', ru: 'Только бесплатные' },
	'freeOnly.hint': { en: 'Paid models are ignored; on error the next free model is used', ru: 'Платные игнорируются, при ошибке берётся следующая бесплатная' },

	'nav.models': { en: 'Models', ru: 'Модели' },
	'nav.localProviders': { en: 'Local Providers', ru: 'Локальные провайдеры' },
	'nav.providers': { en: 'Main Providers', ru: 'Основные провайдеры' },
	'nav.featureOptions': { en: 'Feature Options', ru: 'Возможности' },
	'nav.general': { en: 'General', ru: 'Общие' },
	'nav.mcp': { en: 'MCP', ru: 'MCP' },
	'nav.all': { en: 'All Settings', ru: 'Все настройки' },

	'general.oneClickTitle': { en: 'One-Click Switch', ru: 'Перенос из другого редактора' },
	'general.oneClickDesc': { en: 'Transfer your editor settings into Lucky IDE.', ru: 'Перенесите настройки вашего редактора в Lucky IDE.' },
	'general.importExportTitle': { en: 'Import/Export', ru: 'Импорт и экспорт' },
	'general.importExportDesc': { en: `Transfer Lucky IDE's settings and chats in and out of Lucky IDE.`, ru: 'Перенос настроек и чатов Lucky IDE в файл и обратно.' },
	'general.importSettings': { en: 'Import Settings', ru: 'Импорт настроек' },
	'general.exportSettings': { en: 'Export Settings', ru: 'Экспорт настроек' },
	'general.resetSettings': { en: 'Reset Settings', ru: 'Сбросить настройки' },
	'general.importChats': { en: 'Import Chats', ru: 'Импорт чатов' },
	'general.exportChats': { en: 'Export Chats', ru: 'Экспорт чатов' },
	'general.resetChats': { en: 'Reset Chats', ru: 'Сбросить чаты' },
	'general.builtInTitle': { en: 'Built-in Settings', ru: 'Встроенные настройки' },
	'general.builtInDesc': { en: 'IDE settings, keyboard settings, and theme customization.', ru: 'Настройки IDE, горячие клавиши и оформление.' },
	'general.generalSettings': { en: 'General Settings', ru: 'Общие настройки' },
	'general.keyboardSettings': { en: 'Keyboard Settings', ru: 'Горячие клавиши' },
	'general.themeSettings': { en: 'Theme Settings', ru: 'Тема' },
	'general.openLogs': { en: 'Open Logs', ru: 'Открыть логи' },
	'general.metricsTitle': { en: 'Metrics', ru: 'Метрики' },
	'general.aiInstructionsTitle': { en: 'AI Instructions', ru: 'Инструкции для ИИ' },
	'general.reimportedSettings': { en: 'Settings imported successfully!', ru: 'Настройки успешно импортированы!' },
	'general.reimportedChats': { en: 'Chats imported successfully!', ru: 'Чаты успешно импортированы!' },

	'sidebar.settings': { en: 'Settings', ru: 'Настройки' },
} as const;

export type I18nKey = keyof typeof dictionary;

export const translate = (lang: VoidLanguage, key: I18nKey): string => {
	const entry = dictionary[key];
	if (!entry) return key;
	return (lang === 'ru' ? entry.ru : entry.en) || entry.en;
};

/** Reads the persisted Void UI language and re-renders when it changes. */
export const useLanguage = (): VoidLanguage => {
	// единственный источник истины — язык, выбранный при старте приложения
	return getVoidLanguage();
};

export const useSetLanguage = () => {
	const accessor = useAccessor();
	const storageService = accessor.get('IStorageService');
	return useCallback((language: VoidLanguage) => {
		storageService.store(LANGUAGE_STORAGE_KEY, language, StorageScope.APPLICATION, StorageTarget.USER);
	}, [storageService]);
};

/** Translation helper: const t = useT(); t('nav.models') */
export const useT = () => {
	const language = useLanguage();
	return useCallback((key: I18nKey) => translate(language, key), [language]);
};

/**
 * Переключает язык всего приложения: запоминает выбор в хранилище и в файле
 * профиля, затем перезагружает окно (язык ядра выбирается только при старте).
 */
export const useSwitchLanguage = () => {
	const accessor = useAccessor();
	const setLanguage = useSetLanguage();

	return useCallback(async (language: VoidLanguage) => {
		setLanguage(language);

		try {
			const environmentService = accessor.get('IEnvironmentService');
			const fileService = accessor.get('IFileService');

			const uri = joinPath(URI.file(environmentService.userDataPath), VOID_LANGUAGE_FILE);
			await fileService.writeFile(uri, VSBuffer.fromString(JSON.stringify({ language }, null, '\t')));

			// Язык ядра выбирается в главном процессе при запуске, поэтому
			// перезагрузки окна недостаточно — перезапускаем всё приложение.
			try {
				accessor.get('INativeHostService').relaunch();
			} catch {
				accessor.get('ICommandService').executeCommand('workbench.action.reloadWindow');
			}
		} catch (error) {
			console.error('Не удалось сохранить язык интерфейса', error);
		}
	}, [accessor, setLanguage]);
};
