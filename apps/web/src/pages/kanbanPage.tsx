import { useEffect, useState } from "react";
import { getTickets, updateTicket } from "../api/client";
import TicketDetailsPanel from "../components/TicketDetailsPanel";
import type { Ticket, TicketStatus } from "../types";

const columns: TicketStatus[] = ["New", "Under Review", "In Progress", "Closed"];

export default function KanbanPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

    useEffect(() => {
        void getTickets().then((result) => setTickets(result.tickets)).catch(() => setTickets([]));
    }, []);

    async function moveTicket(ticket: Ticket, status: TicketStatus) {
        const result = await updateTicket(ticket.id, { status });
        setTickets((current) => current.map((item) => item.id === ticket.id ? result.ticket : item));
    }

    return (
        <main className="page">
            <header className="page-header">
                <div>
                    <p className="eyebrow">IT-ОПЕРАЦИИ</p>
                    <h1>Канбан</h1>
                    <p className="subtitle">Перемещайте заявки между этапами поддержки</p>
                </div>
            </header>
            <section className="kanban-board">
                {columns.map((status) => (
                <div className="kanban-column" key={status}>
                    <div className="kanban-column-header">
                        <strong>{status}</strong>
                        <span>{tickets.filter((ticket) => ticket.status === status).length}</span>
                    </div>
                    <div className="kanban-cards">
                        {tickets.filter((ticket) => ticket.status === status).map((ticket) => (
                        <article className="kanban-card" key={ticket.id} onClick={() => setSelectedTicket(ticket)}>
                            <div className="kanban-card-top"><strong>{ticket.public_id}</strong><span className="level-badge">{ticket.support_level || "—"}</span></div>
                            <p>{ticket.problem}</p>
                            <small>{ticket.assignee || "Не назначен"} · {ticket.employee}</small>
                            <select value={ticket.status} onClick={(event) => event.stopPropagation()} onChange={(event) => void moveTicket(ticket, event.target.value as TicketStatus)}>
                                {columns.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                        </article>
                    ))}
                        {!tickets.some((ticket) => ticket.status === status) && <div className="kanban-empty">Нет заявок</div>}
                    </div>
                </div>
            ))}
            </section>
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
        </main>
    );
}
