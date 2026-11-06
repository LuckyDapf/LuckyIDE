# Lucky IDE — Изменения / Changelog

> **Русская версия — первая, английская ниже.** / Russian first, English below.

---

## Русский

### Ноябрь 2026

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

- `HTTP-Referer` в запросах к OpenRouter всё ещё указывает на апстрим, поэтому в дашборде OpenRouter запросы атрибутируются старому приложению. Правку этой строки блокирует защита окружения при записи файла.
- Внутренние идентификаторы (`IVoidSettingsService`, `VoidSwitch`, CSS-префикс `void-`, имена файлов, старые ключи хранилища для миграции) оставлены — на пользователя они не влияют, а переименование рискует сломать собранные React-бандлы.
- Дропдаун модели обновляется только после успешного ответа; во время перебора показывается предыдущая модель.
- Перебор моделей работает только в чате; Ctrl+K, Apply, SCM и автокомплит модели не переключают.
- Парсер tree-sitter в поставке — Node-сборка; для рендерера нужна web-сборка, поэтому индексация работает в режиме эвристики.

### 6. Проверки

- `npm run buildreact` — React-бандлы пересобраны.
- `npm run compile` — 0 ошибок TypeScript.
- `npm run gulp vscode-win32-x64` — приложение упаковано.
- Живые тесты на реальном профиле: 423 модели и все пять выбранных моделей пережили принудительное завершение процесса и повторный запуск с открытием папки; при включении режима платная модель автоматически заменилась на бесплатную; пометка `авто` подтверждена на экране.

### 7. Сборка

После `npm run gulp vscode-win32-x64` проверь размер `LuckyIDE.exe` — около 190 МБ. Если шаг упаковки выдал меньший или нерабочий файл, скопируй на его место `.build/electron/LuckyIDE.exe`.

---

## English

### November 2026

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

- `HTTP-Referer` sent to OpenRouter still points to the upstream site, so OpenRouter's dashboard still attributes requests to the old app name. Changing that line is blocked by the build environment's write protection.
- Internal identifiers (`IVoidSettingsService`, `VoidSwitch`, `void-` CSS prefix, file names, legacy storage keys kept for migration) were left as-is — renaming them has no user-visible effect and risks breaking the prebuilt React bundles.
- The model dropdown reflects the switch only after a successful answer; during the fallback chain the previously selected model is still displayed.
- The fallback chain exists only in the chat agent loop; Ctrl+K, Apply, SCM and autocomplete do not switch models.
- The shipped tree-sitter parser is a Node build; the renderer needs a web build, so indexing currently falls back to heuristics.

### 6. Verification

- `npm run buildreact` — React bundles rebuilt.
- `npm run compile` — 0 TypeScript errors.
- `npm run gulp vscode-win32-x64` — packaged.
- Live tests on a real profile: 423 models and all five feature selections survived a forced kill and a relaunch with a folder; a paid model was automatically replaced by a free one when the mode was enabled; the `авто` badge was confirmed on screen.

### 7. Build notes

After `npm run gulp vscode-win32-x64`, verify `LuckyIDE.exe` is ~190 MB. If the packaging step produces a smaller or broken executable, copy `.build/electron/LuckyIDE.exe` over it.

---

## Изменённые файлы / Changed files

| Файл | Что изменено |
|---|---|
| `src/vs/workbench/contrib/void/common/voidSettingsService.ts` | слияние моделей, бэкапы и восстановление, лог ошибок, запрет записи до инициализации, `flush()`, режим free-only, сохранение ответившей модели |
| `src/vs/workbench/contrib/void/common/storageKeys.ts` | новые ключи `lucky.*` и список legacy-ключей для миграции |
| `src/vs/workbench/contrib/void/common/freeModelsMode.ts` | новый модуль: определение бесплатной модели |
| `src/vs/workbench/contrib/void/common/branding.ts` | новый модуль: название и адрес приложения, заголовки для OpenRouter |
| `src/vs/workbench/contrib/void/browser/chatThreadService.ts` | цепочка бесплатных моделей при ошибке, чтение старого ключа истории чатов |
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
