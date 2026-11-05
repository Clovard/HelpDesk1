import { useEffect, useState } from "react";
import { getTickets, updateTicket } from "../api/client";
import type { Ticket, TicketStatus } from "../types";

const columns: TicketStatus[] = ["New", "Under Review", "In Progress", "Closed"];

export default function KanbanPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);

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
                    <p className="eyebrow">IT OPERATIONS</p>
                    <h1>Kanban</h1>
                    <p className="subtitle">Move tickets between support stages</p>
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
                        <article className="kanban-card" key={ticket.id}>
                            <strong>{ticket.public_id}</strong>
                            <p>{ticket.problem}</p>
                            <small>{ticket.employee} · {ticket.system || "No system"}</small>
                            <select value={ticket.status} onChange={(event) => void moveTicket(ticket, event.target.value as TicketStatus)}>
                                {columns.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                        </article>
                    ))}
                        {!tickets.some((ticket) => ticket.status === status) && <div className="kanban-empty">No tickets</div>}
                    </div>
                </div>
            ))}
            </section>
        </main>
    );
}
