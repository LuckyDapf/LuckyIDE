# Lucky IDE — Изменения / Changelog

> **Русская версия — первая, английская ниже.** / Russian first, English below.

---

## Русский

### Ноябрь 2026

- **Раунд 2 («лучше Cursor»)**: glob-правила проекта в стиле Cursor (frontmatter `globs:` / `alwaysApply:` в `.md`/`.mdc`), самопроверка агента по диагностикам, контекст из открытых файлов в автодополнении и многострочные подсказки, атрибуция OpenRouter на Lucky IDE, юнит-тесты и CI. Подробнее — раздел 8.
- Правила проекта: исправлено чтение `.voidrules` с диска (раньше файл применялся, только если был открыт в редакторе). Добавлены `.luckyiderules` в корне и папка `.luckyide/rules/*.md` — применяются ко всем запросам, автоматически обновляются при изменении файлов, размер ограничен.
- Добавлена индексация кодовой базы (`codebaseIndexService`, грамматики tree-sitter) и раздел статуса в настройках.
- Исправлено пустое окно при запуске: `tree-sitter.js` (Node/CommonJS-сборка) больше не выполняется при старте — грузится лениво, по требованию, ошибка перехватывается.
- Исправлена пустая панель настроек: сервис индексации добавлен в React-реестр (`ICodebaseIndexService`), а раздел больше не падает, если сервис недоступен.
- Режим «Только бесплатные»: модель, которая реально ответила, сохраняется как текущая и показывается в чате с пометкой `авто`.
- **Ключ аналитики PostHog удалён из исходников**: теперь читается из `LUCKY_POSTHOG_KEY`; без переменной телеметрия полностью выключена.
- Подготовка к публикации: README (русский основной), NOTICE, CONTRIBUTING, SECURITY, шаблоны issue/PR, обновлённый `.gitignore`, удалены 147 логов сборки.

### Коротко

Набор изменений для форка Lucky IDE (база VS Code 1.99.3 / Void 1.4.9): настройки больше не слетают, появился режим «Только бесплатные» с автоматическим перебором бесплатных моделей, проект подготовлен к публикации на GitHub.

### 1. Настройки больше не теряются

| Проблема | Что сделано |
|---|---|
| При каждом старте или перезагрузке окна список моделей заменялся жёстко прописанным | `_stateWithMergedDefaultModels` теперь **дополняет** список недостающими встроенными моделями, а не заменяет его |
| Синхронизация с API (`setSyncedModels`) удаляла модели, которые провайдер не вернул в этот раз | Синхронизация стала **объединением**: сначала новые модели, затем ранее сохранённые |
| Любая ошибка чтения молча уходила в `defaultState()`, и первый же клик записывал дефолты поверх настроек | Ошибки пишутся в лог, нечитаемое значение сохраняется в `lucky.settingsServiceStorage.corrupt`, состояние **не** подменяется дефолтами |
| Резервных копий не было | Кольцо из трёх копий `lucky.settingsServiceStorage.backup1..3`, при нечитаемом основном значении состояние восстанавливается из копии |
| Запись до окончания инициализации могла затереть сохранённые настройки | Запись игнорируется, пока инициализация не завершена |
| При крахе могли потеряться последние изменения | После каждой записи настройки сразу сбрасываются на диск (`flush()`) |

Ключи хранилища переименованы в `lucky.*` **с чтением старых** (`void.settingsServiceStorageII`, `void.chatThreadStorageII`, `void.app.optOutAll`, `void.app.language`, `void.app.machineId*`) — данные пользователя переносятся при первом запуске, а не теряются.

### 2. Режим «Только бесплатные»

- Переключатель в настройках, сразу под строкой выбора языка, с иконкой-молнией.
- Когда включён — платные модели исчезают из всех выпадающих списков; ранее выбранная платная автоматически заменяется на первую доступную бесплатную.
- Бесплатные — модели с суффиксом `:free` (OpenRouter) и локальные/свои провайдеры (Ollama, vLLM, LM Studio, свой OpenAI-совместимый endpoint, LiteLLM).
- В чате при ошибке (404 / 429 / лимит / пустой ответ / 5xx) берётся следующая непробованная бесплатная модель, до 8 моделей за один запрос, с паузой 2.5 с. Ошибки авторизации (401/403, неверный ключ) сразу останавливают перебор.
- Когда все бесплатные модели не ответили, в чат приходит понятное сообщение вместо сырой ошибки.
- Модель, которая реально ответила, сохраняется как текущий выбор, и рядом появляется серая пометка `авто`; при ручном выборе модели пометка исчезает.

