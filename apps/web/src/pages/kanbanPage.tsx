import { useEffect, useState } from "react";
import { getTickets, updateTicket } from "../api/client";
import TicketDetailsPanel from "../components/TicketDetailsPanel";
import type { Ticket, TicketStatus } from "../types";

const columns: TicketStatus[] = ["New", "Under Review", "In Progress", "Closed"];

const statusLabels: Record<TicketStatus, string> = {
    New: "Новая",
    "Under Review": "На рассмотрении",
    "In Progress": "В работе",
    Closed: "Закрыта",
};

export default function KanbanPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [draggedTicketId, setDraggedTicketId] = useState<number | null>(null);
    const [dragOverStatus, setDragOverStatus] = useState<TicketStatus | null>(null);

    useEffect(() => {
        void getTickets().then((result) => setTickets(result.tickets)).catch(() => setTickets([]));
    }, []);

    async function moveTicket(ticket: Ticket, status: TicketStatus) {
        try {
            const result = await updateTicket(ticket.id, { status });
            setTickets((current) => current.map((item) => item.id === ticket.id ? result.ticket : item));
        } catch (requestError) {
            window.alert(requestError instanceof Error ? requestError.message : "Не удалось изменить статус");
        }
    }

    async function dropTicket(status: TicketStatus) {
        if (draggedTicketId === null) return;
        const ticket = tickets.find((item) => item.id === draggedTicketId);
        setDraggedTicketId(null);
        setDragOverStatus(null);
        if (!ticket || ticket.status === status) return;
        await moveTicket(ticket, status);
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
                <div
                    className={dragOverStatus === status ? "kanban-column drag-over" : "kanban-column"}
                    key={status}
                    onDragOver={(event) => { event.preventDefault(); setDragOverStatus(status); }}
                    onDragLeave={() => setDragOverStatus(null)}
                    onDrop={() => void dropTicket(status)}
                >
                    <div className="kanban-column-header">
                        <strong>{statusLabels[status]}</strong>
                        <span>{tickets.filter((ticket) => ticket.status === status).length}</span>
                    </div>
                    <div className="kanban-cards">
                        {tickets.filter((ticket) => ticket.status === status).map((ticket) => (
                        <article
                            className={draggedTicketId === ticket.id ? "kanban-card dragging" : "kanban-card"}
                            key={ticket.id}
                            draggable
                            onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedTicketId(ticket.id); }}
                            onDragEnd={() => { setDraggedTicketId(null); setDragOverStatus(null); }}
                            onClick={() => setSelectedTicket(ticket)}
                        >
                            <div className="kanban-card-top"><strong>{ticket.public_id}</strong><span className="level-badge">{ticket.support_level || "—"}</span></div>
                            <p>{ticket.problem}</p>
                            <small>{ticket.assignee || "Не назначен"} · {ticket.employee_telegram_id || ticket.employee}</small>
                            <span className="drag-hint">Перетащите, чтобы изменить статус</span>
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
