import { useEffect, useMemo, useState } from "react";
import { getTickets, updateTicket } from "../api/client";
import TicketDetailsPanel from "../components/TicketDetailsPanel";
import CreateTicketPanel from "../components/CreateTicketPanel";
import KanbanPage from "./kanbanPage";
import type { Ticket, TicketStatus } from "../types";

const statuses: TicketStatus[] = [
"New",
"Under Review",
"In Progress",
"Closed",
];

const statusLabels: Record<TicketStatus, string> = {
    New: "Новая",
    "Under Review": "На рассмотрении",
    "In Progress": "В работе",
    Closed: "Закрыта",
};

const levels = ["", "L1", "L2", "L3"];
const responsibles = ["", "Andrey", "Tema", "Pentagon"];

export default function TicketPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [displayMode, setDisplayMode] = useState<"list" | "kanban">("list");
    const [createOpen, setCreateOpen] = useState(false);

    async function loadTickets() {
        try {
            setLoading(true);
            setError("");
            const result = await getTickets();
            setTickets(result.tickets);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Failed to load tickets");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadTickets();
    }, []);

    const visibleTickets = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return tickets;
        return tickets.filter((ticket) => JSON.stringify(ticket).toLowerCase().includes(query));
    }, [tickets, search]);

    async function changeTicket(id: number, data: Parameters<typeof updateTicket>[1]) {
        try {
            const result = await updateTicket(id, data);
            setTickets((current) => current.map((ticket) => ticket.id === id ? result.ticket : ticket));
        } catch (requestError) {
            window.alert(requestError instanceof Error ? requestError.message : "Failed to update ticket");
        }
    }

    return (
        <main className="page">
            <div className="topbar">
                <label className="global-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по заявкам, сотрудникам, отделам..." /></label>
            </div>
            <header className="page-header">
                <div>
                    <div className="breadcrumb">⌂ &nbsp;Главная</div>
                    <h1>Заявки</h1>
                    <p className="subtitle">Запросы в службу поддержки из внутренней системы</p>
                </div>
                <div className="header-actions"><button className="primary-button create-header-button" onClick={() => setCreateOpen(true)}>＋ Создать заявку</button><button className="refresh-button" onClick={() => void loadTickets()} aria-label="Обновить заявки">↻</button></div>
            </header>

            <section className="toolbar">
                <span className="ticket-count">{visibleTickets.length} заявок</span>
                <div className="view-switcher">
                    <button className={displayMode === "list" ? "view-button active" : "view-button"} onClick={() => setDisplayMode("list")}>Список</button>
                    <button className={displayMode === "kanban" ? "view-button active" : "view-button"} onClick={() => setDisplayMode("kanban")}>Канбан</button>
                </div>
            </section>

            {loading && <div className="state-card">Загрузка заявок...</div>}
            {error && <div className="state-card error-card">{error}</div>}

            {displayMode === "list" && !loading && !error && (
            <section className="table-card">
                <div className="table-scroll">
                    <table className="tickets-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Дата</th>
                                <th>Время</th>
                                <th>Сотрудник</th>
                                <th>Город</th>
                                <th>Подразделение</th>
                                <th>Система</th>
                                <th>Тип</th>
                                <th>Проблема / ситуация</th>
                                <th>Ожидаемый результат</th>
                                <th>Статус IT</th>
                                <th>Комментарий IT</th>
                                <th>Уровень</th>
                                <th>Ответственный</th>
                                <th>Масштаб</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleTickets.map((ticket) => (
                            <tr key={ticket.id} className="clickable-row" onClick={() => setSelectedTicket(ticket)}>
                                <td className="id-cell">{ticket.public_id}</td>
                                <td>{ticket.date}</td>
                                <td>{ticket.time}</td>
                                <td>{ticket.employee}</td>
                                <td>{ticket.city || ""}</td>
                                <td>{ticket.department || ""}</td>
                                <td>{ticket.system || ""}</td>
                                <td>{ticket.type || ""}</td>
                                <td className="wide-cell">{ticket.problem}</td>
                                <td className="wide-cell">{ticket.expected_result || ""}</td>
                                <td>
                                    <select
                                        className={"status-select status-" + ticket.status.toLowerCase().replaceAll(" ", "-")}
                                        value={ticket.status}
                                        onChange={(event) => void changeTicket(ticket.id, { status: event.target.value })}
                                    >
                                        {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                                    </select>
                                </td>
                                <td className="wide-cell">
                                    <input
                                        className="cell-input"
                                        defaultValue={ticket.it_comment || ""}
                                        onBlur={(event) => {
                                        if (event.target.value !== (ticket.it_comment || "")) {
                                            void changeTicket(ticket.id, { itComment: event.target.value });
                                        }
                                    }}
                                    />
                                </td>
                                <td>
                                    <select
                                        className="cell-select"
                                        value={ticket.support_level || ""}
                                        onChange={(event) => void changeTicket(ticket.id, { supportLevel: event.target.value || null })}
                                    >
                                        {levels.map((level) => <option key={level} value={level}>{level || "—"}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <select
                                        className="cell-select"
                                        value={ticket.assignee || ""}
                                        onChange={(event) => void changeTicket(ticket.id, { assignee: event.target.value || null })}
                                    >
                                        {responsibles.map((person) => <option key={person} value={person}>{person || "—"}</option>)}
                                    </select>
                                </td>
                                <td>{ticket.scale || ""}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
                {!visibleTickets.length && <div className="empty-state">Заявки не найдены</div>}
            </section>
        )}
            {displayMode === "kanban" && !loading && !error && <KanbanPage />}
            {selectedTicket && (
                <TicketDetailsPanel
                    ticket={selectedTicket}
                    onClose={() => setSelectedTicket(null)}
                    onSaved={(updatedTicket) => {
                        setTickets((current) => current.map((item) => item.id === updatedTicket.id ? updatedTicket : item));
                        setSelectedTicket(updatedTicket);
                    }}
                    onDeleted={(deletedId) => setTickets((current) => current.filter((item) => item.id !== deletedId))}
                />
            )}
            {createOpen && <CreateTicketPanel onClose={() => setCreateOpen(false)} onCreated={(createdTicket) => setTickets((current) => [createdTicket, ...current])} />}
        </main>
    );
}
