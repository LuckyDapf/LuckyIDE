/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as perf from '../common/performance.js';
import type { ILanguagePacks, INLSConfiguration } from '../../nls.js';

export interface IResolveNLSConfigurationContext {

	/**
	 * Location where `nls.messages.json` and `nls.keys.json` are stored.
	 */
	readonly nlsMetadataPath: string;

	/**
	 * Path to the user data directory. Used as a cache for
	 * language packs converted to the format we need.
	 */
	readonly userDataPath: string;

	/**
	 * Commit of the running application. Can be `undefined`
	 * when not built.
	 */
	readonly commit: string | undefined;

	/**
	 * Locale as defined in `argv.json` or `app.getLocale()`.
	 */
	readonly userLocale: string;

	/**
	 * Locale as defined by the OS (e.g. `app.getPreferredSystemLanguages()`).
	 */
	readonly osLocale: string;
}

export async function resolveNLSConfiguration({ userLocale, osLocale, userDataPath, commit, nlsMetadataPath }: IResolveNLSConfigurationContext): Promise<INLSConfiguration> {
	perf.mark('code/willGenerateNls');

	if (
		process.env['VSCODE_DEV'] ||
		userLocale === 'pseudo' ||
		userLocale.startsWith('en') ||
		!userDataPath
	) {
		return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
	}

	try {
		const languagePacks = await getLanguagePackConfigurations(userDataPath, nlsMetadataPath);
		if (!languagePacks) {
			return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
		}

		const resolvedLanguage = resolveLanguagePackLanguage(languagePacks, userLocale);
		if (!resolvedLanguage) {
			return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
		}

		const languagePack = languagePacks[resolvedLanguage];
		const mainLanguagePackPath = languagePack?.translations?.['vscode'];
		if (
			!languagePack ||
			typeof languagePack.hash !== 'string' ||
			!languagePack.translations ||
			typeof mainLanguagePackPath !== 'string' ||
			!(await exists(mainLanguagePackPath))
		) {
			return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
		}

		const languagePackId = `${languagePack.hash}.${resolvedLanguage}`;
		const globalLanguagePackCachePath = path.join(userDataPath, 'clp', languagePackId);
		const commitLanguagePackCachePath = path.join(globalLanguagePackCachePath, commit || 'unbuilt');
		const languagePackMessagesFile = path.join(commitLanguagePackCachePath, 'nls.messages.json');
		const translationsConfigFile = path.join(globalLanguagePackCachePath, 'tcf.json');
		const languagePackCorruptMarkerFile = path.join(globalLanguagePackCachePath, 'corrupted.info');

		if (await exists(languagePackCorruptMarkerFile)) {
			await fs.promises.rm(globalLanguagePackCachePath, { recursive: true, force: true, maxRetries: 3 }); // delete corrupted cache folder
		}

		const result: INLSConfiguration = {
			userLocale,
			osLocale,
			resolvedLanguage,
			defaultMessagesFile: path.join(nlsMetadataPath, 'nls.messages.json'),
			languagePack: {
				translationsConfigFile,
				messagesFile: languagePackMessagesFile,
				corruptMarkerFile: languagePackCorruptMarkerFile
			},

			// NLS: below properties are a relic from old times only used by vscode-nls and deprecated
			locale: userLocale,
			availableLanguages: { '*': resolvedLanguage },
			_languagePackId: languagePackId,
			_languagePackSupport: true,
			_translationsConfigFile: translationsConfigFile,
			_cacheRoot: globalLanguagePackCachePath,
			_resolvedLanguagePackCoreLocation: commitLanguagePackCachePath,
			_corruptedFile: languagePackCorruptMarkerFile
		};

		if (await exists(commitLanguagePackCachePath)) {
			touch(commitLanguagePackCachePath).catch(() => { }); // We don't wait for this. No big harm if we can't touch
			perf.mark('code/didGenerateNls');
			return result;
		}

		const [
			,
			nlsDefaultKeys,
			nlsDefaultMessages,
			nlsPackdata
		]:
			[unknown, Array<[string, string[]]>, string[], { contents: Record<string, Record<string, string>> }]
			//               ^moduleId ^nlsKeys                               ^moduleId      ^nlsKey ^nlsValue
			= await Promise.all([
				fs.promises.mkdir(commitLanguagePackCachePath, { recursive: true }),
				JSON.parse(await fs.promises.readFile(path.join(nlsMetadataPath, 'nls.keys.json'), 'utf-8')),
				JSON.parse(await fs.promises.readFile(path.join(nlsMetadataPath, 'nls.messages.json'), 'utf-8')),
				JSON.parse(await fs.promises.readFile(mainLanguagePackPath, 'utf-8'))
			]);

		const nlsResult: string[] = [];

		// We expect NLS messages to be in a flat array in sorted order as they
		// where produced during build time. We use `nls.keys.json` to know the
		// right order and then lookup the related message from the translation.
		// If a translation does not exist, we fallback to the default message.

		let nlsIndex = 0;
		for (const [moduleId, nlsKeys] of nlsDefaultKeys) {
			const moduleTranslations = nlsPackdata.contents[moduleId];
			for (const nlsKey of nlsKeys) {
				nlsResult.push(moduleTranslations?.[nlsKey] || nlsDefaultMessages[nlsIndex]);
				nlsIndex++;
			}
		}

		await Promise.all([
			fs.promises.writeFile(languagePackMessagesFile, JSON.stringify(nlsResult), 'utf-8'),
			fs.promises.writeFile(translationsConfigFile, JSON.stringify(languagePack.translations), 'utf-8')
		]);

		perf.mark('code/didGenerateNls');

		return result;
	} catch (error) {
		console.error('Generating translation files failed.', error);
	}

	return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
}

