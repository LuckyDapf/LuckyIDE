/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Контекст из других открытых файлов для FIM-автодополнения (Tab).
 * Чистый модуль без зависимостей от VS Code — покрыт тестами.
 */

export type AutocompleteContextFile = {
	uri: string; // fsPath, для сравнения и показа модели
	languageId: string;
	text: string; // начало содержимого файла
}

/** Префикс однострочного комментария для языка; null — контекст не вставляем (разметка, JSON, CSS). */
export const commentPrefixForLanguage = (languageId: string): string | null => {
	switch (languageId) {
		case 'python':
		case 'ruby':
		case 'shellscript':
		case 'yaml':
		case 'perl':
		case 'r':
		case 'dockerfile':
		case 'makefile':
		case 'toml':
			return '#'
		case 'lua':
		case 'sql':
		case 'haskell':
		case 'elm':
		case 'ada':
			return '--'
		case 'clojure':
		case 'lisp':
		case 'scheme':
		case 'racket':
			return ';'
		case 'html':
		case 'xml':
		case 'markdown':
		case 'json':
		case 'jsonc':
		case 'css':
		case 'scss':
		case 'less':
			return null
		default:
			return '//'
	}
}

/**
 * Собирает блок контекста из открытых файлов того же языка.
 * Результат — комментарии, которые добавляются в начало FIM-префикса.
 */
export const buildAutocompleteContext = ({ currentUri, languageId, files, maxFiles = 3, maxCharsPerFile = 1200, maxTotalChars = 4000 }: {
	currentUri: string;
	languageId: string;
	files: AutocompleteContextFile[];
	maxFiles?: number;
	maxCharsPerFile?: number;
	maxTotalChars?: number;
}): string => {
	const comment = commentPrefixForLanguage(languageId)
	if (!comment) return ''

	const parts: string[] = []
	let totalChars = 0
	let nFiles = 0
	for (const file of files) {
		if (nFiles >= maxFiles) break
		if (file.uri === currentUri) continue
		if (file.languageId !== languageId) continue
		const snippet = file.text.replace(/\r\n/g, '\n').slice(0, maxCharsPerFile).trimEnd()
		if (!snippet.trim()) continue
		if (totalChars + snippet.length > maxTotalChars) break
		totalChars += snippet.length
		nFiles += 1
		const commented = snippet.split('\n').map(line => `${comment} ${line}`).join('\n')
		parts.push(`${comment} File: ${file.uri}\n${commented}`)
	}
	if (!parts.length) return ''
	return `${comment} Context from other open files:\n${parts.join('\n')}\n\n`
}