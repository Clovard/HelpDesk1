import { useState, type FormEvent } from "react";
import { createTicket } from "../api/client";
import type { Ticket } from "../types";

type Props = {
    onClose: () => void;
    onCreated: (ticket: Ticket) => void;
};

export default function CreateTicketPanel({ onClose, onCreated }: Props) {
    const [form, setForm] = useState({
        employee: "",
        city: "",
        department: "",
        system: "",
        type: "",
        problem: "",
        expectedResult: "",
        scale: "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function setField(field: keyof typeof form, value: string) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!form.employee.trim() || !form.problem.trim()) {
            setError("Укажите сотрудника и описание проблемы");
            return;
        }

        try {
            setSaving(true);
            setError("");
            const result = await createTicket(form);
            onCreated(result.ticket);
            onClose();
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Не удалось создать заявку");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="details-backdrop" onMouseDown={onClose}>
            <aside className="details-panel" onMouseDown={(event) => event.stopPropagation()}>
                <header className="details-header">
                    <div><span className="eyebrow">НОВАЯ ЗАЯВКА</span><h2>Создать заявку</h2></div>
                    <button className="icon-button" onClick={onClose} aria-label="Закрыть">×</button>
                </header>
                {error && <div className="state-card error-card">{error}</div>}
                <form onSubmit={submit}>
                    <section className="details-section">
                        <h3>Данные сотрудника</h3>
                        <div className="details-grid">
                            <label className="details-field"><span>Сотрудник *</span><input required value={form.employee} onChange={(event) => setField("employee", event.target.value)} /></label>
                            <label className="details-field"><span>Город</span><input value={form.city} onChange={(event) => setField("city", event.target.value)} /></label>
                            <label className="details-field"><span>Подразделение</span><input value={form.department} onChange={(event) => setField("department", event.target.value)} /></label>
                            <label className="details-field"><span>Система</span><input value={form.system} onChange={(event) => setField("system", event.target.value)} /></label>
                            <label className="details-field"><span>Тип обращения</span><input value={form.type} onChange={(event) => setField("type", event.target.value)} /></label>
                            <label className="details-field"><span>Масштаб</span><input value={form.scale} onChange={(event) => setField("scale", event.target.value)} /></label>
                        </div>
                    </section>
                    <section className="details-section">
                        <h3>Описание проблемы</h3>
                        <label className="details-field full-field"><span>Проблема / ситуация *</span><textarea required value={form.problem} onChange={(event) => setField("problem", event.target.value)} /></label>
                        <label className="details-field full-field"><span>Ожидаемый результат</span><textarea value={form.expectedResult} onChange={(event) => setField("expectedResult", event.target.value)} /></label>
                    </section>
                    <div className="details-actions"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Создание..." : "Создать заявку"}</button></div>
                </form>
            </aside>
        </div>
    );
}
