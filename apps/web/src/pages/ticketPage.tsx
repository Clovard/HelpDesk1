import { useEffect, useMemo, useState } from "react";
import { getTickets, updateTicket } from "../api/client";
import type { Ticket, TicketStatus } from "../types";

const statuses: TicketStatus[] = [
"New",
"Under Review",
"In Progress",
"Closed",
];

const levels = ["", "L1", "L2", "L3"];
const responsibles = ["", "Andrey", "Tema", "Pentagon"];

export default function TicketPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

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

    async function changeTicket(id: number, data: Record<string, string | null>) {
        try {
            const result = await updateTicket(id, data);
            setTickets((current) => current.map((ticket) => ticket.id === id ? result.ticket : ticket));
        } catch (requestError) {
            window.alert(requestError instanceof Error ? requestError.message : "Failed to update ticket");
        }
    }

    return (
        <main className="page">
            <header className="page-header">
                <div>
                    <p className="eyebrow">IT OPERATIONS</p>
                    <h1>Tickets</h1>
                    <p className="subtitle">Helpdesk requests from the internal support system</p>
                </div>
                <button className="refresh-button" onClick={() => void loadTickets()}>Refresh</button>
            </header>

            <section className="toolbar">
                <input
                    className="search-input"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search tickets..."
                />
                <span className="ticket-count">{visibleTickets.length} tickets</span>
            </section>

            {loading && <div className="state-card">Loading tickets...</div>}
            {error && <div className="state-card error-card">{error}</div>}

            {!loading && !error && (
            <section className="table-card">
                <div className="table-scroll">
                    <table className="tickets-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Employee</th>
                                <th>City</th>
                                <th>Department</th>
                                <th>System</th>
                                <th>Type</th>
                                <th>Problem / Situation</th>
                                <th>Expected Result</th>
                                <th>IT Status</th>
                                <th>IT Comment</th>
                                <th>Level</th>
                                <th>Assignee</th>
                                <th>Scale</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleTickets.map((ticket) => (
                            <tr key={ticket.id}>
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
                                        {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
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
                {!visibleTickets.length && <div className="empty-state">No tickets found.</div>}
            </section>
        )}
        </main>
    );
}
