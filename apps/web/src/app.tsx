import { useState } from "react";
import TicketPage from "./pages/ticketPage";
import IdeasPage from "./pages/ideasPage";
import KanbanPage from "./pages/kanbanPage";

type View = "tickets" | "ideas" | "kanban";

export default function App() {
    const [view, setView] = useState<View>("tickets");

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark">IT</div>
                    <div>
                        <strong>IT Helpdesk</strong>
                        <span>Operations Center</span>
                    </div>
                </div>
                <nav className="sidebar-nav">
                    <button className={view === "tickets" ? "nav-link active" : "nav-link"} onClick={() => setView("tickets")}>Tickets</button>
                    <button className={view === "ideas" ? "nav-link active" : "nav-link"} onClick={() => setView("ideas")}>Ideas</button>
                    <button className={view === "kanban" ? "nav-link active" : "nav-link"} onClick={() => setView("kanban")}>Kanban</button>
                    <button className="nav-link" onClick={() => window.alert("Settings are next.")}>Settings</button>
                </nav>
                <div className="sidebar-footer">
                    <span className="online-dot" />
                    API connection pending
                </div>
            </aside>
            <section className="content">
                {view === "tickets" && <TicketPage />}
                {view === "ideas" && <IdeasPage />}
                {view === "kanban" && <KanbanPage />}
            </section>
        </div>
    );
}
