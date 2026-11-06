import { ILogService } from '../../../../../platform/log/common/log.js';

/**
 * Ленивая загрузка tree-sitter.
 *
 * `tree-sitter.js` собран как CommonJS/emscripten-модуль. Когда он импортировался
 * статически, его код выполнялся при загрузке воркбенча и падал с
 * `TypeError: Cannot set properties of undefined (setting 'TreeSitter')`,
 * из-за чего всё окно оставалось пустым. Теперь модуль грузится только в момент,
 * когда индексации реально нужен парсер, а ошибка ловится на месте вызова.
 */
let implPromise: Promise<any> | null = null;

export const loadTreeSitter = async (): Promise<any> => {
	if (!implPromise) {
		implPromise = import('./tree-sitter.js').then((m: any) => m.default ?? m);
	}
	return implPromise;
};

/** Безопасная версия: возвращает null вместо исключения. */
export const tryLoadTreeSitter = async (logService?: ILogService): Promise<any | null> => {
	try {
		return await loadTreeSitter();
	} catch (e) {
		logService?.warn('[Lucky IDE] tree-sitter недоступен, индексация перейдёт на эвристику', e);
		implPromise = null; // дать шанс на повторную попытку после исправления сборки
		return null;
	}
};