### 3. Ребрендинг

- Пользовательские строки: сообщения апдейтера, префиксы ошибок, имена терминалов (`Lucky IDE Agent (N)`), логи метрик.
- `product.json`: `licenseName` приведён к `Apache-2.0`, ссылки ведут на этот репозиторий, `reportIssueUrl` — на наши issues.
- Внешний апдейтер Void больше не вызывается (проверка обновлений в этой сборке отключена).
- Новый `common/branding.ts` — единое место для названия и адреса приложения.
- `nameShort` и `dataFolderName` специально **не** менялись: от них зависит путь профиля (`%APPDATA%\LuckyIDE`), и любое переименование молча создало бы пустой профиль.

### 4. Приватность

- Ключ PostHog больше не хранится в коде: `LUCKY_POSTHOG_KEY` в окружении.
- Без переменной клиент аналитики не создаётся вообще — ни идентификации, ни событий.
- Отказ от телеметрии (`OPT_OUT_KEY`) сохранён и мигрирует со старого ключа.

### 5. Известные ограничения

- Внутренние идентификаторы (`IVoidSettingsService`, `VoidSwitch`, CSS-префикс `void-`, имена файлов, старые ключи хранилища для миграции) оставлены — на пользователя они не влияют, а переименование рискует сломать собранные React-бандлы.
- Дропдаун модели обновляется только после успешного ответа; во время перебора показывается предыдущая модель.
- Перебор моделей работает только в чате; Ctrl+K, Apply, SCM и автокомплит модели не переключают.
- Парсер tree-sitter в поставке — Node-сборка; для рендерера нужна web-сборка, поэтому индексация работает в режиме эвристики.

### 6. Проверки

- `npm run buildreact` — React-бандлы пересобраны.
- `npm run compile` — 0 ошибок TypeScript.
- `npm run test-node` — 4291 тест прошёл, 98 пропущено (pending). Все 26 тестов модулей форка (`projectRules`, `freeModelsMode`, `autocompleteContext`) зелёные. Единственный сбой — апстрим-тест Kerberos в `vs/platform/request`: он принимает только английские тексты ошибок SSPI, а на русской Windows они локализованы; к изменениям форка отношения не имеет.
- `npm run gulp vscode-win32-x64` — приложение упаковано.
- Упакованное приложение запускается без ошибок в логе; `LuckyIDE.exe` — 190 632 960 байт; весь новый код подтверждён в бандлах (`workbench.desktop.main.js` и `main.js`).
- Живые тесты на реальном профиле: 423 модели и все пять выбранных моделей пережили принудительное завершение процесса и повторный запуск с открытием папки; при включении режима платная модель автоматически заменилась на бесплатную; пометка `авто` подтверждена на экране.

### 7. Сборка

После `npm run gulp vscode-win32-x64` проверь размер `LuckyIDE.exe` — около 190 МБ. Если шаг упаковки выдал меньший или нерабочий файл, скопируй на его место `.build/electron/LuckyIDE.exe`.

### 8. Раунд 2: улучшения по дорожной карте «лучше Cursor»

**Glob-правила проекта (как в Cursor).** Файлы в `.luckyide/rules/` (`.md` и `.mdc`) поддерживают frontmatter:

```
---
globs: src/**/*.ts, **/*.test.ts
alwaysApply: false
---
Текст правила…
```

Правило с `globs:` попадает в запрос, только если среди открытых в редакторе файлов есть подходящие под шаблон (glob-парсер VS Code, шаблоны в стиле Cursor). `alwaysApply: true` включает правило всегда; без frontmatter правило тоже применяется всегда. Логика вынесена в чистый модуль `common/projectRules.ts` и покрыта тестами.

**Самопроверка агента по диагностикам.** В режиме Agent после финального ответа модели IDE проверяет ошибки (Error) языковых серверов во всех файлах, которые агент изменил в этом запросе. Если ошибки остались, агент автоматически получает отчёт и продолжает работу — до 2 раундов. В чате это видно как сообщение «Самопроверка: найдены ошибки…». Ошибки, существовавшие до правок, модель должна игнорировать.

