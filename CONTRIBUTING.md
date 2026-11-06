# Как помочь проекту · Contributing

**Русский** · [English below](#english)

## Русский

### Что можно делать

- Исправления ошибок и доработки интерфейса.
- Переводы и правки русских текстов.
- Новые провайдеры моделей, инструменты агента, MCP-интеграции.
- Документация: README, примеры, разборы.

### Где живёт код

Почти всё, что относится к форку, находится в `src/vs/workbench/contrib/void`:

| Папка | Что там |
|---|---|
| `common/` | настройки, модели, промпты, общие типы |
| `browser/` | чат, сервисы, React-интерфейс (`browser/react/src`) |
| `electron-main/` | отправка запросов к LLM, обновления, метрики |

Остальное — ядро VS Code; трогать его без необходимости не стоит.

### Сборка и проверка

```bash
npm install
npm run buildreact      # после любых правок в browser/react/src
npm run compile         # должно быть 0 ошибок
npm run gulp vscode-win32-x64
```

Правила:

1. Правки в React-интерфейсе **всегда** сопровождаются `npm run buildreact`, иначе изменения не попадут в сборку.
2. Перед pull request — `npm run compile` без ошибок.
3. После упаковки проверьте размер `LuckyIDE.exe` (~190 МБ).
4. Не меняйте ключи хранилища и идентификаторы сервисов без миграции — это ломает настройки пользователей.

### Pull request

- Одна задача — один PR, короткое описание «что и зачем».
- Для UI приложите скриншот до/после.
- Не коммитьте `out/`, `node_modules/`, `*.log` — они в `.gitignore`.

### Лицензия вклада

Отправляя PR, вы соглашаетесь, что ваш код распространяется по Apache-2.0 (см. `LICENSE.txt`).

---

## English

### Scope

Bug fixes, UI work, translations, new model providers, agent tools, MCP integrations and documentation.

### Where the code lives

Fork-specific code is under `src/vs/workbench/contrib/void`:

- `common/` — settings, models, prompts, shared types;
- `browser/` — chat, services, React UI (`browser/react/src`);
- `electron-main/` — LLM requests, updates, metrics.

Everything else is VS Code core; avoid touching it unless necessary.

### Build & checks

```bash
npm install
npm run buildreact      # required after any change in browser/react/src
npm run compile         # must finish with 0 errors
npm run gulp vscode-win32-x64
```

Rules:

1. Always run `npm run buildreact` after UI changes, otherwise the bundle stays old.
2. `npm run compile` must pass before a pull request.
3. Verify `LuckyIDE.exe` is ~190 MB after packaging.
4. Never change storage keys or service identifiers without a migration — it breaks user settings.

### Pull requests

- One task per PR, short "what and why" description.
- Attach before/after screenshots for UI changes.
- Do not commit `out/`, `node_modules/` or `*.log` — they are gitignored.

### Contribution license

By submitting a PR you agree that your code is distributed under Apache-2.0 (see `LICENSE.txt`).
