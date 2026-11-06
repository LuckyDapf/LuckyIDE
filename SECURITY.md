# Политика безопасности · Security Policy

## Русский

### Как сообщить об уязвимости

Не открывайте публичный issue, если проблема связана с безопасностью. Используйте приватный канал:

- GitHub Security Advisories: https://github.com/LuckyDapf/LuckyIDE/security/advisories/new

В сообщении укажите: версию сборки, шаги воспроизведения, ожидаемое и фактическое поведение.

### Что считается уязвимостью

- выполнение кода вне песочницы редактора;
- утечка API-ключей и токенов за пределы локального профиля;
- обход проверок при работе с терминалом и файловой системой;
- удалённое выполнение через MCP-серверы или расширения.

### Что не считается

- ошибки самих моделей и провайдеров;
- ограничения, унаследованные от VS Code и уже описанные у них;
- отсутствие подписи у сборок (сборка не подписана и распространяется как есть).

### Поддерживаемые версии

Исправления выходят только для последней опубликованной сборки.

---

## English

### Reporting a vulnerability

Do not open a public issue for security problems. Use GitHub Security Advisories:

https://github.com/LuckyDapf/LuckyIDE/security/advisories/new

Please include the build version, reproduction steps and the expected vs actual behaviour.

### In scope

- code execution outside the editor sandbox;
- leaking API keys or tokens outside the local profile;
- bypassing terminal/filesystem permission checks;
- remote code execution through MCP servers or extensions.

### Out of scope

- model or provider failures;
- limitations inherited from VS Code and already tracked upstream;
- the absence of code signing for the distributed builds.

### Supported versions

Fixes are provided for the latest published build only.