**Автодополнение (Tab).**
- Контекст из других открытых файлов того же языка (до 3 файлов, начало файла, с лимитом размера) добавляется в FIM-запрос комментариями — подсказки знают о соседних модулях. Для Python/shell используется `#`, для SQL/Lua `--`, для разметки и JSON контекст не вставляется.
- На пустой строке после строки, открывающей блок (`{`, `(`, `:`, `=>`, `,`, `=`), теперь генерируется многострочное продолжение, а не одна строка.
- Исправлен баг Windows: внутренний разделитель строк был `\r\n`, хотя текст всегда нормализован в `\n` — из-за этого разбиение на строки и кэш многострочных подсказок работали неправильно.
- Убраны отладочные `console.log` из провайдера подсказок.

**Атрибуция OpenRouter.** Заголовки `HTTP-Referer` / `X-Title` теперь берутся из `common/branding.ts` и указывают на Lucky IDE — запросы видны в дашборде OpenRouter под нашим приложением. Ссылки апдейтера ведут на страницу релизов Lucky IDE, а не на voideditor.com.

**Тесты и CI.** Юнит-тесты логики форка (`test/common/projectRules.test.ts`, `freeModelsMode.test.ts`, `autocompleteContext.test.ts`) и workflow GitHub Actions (`.github/workflows/ci.yml`): Windows, Node 20.18.3, `npm ci` → `buildreact` → `compile` → `test-node` на каждый push и PR в `main`.

---

## English

### November 2026

- **Round 2 ("better than Cursor")**: Cursor-style glob project rules (`globs:` / `alwaysApply:` frontmatter in `.md`/`.mdc`), agent self-check against language-server diagnostics, open-file context and multi-line suggestions in autocomplete, OpenRouter attribution for Lucky IDE, unit tests and CI. Details in section 8.
- Project rules: fixed `.voidrules` being read from disk (previously it only applied when the file happened to be open in an editor). Added `.luckyiderules` in the workspace root and a `.luckyide/rules/*.md` folder — applied to all requests, refreshed automatically on file changes, size-capped.
- Added codebase indexing (`codebaseIndexService`, tree-sitter grammars) with a status section in settings.
- Fixed the blank window on startup: `tree-sitter.js` (a Node/CommonJS build) is no longer evaluated at boot — it loads lazily, on demand, with error handling.
- Fixed the blank settings pane: the indexing service is registered in the React accessor (`ICodebaseIndexService`) and the section tolerates a missing service.
- "Free models only": the model that actually answered is persisted and shown in the chat with an `авто` badge.
- **The PostHog analytics key is removed from the sources**: it now comes from `LUCKY_POSTHOG_KEY`; without it, telemetry is fully disabled.
- GitHub readiness: README (Russian first), NOTICE, CONTRIBUTING, SECURITY, issue/PR templates, updated `.gitignore`, 147 build logs removed.

### Summary

Changes for the Lucky IDE fork (VS Code 1.99.3 / Void 1.4.9 base) that fix settings loss, add a "free models only" mode with automatic fallback between free models, and prepare the repository for publication.

### 1. Settings are no longer lost

| Problem | Fix |
|---|---|
| Every workbench start/reload replaced the whole model list with the hardcoded one | `_stateWithMergedDefaultModels` now **merges** (adds missing built-ins) instead of replacing |
| API sync (`setSyncedModels`) deleted models the provider didn't return | Sync is now a **union**: new models first, previously known ones kept |
| Any read error silently fell back to `defaultState()` and was then persisted over the user's data | Errors are logged, the unreadable blob is preserved under `lucky.settingsServiceStorage.corrupt`, and the state is **not** replaced with defaults |
| No backups | 3-slot backup ring `lucky.settingsServiceStorage.backup1..3`, restored automatically if the primary value can't be read |
| Writes before init finished could overwrite stored settings | Writes are ignored until initialization completes |
| A crash could lose the last write | Storage is flushed to disk (`flush()`) after every settings write |

Storage keys were renamed to `lucky.*` **with a legacy read path** (`void.settingsServiceStorageII`, `void.chatThreadStorageII`, `void.app.optOutAll`, `void.app.language`, `void.app.machineId*`), so existing user data is migrated on first launch instead of being lost.

### 2. "Free models only" mode

