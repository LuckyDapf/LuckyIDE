/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../../../editor/browser/editorExtensions.js';
import { ruDictionary } from './i18nRu.js';
import { getVoidLanguage, setVoidLanguage } from '../../../../common/voidLanguage.js';

/**
 * Translates every text node / attribute that renders inside Void's React roots
 * (elements carrying the `void-scope` class). Applied on mount and on every DOM
 * change, so new UI (menus, toasts, streamed messages) is translated as well.
 */

const SCOPE_SELECTOR = '[class*="void-scope"]';
const ATTRS = ['placeholder', 'title', 'aria-label', 'data-tooltip-content'];

let installed = false;
let currentLang: 'en' | 'ru' = 'en';
let observer: MutationObserver | undefined;

const originalText = new Map<Text, string>();
const originalAttr = new Map<Element, Map<string, string>>();

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

const RU_ENTRIES = Object.entries(ruDictionary).sort((a, b) => b[0].length - a[0].length);

/** Динамические строки: «1024 tokens», «3 files» и т.п. */
const DYNAMIC_RULES: [RegExp, string][] = [
	[/^(\d[\d\s,.]*)\s+tokens$/i, '$1 токенов'],
	[/^(\d[\d\s,.]*)\s+token$/i, '$1 токен'],
	[/^(\d[\d\s,.]*)\s+files?$/i, '$1 файл(ов)'],
	[/^(\d[\d\s,.]*)\s+lines?$/i, '$1 строк'],
	// плейсхолдер поля ввода в чате: «@ to mention, CTRL+L to add a selection. Enter instructions...»
	[/^@ to mention,\s*(.+?)\s+to add a selection\.\s*Enter instructions\.\.\.$/i, 'Упомяните файл через @, $1 — чтобы добавить выделение. Введите задачу...'],
	[/^@ to mention,\s*Enter instructions\.\.\.$/i, 'Упомяните файл через @. Введите задачу...'],
];

const translateValue = (raw: string): string | undefined => {
	const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
	if (!m) return undefined;
	const [, lead, core, trail] = m;
	const key = normalize(core);
	if (!key) return undefined;

	// динамические строки с числами
	for (const [re, replacement] of DYNAMIC_RULES) {
		if (re.test(key)) {
			return lead + key.replace(re, replacement) + trail;
		}
	}

	// точное совпадение — сохраняем пробелы по краям (важно для склеек вида "Add {name}")
	const direct = ruDictionary[key];
	if (direct) return lead + direct + trail;

	// подстрочная замена только для длинных фраз, чтобы не портить короткие слова
	let out = raw;
	let changed = false;
	for (const [en, ru] of RU_ENTRIES) {
		if (en.length < 25) continue;
		if (out.includes(en)) {
			out = out.split(en).join(ru);
			changed = true;
		}
	}
	return changed ? out : undefined;
};

const translateTextNode = (node: Text) => {
	const parent = node.parentElement;
	if (!parent || !parent.closest(SCOPE_SELECTOR)) return;

	const value = node.nodeValue;
	if (!value || !value.trim()) return;

	if (currentLang === 'en') {
		const original = originalText.get(node);
		if (original !== undefined && node.nodeValue !== original) node.nodeValue = original;
		return;
	}

	const translated = translateValue(value);
	if (!translated || translated === value) return;
	if (!originalText.has(node)) originalText.set(node, value);
	node.nodeValue = translated;
};

const translateAttributes = (el: Element) => {
	if (currentLang === 'en') {
		const saved = originalAttr.get(el);
		if (saved) {
			for (const [name, value] of saved) {
				if (el.getAttribute(name) !== value) el.setAttribute(name, value);
			}
		}
		return;
	}

	for (const name of ATTRS) {
		const value = el.getAttribute(name);
		if (!value || !value.trim()) continue;
		const translated = translateValue(value);
		if (!translated || translated === value) continue;
		let saved = originalAttr.get(el);
		if (!saved) { saved = new Map(); originalAttr.set(el, saved); }
		if (!saved.has(name)) saved.set(name, value);
		el.setAttribute(name, translated);
	}
};

const translateContainer = (root: Element) => {
	if (currentLang === 'en') {
		root.querySelectorAll('*').forEach(translateAttributes);
	} else {
		root.querySelectorAll('*').forEach(translateAttributes);
	}

	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let node: Node | null = walker.nextNode();
	while (node) {
		translateTextNode(node as Text);
		node = walker.nextNode();
	}
};

let scheduled = false;
const schedule = () => {
	if (scheduled) return;
	scheduled = true;
	setTimeout(() => {
		scheduled = false;
		runTranslation();
	}, 40);
};

const runTranslation = () => {
	if (typeof document === 'undefined') return;
	// на английском переводить нечего — только один раз восстанавливаем исходные тексты
	if (currentLang === 'en' && originalText.size === 0 && originalAttr.size === 0) return;
	const roots = document.querySelectorAll(SCOPE_SELECTOR);
	if (!roots.length) return;
	roots.forEach(translateContainer);
};

const readLanguage = (): 'en' | 'ru' => getVoidLanguage();

export const installVoidAutoTranslate = (_accessor: ServicesAccessor) => {
	if (installed || typeof document === 'undefined') return;
	installed = true;

	currentLang = readLanguage();
	setVoidLanguage(currentLang);

	observer = new MutationObserver(() => schedule());
	observer.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
		attributeFilter: ATTRS,
	});

	runTranslation();
};

export const disposeVoidAutoTranslate = () => {
	observer?.disconnect();
	observer = undefined;
	installed = false;
};
