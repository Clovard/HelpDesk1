import { useState } from "react";
import TicketPage from "./pages/ticketPage";
import IdeasPage from "./pages/ideasPage";
import SettingsPage from "./pages/settingsPage";

type View = "tickets" | "ideas" | "settings";

export default function App() {
    const [view, setView] = useState<View>("tickets");

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark">IT</div>
                    <div>
                        <strong>Служба технической поддержки</strong>
                        <span>Операционный центр</span>
                    </div>
                </div>
                <nav className="sidebar-nav">
                    <button className={view === "tickets" ? "nav-link active" : "nav-link"} onClick={() => setView("tickets")}>▣ &nbsp;Заявки</button>
                    <button className={view === "ideas" ? "nav-link active" : "nav-link"} onClick={() => setView("ideas")}>♧ &nbsp;Идеи</button>
                    <button className={view === "settings" ? "nav-link active" : "nav-link"} onClick={() => setView("settings")}>⚙ &nbsp;Настройки</button>
                </nav>
                <div className="sidebar-footer">
                    <span className="online-dot" />
                    Подключение API
                </div>
            </aside>
            <section className="content">
                {view === "tickets" && <TicketPage />}
                {view === "ideas" && <IdeasPage />}
                {view === "settings" && <SettingsPage />}
            </section>
        </div>
    );
}