/**
 * The `languagepacks.json` file is a JSON file that contains all metadata
 * about installed language extensions per language. Specifically, for
 * core (`vscode`) and all extensions it supports, it points to the related
 * translation files.
 *
 * The file is updated whenever a new language pack is installed or removed.
 */
async function getLanguagePackConfigurations(userDataPath: string, nlsMetadataPath: string): Promise<ILanguagePacks | undefined> {
	const configFile = path.join(userDataPath, 'languagepacks.json');
	let fromUserData: ILanguagePacks | undefined = undefined;
	try {
		fromUserData = JSON.parse(await fs.promises.readFile(configFile, 'utf-8'));
	} catch (err) {
		// Do nothing. If we can't read the file we have no language pack config.
	}

	// Void (LuckyIDE): язык-пак может поставляться как встроенное расширение.
	// При первом запуске `languagepacks.json` ещё не создан, а в старом профиле
	// он может указывать на уже несуществующий путь, поэтому встроенные пакеты
	// имеют приоритет.
	const builtin = await getBuiltinLanguagePackConfigurations(nlsMetadataPath);
	if (!builtin) {
		return fromUserData;
	}

	return { ...(fromUserData ?? {}), ...builtin };
}

/**
 * Языковые пакеты, которые поставляются вместе с приложением
 * (`<app>/extensions/<id>`). Позволяет включить локализацию ядра
 * без предварительной установки расширения пользователем.
 */
const builtinLanguagePacks = ['ms-ceintl.vscode-language-pack-ru'];

async function getBuiltinLanguagePackConfigurations(nlsMetadataPath: string): Promise<ILanguagePacks | undefined> {
	// `nlsMetadataPath` — папка с nls.messages.json (в собранном приложении это
	// `<app>/out`). В пакете кода `__dirname` недоступен (ESM), поэтому путь к
	// встроенным расширениям вычисляется от него.
	const extensionsPath = path.join(nlsMetadataPath, '..', 'extensions');
	const result: ILanguagePacks = {};

	for (const id of builtinLanguagePacks) {
		try {
			const packageFile = path.join(extensionsPath, id, 'package.json');
			if (!(await exists(packageFile))) {
				continue;
			}

			const pkg = JSON.parse(await fs.promises.readFile(packageFile, 'utf-8'));
			const localizations: {
				languageId?: string;
				languageName?: string;
				localizedLanguageName?: string;
				translations?: { id: string; path: string }[];
			}[] = pkg?.contributes?.localizations ?? [];

			for (const localization of localizations) {
				if (!localization.languageId) {
					continue;
				}

				const translations: Record<string, string> = {};
				for (const translation of localization.translations ?? []) {
					translations[translation.id] = path.join(extensionsPath, id, translation.path);
				}

				result[localization.languageId] = {
					hash: `${id}-${pkg.version}`,
					label: localization.localizedLanguageName ?? localization.languageName,
					extensions: [{ extensionIdentifier: { id }, version: pkg.version }],
					translations,
				};
			}
		} catch (error) {
			console.error(`Reading built-in language pack ${id} failed.`, error);
		}
	}

	return Object.keys(result).length > 0 ? result : undefined;
}

function resolveLanguagePackLanguage(languagePacks: ILanguagePacks, locale: string | undefined): string | undefined {
	try {
		while (locale) {
			if (languagePacks[locale]) {
				return locale;
			}

			const index = locale.lastIndexOf('-');
			if (index > 0) {
				locale = locale.substring(0, index);
			} else {
				return undefined;
			}
		}
	} catch (error) {
		console.error('Resolving language pack configuration failed.', error);
	}

	return undefined;
}

function defaultNLSConfiguration(userLocale: string, osLocale: string, nlsMetadataPath: string): INLSConfiguration {
	perf.mark('code/didGenerateNls');

	return {
		userLocale,
		osLocale,
		resolvedLanguage: 'en',
		defaultMessagesFile: path.join(nlsMetadataPath, 'nls.messages.json'),

		// NLS: below 2 are a relic from old times only used by vscode-nls and deprecated
		locale: userLocale,
		availableLanguages: {}
	};
}

//#region fs helpers

async function exists(path: string): Promise<boolean> {
	try {
		await fs.promises.access(path);

		return true;
	} catch {
		return false;
	}
}

function touch(path: string): Promise<void> {
	const date = new Date();

	return fs.promises.utimes(path, date, date);
}

//#endregion
