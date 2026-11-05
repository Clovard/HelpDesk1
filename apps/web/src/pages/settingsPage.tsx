import { useState } from "react";

const defaultApiUrl = "https://helpdesk-api.andrejsarafonov.workers.dev";

export default function SettingsPage() {
    const [apiUrl, setApiUrl] = useState(() => localStorage.getItem("helpdesk_api_url") || defaultApiUrl);
    const [botToken, setBotToken] = useState("");
    const [chatId, setChatId] = useState("");
    const [apiStatus, setApiStatus] = useState("Not checked");
    const [botStatus, setBotStatus] = useState("Not configured");

    async function checkApi() {
        setApiStatus("Checking...");
        try {
            const response = await fetch(apiUrl.replace(/\/$/, "") + "/health");
            const result = await response.json() as { ok?: boolean; databaseConfigured?: boolean };
            setApiStatus(result.ok ? `Connected · D1: ${result.databaseConfigured ? "ready" : "not configured"}` : "API returned an error");
        } catch {
            setApiStatus("Connection failed");
        }
    }

    function saveSettings() {
        localStorage.setItem("helpdesk_api_url", apiUrl.replace(/\/$/, ""));
        setBotStatus(botToken && chatId ? "Ready to configure in Cloudflare Secrets" : "Not configured");
        window.alert("API URL saved in this browser. Telegram secrets must be configured in the bot Worker, not in frontend storage.");
    }

    return (
        <main className="page settings-page">
            <header className="page-header">
                <div>
                    <p className="eyebrow">СИСТЕМНАЯ КОНФИГУРАЦИЯ</p>
                    <h1>Настройки</h1>
                    <p className="subtitle">Подключения и интеграции Helpdesk</p>
                </div>
            </header>

            <div className="settings-grid">
                <section className="settings-card">
                    <div className="settings-card-header"><div><span className="settings-icon">↗</span><h2>Подключение API</h2></div><span className={apiStatus.startsWith("Connected") ? "connection-state online" : "connection-state"}>{apiStatus}</span></div>
                    <label className="details-field"><span>Адрес API Worker</span><input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} /></label>
                    <div className="settings-actions"><button className="secondary-button" onClick={() => void checkApi()}>Проверить подключение</button><button className="primary-button" onClick={saveSettings}>Сохранить API</button></div>
                </section>

                <section className="settings-card">
                    <div className="settings-card-header"><div><span className="settings-icon">✈</span><h2>Telegram-бот</h2></div><span className="connection-state">{botStatus}</span></div>
                    <p className="settings-note">Токен бота не передаётся в браузер. Его нужно хранить в Cloudflare Worker Secrets.</p>
                    <label className="details-field"><span>Токен бота</span><input type="password" value={botToken} onChange={(event) => setBotToken(event.target.value)} placeholder="Токен для настройки" /></label>
                    <label className="details-field"><span>Chat ID рабочей группы</span><input value={chatId} onChange={(event) => setChatId(event.target.value)} placeholder="Например: -1001234567890" /></label>
                    <div className="settings-actions"><button className="primary-button" onClick={saveSettings}>Сохранить настройки бота</button></div>
                </section>
            </div>
        </main>
    );
}
