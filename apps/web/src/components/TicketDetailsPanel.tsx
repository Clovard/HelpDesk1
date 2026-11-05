import { useEffect, useState } from "react";
import { deleteTicket, updateTicket } from "../api/client";
import type { Ticket, TicketStatus } from "../types";

const statuses: TicketStatus[] = ["New", "Under Review", "In Progress", "Closed"];
const statusLabels: Record<TicketStatus, string> = {
    New: "Новая",
    "Under Review": "На рассмотрении",
    "In Progress": "В работе",
    Closed: "Закрыта",
};
const levels = ["", "L1", "L2", "L3"];
const responsibles = ["", "Andrey", "Tema", "Pentagon"];

type TicketDraft = {
    date: string;
    time: string;
    employee: string;
    city: string;
    department: string;
    system: string;
    type: string;
    problem: string;
    expectedResult: string;
    status: TicketStatus;
    itComment: string;
    supportLevel: string;
    assignee: string;
    scale: string;
};

function createDraft(ticket: Ticket): TicketDraft {
    return {
        date: ticket.date,
        time: ticket.time,
        employee: ticket.employee,
        city: ticket.city || "",
        department: ticket.department || "",
        system: ticket.system || "",
        type: ticket.type || "",
        problem: ticket.problem,
        expectedResult: ticket.expected_result || "",
        status: ticket.status,
        itComment: ticket.it_comment || "",
        supportLevel: ticket.support_level || "",
        assignee: ticket.assignee || "",
        scale: ticket.scale || "",
    };
}

type Props = {
    ticket: Ticket;
    onClose: () => void;
    onSaved: (ticket: Ticket) => void;
    onDeleted: (id: number) => void;
};

export default function TicketDetailsPanel({ ticket, onClose, onSaved, onDeleted }: Props) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(() => createDraft(ticket));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setDraft(createDraft(ticket));
        setEditing(false);
        setError("");
    }, [ticket]);

    function setField(field: keyof TicketDraft, value: string) {
        setDraft((current) => ({ ...current, [field]: value }));
    }

    async function save() {
        try {
            setSaving(true);
            setError("");
            const result = await updateTicket(ticket.id, {
                ...draft,
                city: draft.city || null,
                department: draft.department || null,
                system: draft.system || null,
                type: draft.type || null,
                expectedResult: draft.expectedResult || null,
                itComment: draft.itComment || null,
                supportLevel: draft.supportLevel || null,
                assignee: draft.assignee || null,
                scale: draft.scale || null,
            });
            onSaved(result.ticket);
            setEditing(false);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Failed to save ticket");
        } finally {
            setSaving(false);
        }
    }

    async function remove() {
        if (!window.confirm(`Delete ${ticket.public_id}? This action cannot be undone.`)) return;

        try {
            setSaving(true);
            await deleteTicket(ticket.id);
            onDeleted(ticket.id);
            onClose();
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Failed to delete ticket");
        } finally {
            setSaving(false);
        }
    }

    function field(label: string, value: string, key: keyof TicketDraft) {
        return (
            <label className="details-field">
                <span>{label}</span>
                {editing ? (
                    <input value={value} onChange={(event) => setField(key, event.target.value)} />
                ) : (
                    <strong>{value || "—"}</strong>
                )}
            </label>
        );
    }

    return (
        <div className="details-backdrop" onMouseDown={onClose}>
            <aside className="details-panel" onMouseDown={(event) => event.stopPropagation()}>
                <header className="details-header">
                    <div>
                        <span className="eyebrow">ПОДРОБНОСТИ ЗАЯВКИ</span>
                        <h2>{ticket.public_id}</h2>
                    </div>
                    <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
                </header>

                {error && <div className="state-card error-card">{error}</div>}

                <div className="details-actions">
                    {!editing && <button className="primary-button" onClick={() => setEditing(true)}>✎ Редактировать</button>}
                    {editing && (
                        <>
                            <button className="primary-button" onClick={() => void save()} disabled={saving}>
                                {saving ? "Сохранение..." : "Сохранить"}
                            </button>
                            <button className="secondary-button" onClick={() => { setDraft(createDraft(ticket)); setEditing(false); }}>
                                Отмена
                            </button>
                        </>
                    )}
                    <button className="danger-button" onClick={() => void remove()} disabled={saving}>Удалить</button>
                </div>

                <section className="details-section">
                    <h3>Заявка</h3>
                    <div className="details-grid">
                        {field("Дата", draft.date, "date")}
                        {field("Время", draft.time, "time")}
                        {field("Сотрудник", draft.employee, "employee")}
                        {field("Город", draft.city, "city")}
                        {field("Подразделение", draft.department, "department")}
                        {field("Система", draft.system, "system")}
                        {field("Тип", draft.type, "type")}
                        {field("Масштаб", draft.scale, "scale")}
                    </div>
                </section>

                <section className="details-section">
                    <h3>Описание</h3>
                    <label className="details-field full-field">
                        <span>Проблема / ситуация</span>
                        {editing ? <textarea value={draft.problem} onChange={(event) => setField("problem", event.target.value)} /> : <p>{draft.problem || "—"}</p>}
                    </label>
                    <label className="details-field full-field">
                        <span>Ожидаемый результат</span>
                        {editing ? <textarea value={draft.expectedResult} onChange={(event) => setField("expectedResult", event.target.value)} /> : <p>{draft.expectedResult || "—"}</p>}
                    </label>
                </section>

                <section className="details-section">
                    <h3>Работа IT</h3>
                    <div className="details-grid">
                        <label className="details-field"><span>Статус</span><select disabled={!editing} value={draft.status} onChange={(event) => setField("status", event.target.value as TicketStatus)}>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
                        <label className="details-field"><span>Уровень</span><select disabled={!editing} value={draft.supportLevel} onChange={(event) => setField("supportLevel", event.target.value)}>{levels.map((level) => <option key={level} value={level}>{level || "—"}</option>)}</select></label>
                        <label className="details-field"><span>Ответственный</span><select disabled={!editing} value={draft.assignee} onChange={(event) => setField("assignee", event.target.value)}>{responsibles.map((person) => <option key={person} value={person}>{person || "—"}</option>)}</select></label>
                    </div>
                    <label className="details-field full-field"><span>Комментарий IT</span>{editing ? <textarea value={draft.itComment} onChange={(event) => setField("itComment", event.target.value)} /> : <p>{draft.itComment || "—"}</p>}</label>
                </section>
            </aside>
        </div>
    );
}
