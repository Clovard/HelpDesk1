# QA P0: тестовый стенд и первый вход

Проверка безопасности выполняется только на отдельной тестовой базе и отдельном Telegram-боте. Файлы `wrangler.test.example.toml` не подключены к production конфигурациям.

## 1. Создать тестовую D1

Из корня репозитория:

```powershell
npx wrangler d1 create helpdesk-db-test
```

Скопировать шаблоны:

```powershell
Copy-Item apps/api/wrangler.test.example.toml apps/api/wrangler.test.toml
Copy-Item apps/bot/wrangler.test.example.toml apps/bot/wrangler.test.toml
```

Подставить полученный `database_id` вместо `REPLACE_WITH_TEST_D1_ID` в обоих файлах. Файлы `wrangler.test.toml` не добавлять в Git: они локальные настройки стенда.

## 2. Применить миграции к тестовой базе

```powershell
npx wrangler d1 migrations apply helpdesk-db-test --remote --config apps/api/wrangler.test.toml
npx wrangler d1 migrations list helpdesk-db-test --remote --config apps/api/wrangler.test.toml
```

Убедиться, что применена `0006_staff_authentication.sql`. Эти команды используют только базу `helpdesk-db-test`.

## 3. Задать секреты тестовым Worker

Сгенерировать bootstrap-секрет и скопировать его в буфер обмена:

```powershell
$bootstrapSecret = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
Set-Clipboard $bootstrapSecret
npx wrangler secret put BOOTSTRAP_SECRET --config apps/api/wrangler.test.toml
```

Вставить значение из буфера в запрос Wrangler. Затем создать общий ключ для API и тестового бота:

```powershell
$botApiToken = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
Set-Clipboard $botApiToken
npx wrangler secret put BOT_API_TOKEN --config apps/api/wrangler.test.toml
npx wrangler secret put BOT_API_TOKEN --config apps/bot/wrangler.test.toml
```

Вставить один и тот же ключ в оба запроса Wrangler. Секрет тестового Telegram-бота задать отдельно:

```powershell
npx wrangler secret put BOT_TOKEN --config apps/bot/wrangler.test.toml
```

Команда попросит вставить токен, полученный от BotFather. Не помещать токены в файлы конфигурации или Git.

Сгенерировать секрет вебхука, скопировать его в буфер и добавить в Worker:

```powershell
$webhookSecret = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
Set-Clipboard $webhookSecret
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --config apps/bot/wrangler.test.toml
```

Вставить значение в Wrangler. Этот же `$webhookSecret` понадобится после деплоя, чтобы Telegram присылал секретный заголовок.

## 4. Развернуть тестовые Worker

Сначала развернуть API, потом бота:

```powershell
npx wrangler deploy --config apps/api/wrangler.test.toml
npx wrangler deploy --config apps/bot/wrangler.test.toml
```

Затем зарегистрировать адрес тестового Worker как webhook тестового бота. Этот PowerShell-вызов вводит токен без отображения и не сохраняет его в команде:

```powershell
$telegramTokenSecure = Read-Host "Токен тестового бота" -AsSecureString
$telegramTokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($telegramTokenSecure)
try {
  $telegramToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($telegramTokenPtr)
  $webhookBody = @{ url = "https://helpdesk-bot-test.andrejsarafonov.workers.dev"; secret_token = $webhookSecret } | ConvertTo-Json
  Invoke-RestMethod -Uri "https://api.telegram.org/bot$telegramToken/setWebhook" -Method Post -ContentType "application/json" -Body $webhookBody
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($telegramTokenPtr)
  Remove-Variable telegramToken -ErrorAction SilentlyContinue
}
```

Для тестирования сайта локально указать тестовый API:

```powershell
$env:VITE_API_URL = "https://helpdesk-api-test.andrejsarafonov.workers.dev"
npm run dev --workspace @helpdesk/web -- --host 127.0.0.1 --port 5173 --strictPort
```

Открыть локальный адрес Vite. При первом входе форма попросит bootstrap-секрет из API Worker и пароли Андрея, Артёма и Пентагона. Задавать разные пароли длиной не менее 12 символов. Секреты и пароли не отправлять в чат и не коммитить.

## Проверки P0

- Без входа запросы к `/api/tickets`, `/api/ideas` и `/api/tickets/conversations` должны отвечать `401`.
- После входа каждый из трёх специалистов должен видеть переписки.
- Артём и Пентагон не должны удалять заявки/идеи и управлять учётными записями.
- Андрей может менять пароли трёх учётных записей.
- Отдельный тестовый бот должен создавать заявки/идеи только при совпадающем `BOT_API_TOKEN`.
- Повторить запросы без токена, с неверным токеном и с неавторизованной сессией; убедиться, что данные тестовой БД не меняются.

До прохождения этих проверок не отправлять изменения на production `main`: после включения защиты API старый бот без `BOT_API_TOKEN` не сможет создавать заявки и идеи.