- Toggle in Settings, placed right under the interface-language row, with a lightning icon.
- When enabled, paid models disappear from every model dropdown; a previously selected paid model is replaced with the first available free one.
- Free = `:free` suffix (OpenRouter) or a local/self-hosted provider (Ollama, vLLM, LM Studio, custom OpenAI-compatible endpoint, LiteLLM).
- Chat: on error (404 / 429 / limit / empty response / 5xx) the next untried free model is used, up to 8 models per request, 2.5 s apart. Auth errors (401/403, invalid key) stop the chain immediately.
- When every free model fails, the chat shows a clear message instead of a raw error.
- The model that actually answered is persisted as the current selection, and a small muted `авто` badge appears next to it; the badge clears as soon as the user picks a model manually.

### 3. Rebranding

- User-visible strings: updater messages, error prefixes, terminal names (`Lucky IDE Agent (N)`), metrics logs.
- `product.json`: `licenseName` is `Apache-2.0`, links point to this repository, `reportIssueUrl` to our issues.
- The external Void updater endpoint is no longer called (update checks are disabled in this build).
- New `common/branding.ts` — single source for the product name and app URL.
- `nameShort` / `dataFolderName` were intentionally **not** changed: they define the user profile path (`%APPDATA%\LuckyIDE`), and any rename would silently create an empty profile.

### 4. Privacy

- The PostHog key is no longer stored in code: `LUCKY_POSTHOG_KEY` comes from the environment.
- Without the variable no analytics client is created at all — no identify call, no events.
- The telemetry opt-out (`OPT_OUT_KEY`) is preserved and migrates from the legacy key.

### 5. Known limitations

- Internal identifiers (`IVoidSettingsService`, `VoidSwitch`, `void-` CSS prefix, file names, legacy storage keys kept for migration) were left as-is — renaming them has no user-visible effect and risks breaking the prebuilt React bundles.
- The model dropdown reflects the switch only after a successful answer; during the fallback chain the previously selected model is still displayed.
- The fallback chain exists only in the chat agent loop; Ctrl+K, Apply, SCM and autocomplete do not switch models.
- The shipped tree-sitter parser is a Node build; the renderer needs a web build, so indexing currently falls back to heuristics.

### 6. Verification

- `npm run buildreact` — React bundles rebuilt.
- `npm run compile` — 0 TypeScript errors.
- `npm run test-node` — 4291 tests passing, 98 pending. All 26 fork-module tests (`projectRules`, `freeModelsMode`, `autocompleteContext`) are green. The only failure is the upstream Kerberos test in `vs/platform/request`: it accepts only English SSPI error strings, which are localized on Russian Windows; unrelated to the fork changes.
- `npm run gulp vscode-win32-x64` — packaged.
- The packaged app boots with no errors in the log; `LuckyIDE.exe` is 190,632,960 bytes; all new code was verified in the bundles (`workbench.desktop.main.js` and `main.js`).
- Live tests on a real profile: 423 models and all five feature selections survived a forced kill and a relaunch with a folder; a paid model was automatically replaced by a free one when the mode was enabled; the `авто` badge was confirmed on screen.

### 7. Build notes

After `npm run gulp vscode-win32-x64`, verify `LuckyIDE.exe` is ~190 MB. If the packaging step produces a smaller or broken executable, copy `.build/electron/LuckyIDE.exe` over it.

### 8. Round 2: "better than Cursor" roadmap improvements

**Glob project rules (Cursor-style).** Files in `.luckyide/rules/` (`.md` and `.mdc`) support frontmatter:

```
---
globs: src/**/*.ts, **/*.test.ts
alwaysApply: false
---
Rule text…
```

