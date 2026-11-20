import type { Env } from "../db/client";

export type TicketMessage = {
    id: number;
    ticket_id: number;
    sender_type: "employee" | "support";
    sender_telegram_id: string | null;
    sender_name: string;
    body: string;
    telegram_status: string;
    created_at: string;
};

export async function listTicketMessages(env: Env, ticketId: number) {
    const result = await env.DB.prepare(`
        SELECT id, ticket_id, sender_type, sender_telegram_id, sender_name, body, telegram_status, created_at
        FROM ticket_messages
        WHERE ticket_id = ?
        ORDER BY created_at ASC, id ASC
    `).bind(ticketId).all<TicketMessage>();
    return result.results;
}

function telegramIdFromTicket(ticket: { telegram_user_id: string | null; employee_telegram_id: string | null }) {
    if (ticket.telegram_user_id) return ticket.telegram_user_id;
    const match = /(?:ID|идентификатор)\s*:\s*(\d+)/i.exec(ticket.employee_telegram_id ?? "");
    return match?.[1] ?? null;
}

export async function sendSupportTicketMessage(env: Env, ticketId: number, body: string) {
    const ticket = await env.DB.prepare(`
        SELECT id, public_id, employee, telegram_user_id, employee_telegram_id
        FROM tickets
        WHERE id = ?
    `).bind(ticketId).first<{
        id: number;
        public_id: string;
        employee: string;
        telegram_user_id: string | null;
        employee_telegram_id: string | null;
    }>();

    if (!ticket) return { ok: false as const, status: 404, error: "Заявка не найдена." };
    const telegramId = telegramIdFromTicket(ticket);
    if (!telegramId) return { ok: false as const, status: 409, error: "Для этой заявки не сохранён Telegram ID сотрудника." };

    const message = body.trim();
    if (!message || message.length > 4000) {
        return { ok: false as const, status: 400, error: "Сообщение должно содержать от 1 до 4000 символов." };
    }

    const insert = await env.DB.prepare(`
        INSERT INTO ticket_messages (ticket_id, sender_type, sender_name, body, telegram_status)
        VALUES (?, 'support', 'ИТ-поддержка', ?, ?)
    `).bind(ticketId, message, env.BOT_TOKEN ? "pending" : "not_configured").run();

    let delivered = false;
    if (env.BOT_TOKEN) {
        try {
            const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: telegramId,
                    text: `Сообщение по заявке ${ticket.public_id}\n\n${message}`,
                }),
            });
            const result = await response.json() as { ok?: boolean };
            delivered = response.ok && result.ok === true;
        } catch (error) {
            console.error("Telegram ticket message delivery failed", {
                ticketId,
                error: error instanceof Error ? error.message : "unknown error",
            });
        }
    }

    const telegramStatus = delivered ? "sent" : env.BOT_TOKEN ? "failed" : "not_configured";
    await env.DB.prepare("UPDATE ticket_messages SET telegram_status = ? WHERE id = ?")
        .bind(telegramStatus, insert.meta.last_row_id).run();

    const saved = await env.DB.prepare(`
        SELECT id, ticket_id, sender_type, sender_telegram_id, sender_name, body, telegram_status, created_at
        FROM ticket_messages WHERE id = ?
    `).bind(insert.meta.last_row_id).first<TicketMessage>();

    if (!saved) {
        return { ok: false as const, status: 500, error: "Сообщение не удалось сохранить." };
    }

    return { ok: true as const, message: saved, delivered };
}

