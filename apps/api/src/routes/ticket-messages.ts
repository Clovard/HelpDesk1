import { Hono } from "hono";
import type { Env } from "../db/client";
import { listTicketMessages, sendSupportTicketMessage } from "../services/ticket-message.service";

const ticketMessages = new Hono<{ Bindings: Env }>();

ticketMessages.get("/:id/messages", async (context) => {
    const ticketId = Number(context.req.param("id"));
    if (!Number.isInteger(ticketId) || ticketId < 1) {
        return context.json({ ok: false, error: "Некорректный номер заявки." }, 400);
    }

    const ticket = await context.env.DB.prepare("SELECT id FROM tickets WHERE id = ?")
        .bind(ticketId).first<{ id: number }>();
    if (!ticket) return context.json({ ok: false, error: "Заявка не найдена." }, 404);

    const messages = await listTicketMessages(context.env, ticketId);
    return context.json({ ok: true, messages });
});

ticketMessages.post("/:id/messages", async (context) => {
    const ticketId = Number(context.req.param("id"));
    if (!Number.isInteger(ticketId) || ticketId < 1) {
        return context.json({ ok: false, error: "Некорректный номер заявки." }, 400);
    }

    const body = await context.req.json<{ message?: string }>();
    if (typeof body.message !== "string") {
        return context.json({ ok: false, error: "Введите текст сообщения." }, 400);
    }

    const result = await sendSupportTicketMessage(context.env, ticketId, body.message);
    if (!result.ok) return context.json({ ok: false, error: result.error }, result.status as 400 | 404 | 409 | 500);

    return context.json({
        ok: true,
        message: result.message,
        delivered: result.delivered,
    }, result.delivered ? 201 : 202);
});

export default ticketMessages;
