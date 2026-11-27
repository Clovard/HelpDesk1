$ErrorActionPreference = "Stop"

$webhookUrl = "https://helpdesk-bot.andrejsarafonov.workers.dev"
$tokenSecure = Read-Host "Токен production-бота из BotFather" -AsSecureString
$tokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSecure)

try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPtr)
    $infoResponse = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo" -Method Get
    if (-not $infoResponse.ok) {
        throw "Telegram не вернул сведения о webhook. Проверьте токен бота."
    }

    $currentUrl = [string]$infoResponse.result.url
    if ($currentUrl -and $currentUrl.TrimEnd("/") -ne $webhookUrl.TrimEnd("/")) {
        throw "У бота уже настроен другой webhook: $currentUrl. Скрипт остановлен и не менял его."
    }

    Write-Host "Текущий адрес webhook: $(if ($currentUrl) { $currentUrl } else { '(не задан)' })"
    Write-Host "Разрешённые обновления: $($infoResponse.result.allowed_updates -join ', ')"
    if ($infoResponse.result.last_error_message) {
        Write-Host "Последняя ошибка Telegram: $($infoResponse.result.last_error_message)"
    }

    $secretSecure = Read-Host "TELEGRAM_WEBHOOK_SECRET из Worker (Enter, если он не настроен)" -AsSecureString
    $secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretSecure)
    try {
        $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)
        $body = @{
            url = $webhookUrl
            allowed_updates = @("message", "callback_query")
        }
        if (-not [string]::IsNullOrWhiteSpace($secret)) {
            $body.secret_token = $secret
        }

        $setResponse = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" -Method Post -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
        if (-not $setResponse.ok) {
            throw "Telegram не подтвердил настройку webhook."
        }
    } finally {
        if ($secretPtr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr)
        }
        Remove-Variable secret -ErrorAction SilentlyContinue
    }

    $verified = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo" -Method Get
    Write-Host "Webhook настроен: $($verified.result.url)"
    Write-Host "Разрешённые обновления: $($verified.result.allowed_updates -join ', ')"
    Write-Host "Ожидающие обновления: $($verified.result.pending_update_count)"
    if ($verified.result.last_error_message) {
        Write-Warning "Последняя ошибка Telegram: $($verified.result.last_error_message)"
    }
} finally {
    if ($tokenPtr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr)
    }
    Remove-Variable token -ErrorAction SilentlyContinue
}
