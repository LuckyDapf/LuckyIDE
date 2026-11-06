# Lucky IDE

**Русский** · [English below](#english)

Форк редактора [Void](https://github.com/voideditor/void) (который, в свою очередь, форк VS Code) с русским интерфейсом, аккуратной работой с настройками и режимом «только бесплатные модели».

> Не связан с Microsoft и с командой Void. «VS Code» — товарный знак Microsoft, «Void» — проект Glass Devtools.

---

## Русский

### Что это

Полноценный форк VS Code 1.99.3 с ИИ-надстройкой: чат с агентом, быстрое редактирование по `Ctrl+K`, автодополнение, MCP-инструменты. В отличие от апстрима здесь:

- **русский интерфейс** (перевод встроенный, переключается в настройках);
- **настройки не теряются** — при старте список моделей не перезаписывается, есть резервные копии состояния и миграция старых ключей хранилища;
- **режим «Только бесплатные»** — платные модели скрыты, а при ошибке бесплатной модели автоматически берётся следующая; в чате видно, какая модель реально ответила (пометка «авто»).

### Возможности

| Раздел | Что умеет |
|---|---|
| Чат | режимы «Обычный чат», «Сбор» (читает файлы, не меняет), «Агент» (правит файлы, вызывает инструменты) |
| Модели | OpenRouter, OpenAI, Anthropic, Gemini, xAI, Mistral, Groq, DeepSeek; локальные Ollama, vLLM, LM Studio; свой OpenAI-совместимый endpoint |
| Бесплатные модели | переключатель в настройках, авто-перебор до 8 моделей при ошибке, понятное сообщение когда все недоступны |
| Контекст | `@codebase` (индексация кода), `@file`, `@folder`, `Ctrl+L` — добавить выделение в чат |
| Настройки | язык интерфейса, провайдеры и ключи, MCP-серверы, телеметрия (отключаемая) |

### Сборка

Требуется Node.js 20+ и Windows для сборки под Windows.

```bash
npm install
npm run buildreact          # React-бандлы (обязательно после правок UI)
npm run compile             # tsc
npm run gulp vscode-win32-x64   # упаковка в ../VSCode-win32-x64
```

Проверка после упаковки: `LuckyIDE.exe` должен быть ~190 МБ. Если получился меньше — скопируйте `.build/electron/LuckyIDE.exe` поверх.

Основная логика форка — в `src/vs/workbench/contrib/void`.

### Лицензия

Проект составной:

- ядро VS Code — **MIT**, см. [`LICENSE-VS-Code.txt`](LICENSE-VS-Code.txt);
- доработки Void и Lucky IDE — **Apache-2.0**, см. [`LICENSE.txt`](LICENSE.txt) и [`NOTICE`](NOTICE).

Файлы лицензий и уведомлений (`ThirdPartyNotices.txt`, `cglicenses.json`) менять нельзя — это требование лицензий.

### Статус

Проект в активной разработке, API и внутренние идентификаторы могут меняться. Список изменений — в [`CHANGES.md`](CHANGES.md).

---

## English

A fork of the [Void](https://github.com/voideditor/void) editor (itself a VS Code fork) with a Russian UI, reliable settings persistence and a "free models only" mode.

> Not affiliated with Microsoft or the Void team. "VS Code" is a Microsoft trademark; "Void" is a Glass Devtools project.

### What's inside

- Full VS Code 1.99.3 fork with an AI layer: agent chat, `Ctrl+K` quick edit, autocomplete, MCP tools.
- **Russian UI** built in (switchable in settings).
- **Settings no longer reset**: model lists are merged instead of replaced on startup, settings have a rotating backup, and legacy storage keys are migrated.
- **"Free models only"** mode: paid models are hidden, and on an error the next free model is tried automatically; the chat shows which model actually answered (`авто` badge).

### Build

```bash
npm install
npm run buildreact
npm run compile
npm run gulp vscode-win32-x64
```

`LuckyIDE.exe` must be ~190 MB after packaging; if it is smaller, copy `.build/electron/LuckyIDE.exe` over it.

Fork-specific code lives in `src/vs/workbench/contrib/void`.

### License

- VS Code core — **MIT** ([`LICENSE-VS-Code.txt`](LICENSE-VS-Code.txt));
- Void and Lucky IDE changes — **Apache-2.0** ([`LICENSE.txt`](LICENSE.txt), [`NOTICE`](NOTICE)).

### Links

- Issues: https://github.com/LuckyDapf/LuckyIDE/issues
- Changelog: [`CHANGES.md`](CHANGES.md)