A rule with `globs:` is included in a request only when at least one file open in an editor matches the pattern (VS Code's glob parser, Cursor-style patterns). `alwaysApply: true` always includes the rule; rules without frontmatter always apply too. The logic lives in the pure module `common/projectRules.ts` and is covered by tests.

**Agent self-check via diagnostics.** In Agent mode, after the model's final answer the IDE checks Error-severity language-server diagnostics in every file the agent edited during the request. If errors remain, the agent automatically receives a report and keeps working — up to 2 rounds. This appears in the chat as a "Самопроверка…" message. The model is instructed to ignore pre-existing, unrelated errors.

**Autocomplete (Tab).**
- Context from other open files of the same language (up to 3 files, file beginnings, size-capped) is added to the FIM request as comments, so suggestions know about neighboring modules. Python/shell use `#`, SQL/Lua use `--`; markup and JSON get no injected context.
- On an empty line following a block-opening line (`{`, `(`, `:`, `=>`, `,`, `=`), a multi-line continuation is generated instead of a single line.
- Fixed a Windows bug: the internal line separator was `\r\n` while all text is LF-normalized, which broke line splitting and the multi-line suggestion cache.
- Removed debug `console.log` calls from the completion provider.

**OpenRouter attribution.** `HTTP-Referer` / `X-Title` headers now come from `common/branding.ts` and point to Lucky IDE, so requests show under our app in the OpenRouter dashboard. Updater links point to the Lucky IDE releases page instead of voideditor.com.

**Tests and CI.** Unit tests for the fork logic (`test/common/projectRules.test.ts`, `freeModelsMode.test.ts`, `autocompleteContext.test.ts`) and a GitHub Actions workflow (`.github/workflows/ci.yml`): Windows, Node 20.18.3, `npm ci` → `buildreact` → `compile` → `test-node` on every push and PR to `main`.

---

## Изменённые файлы / Changed files

| Файл | Что изменено |
|---|---|
| `src/vs/workbench/contrib/void/common/voidSettingsService.ts` | слияние моделей, бэкапы и восстановление, лог ошибок, запрет записи до инициализации, `flush()`, режим free-only, сохранение ответившей модели |
| `src/vs/workbench/contrib/void/common/storageKeys.ts` | новые ключи `lucky.*` и список legacy-ключей для миграции |
| `src/vs/workbench/contrib/void/common/freeModelsMode.ts` | новый модуль: определение бесплатной модели |
| `src/vs/workbench/contrib/void/common/branding.ts` | новый модуль: название и адрес приложения, заголовки для OpenRouter |
| `src/vs/workbench/contrib/void/browser/chatThreadService.ts` | цепочка бесплатных моделей при ошибке, чтение старого ключа истории чатов, самопроверка агента по диагностикам (до 2 раундов) |
| `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts` | чтение правил с диска, `.luckyiderules` и `.luckyide/rules/` (`.md`/`.mdc`), glob-применимость к открытым файлам, кэш с автообновлением |
| `src/vs/workbench/contrib/void/common/projectRules.ts` | новый модуль: парсинг frontmatter (`globs`, `alwaysApply`) и glob-сопоставление правил |
| `src/vs/workbench/contrib/void/common/autocompleteContext.ts` | новый модуль: контекст из открытых файлов для FIM-автодополнения |
| `src/vs/workbench/contrib/void/browser/autocompleteService.ts` | контекст открытых файлов, многострочные подсказки после открывающих блок строк, фикс разделителя строк Windows, удалены отладочные логи |
| `src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts` | заголовки атрибуции OpenRouter из branding.ts |
| `src/vs/workbench/contrib/void/browser/voidUpdateActions.ts` | ссылки апдейтера на релизы Lucky IDE |
| `src/vs/workbench/contrib/void/test/common/*.test.ts` | юнит-тесты: правила проекта, free-режим, контекст автодополнения |
| `.github/workflows/ci.yml` | CI: сборка React, компиляция, тесты (Windows, Node 20.18.3) |
| `src/vs/workbench/contrib/void/browser/react/src/util/i18nRu.ts` | переводы строк правил проекта и тултипов чекпоинтов |
| `src/vs/workbench/contrib/void/browser/treeSitter/wrapper.ts` | ленивая загрузка tree-sitter с перехватом ошибки |
| `src/vs/workbench/contrib/void/browser/codebaseIndexService.ts` | безопасное использование tree-sitter, фолбэк на эвристику |
| `src/vs/workbench/contrib/void/browser/react/src/util/services.tsx` | сервис индексации добавлен в React-реестр |
| `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx` | переключатель «Только бесплатные» под строкой языка, защита раздела индексации |
| `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/ModelDropdown.tsx` | пометка `авто` рядом с названием модели |
| `src/vs/workbench/contrib/void/electron-main/metricsMainService.ts` | ключ PostHog вынесен в переменную окружения, миграция ключей телеметрии |
| `src/vs/workbench/contrib/void/electron-main/voidUpdateMainService.ts` | убраны сообщения и ссылки Void, внешний апдейтер отключён |
| `src/vs/workbench/contrib/void/browser/terminalToolService.ts`, `editCodeService.ts` | имена терминала и текст ошибок |
| `product.json`, `package.json` | лицензия, домены, ссылки на репозиторий |
| `README.md`, `NOTICE`, `CONTRIBUTING.md`, `SECURITY.md`, `.github/**`, `.gitignore` | подготовка репозитория к публикации |
