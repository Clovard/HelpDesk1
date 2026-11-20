import { answerTelegramCallback, sendTelegramMessage, type TelegramUpdate } from "../telegram-client";
import { getMainKeyboard } from "../keyboards/main.keyboard";

type BotEnv = {
    DB: D1Database;
    BOT_TOKEN: string;
    SUPPORT_CHAT_ID?: string;
};

type EmployeeTicket = {
    id: number;
    public_id: string;
    status: string;
    problem: string;
};

const statusLabels: Record<string, string> = {
    New: "Новая",
    "Under Review": "На рассмотрении",
    "In Progress": "В работе",
    Closed: "Закрыта",
};

async function getEmployeeTickets(env: BotEnv, telegramUserId: string) {
    const result = await env.DB.prepare(`
        SELECT id, public_id, status, problem
        FROM tickets
        WHERE telegram_user_id = ?
           OR (telegram_user_id IS NULL AND (
                employee_telegram_id = ? OR employee_telegram_id = ? OR
                employee_telegram_id LIKE ? OR employee_telegram_id LIKE ?
           ))
        ORDER BY created_at DESC
        LIMIT 10
    `).bind(
        telegramUserId,
        `ID: ${telegramUserId}`,
        `Идентификатор: ${telegramUserId}`,
        `%ID: ${telegramUserId})%`,
        `%идентификатор: ${telegramUserId})%`,
    ).all<EmployeeTicket>();
    return result.results;
}

export async function handleMyTickets(env: BotEnv, chatId: number, telegramUserId: string) {
    const tickets = await getEmployeeTickets(env, telegramUserId);
    if (!tickets.length) {
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "У вас пока нет заявок, созданных через этот Telegram-аккаунт.", getMainKeyboard());
        return;
    }

    const keyboard = tickets.map((ticket) => [{
        text: `💬 ${ticket.public_id} · ${statusLabels[ticket.status] || ticket.status}`,
        callback_data: `ticket_chat:${ticket.id}`,
    }]);

    await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        `Ваши заявки:\n\n${tickets.map((ticket) =>
            `${ticket.public_id} · ${statusLabels[ticket.status] || ticket.status}\n${ticket.problem.slice(0, 160)}`,
        ).join("\n\n")}\n\nНажмите на заявку, чтобы написать специалисту.`,
        { inline_keyboard: keyboard },
    );
}

export async function handleTicketChatCallback(
    env: BotEnv,
    callback: NonNullable<TelegramUpdate["callback_query"]>,
) {
    const match = /^ticket_chat:(\d+)$/.exec(callback.data ?? "");
    if (!match || !callback.message || callback.message.chat.type !== "private") return false;

    const chatId = callback.message.chat.id;
    const telegramUserId = String(callback.from.id);
    const ticketId = Number(match[1]);
    const ticket = await env.DB.prepare(`
        SELECT id, public_id
        FROM tickets
        WHERE id = ? AND (
            telegram_user_id = ? OR
            (telegram_user_id IS NULL AND (
                employee_telegram_id = ? OR employee_telegram_id = ? OR
                employee_telegram_id LIKE ? OR employee_telegram_id LIKE ?
            ))
        )
    `).bind(
        ticketId,
        telegramUserId,
        `ID: ${telegramUserId}`,
        `Идентификатор: ${telegramUserId}`,
        `%ID: ${telegramUserId})%`,
        `%идентификатор: ${telegramUserId})%`,
    ).first<{ id: number; public_id: string }>();

    if (!ticket) {
        await answerTelegramCallback(env.BOT_TOKEN, callback.id, "Эта заявка не найдена в вашем аккаунте.");
        return true;
    }

    await env.DB.prepare(`
        INSERT INTO bot_ticket_chats (chat_id, ticket_id, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chat_id) DO UPDATE SET ticket_id = excluded.ticket_id, updated_at = CURRENT_TIMESTAMP
    `).bind(String(chatId), ticket.id).run();

    await answerTelegramCallback(env.BOT_TOKEN, callback.id, "Переписка открыта");
    await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        `Открыта переписка по заявке ${ticket.public_id}. Напишите сообщение здесь — оно появится в HelpDesk.`,
        {
            keyboard: [[{ text: "📋 Мои заявки" }, { text: "Завершить переписку" }]],
            resize_keyboard: true,
            one_time_keyboard: false,
        },
    );
    return true;
}

export async function handleTicketChatMessage(env: BotEnv, message: {
    message_id?: number;
    chat: { id: number; type?: string };
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    text?: string;
}) {
    if (message.chat.type !== "private" || !message.from || !message.text?.trim()) return false;
    const text = message.text.trim();
    const normalized = text.toLocaleLowerCase("ru");
    if (["📋 мои заявки", "мои заявки", "/start", "/ticket", "создать заявку", "🛠 создать заявку", "💡 предложить идею", "предложить идею"].includes(normalized)) {
        return false;
    }

    const active = await env.DB.prepare(`
        SELECT c.ticket_id, t.public_id
        FROM bot_ticket_chats c
        JOIN tickets t ON t.id = c.ticket_id
        WHERE c.chat_id = ? AND (
            t.telegram_user_id = ? OR
            (t.telegram_user_id IS NULL AND (
                t.employee_telegram_id = ? OR t.employee_telegram_id = ? OR
                t.employee_telegram_id LIKE ? OR t.employee_telegram_id LIKE ?
            ))
        )
    `).bind(
        String(message.chat.id),
        String(message.from.id),
        `ID: ${message.from.id}`,
        `Идентификатор: ${message.from.id}`,
        `%ID: ${message.from.id})%`,
        `%идентификатор: ${message.from.id})%`,
    ).first<{ ticket_id: number; public_id: string }>();
    if (!active) return false;

    if (["завершить переписку", "/закрыть_чат", "/stop"].includes(normalized)) {
        await env.DB.prepare("DELETE FROM bot_ticket_chats WHERE chat_id = ?")
            .bind(String(message.chat.id)).run();
        await sendTelegramMessage(env.BOT_TOKEN, message.chat.id, "Переписка закрыта. Чтобы написать снова, откройте «Мои заявки».", getMainKeyboard());
        return true;
    }

    const senderName = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ").trim()
        || (message.from.username ? `@${message.from.username}` : "Сотрудник");
    await env.DB.prepare(`
        INSERT OR IGNORE INTO ticket_messages (
            ticket_id, sender_type, sender_telegram_id, telegram_message_id, sender_name, body
        ) VALUES (?, 'employee', ?, ?, ?, ?)
    `).bind(active.ticket_id, String(message.from.id), message.message_id ?? null, senderName, text.slice(0, 4000)).run();

    if (env.SUPPORT_CHAT_ID) {
        await sendTelegramMessage(
            env.BOT_TOKEN,
            env.SUPPORT_CHAT_ID,
            `Сообщение по заявке ${active.public_id}\nСотрудник: ${senderName}\n\n${text.slice(0, 3000)}`,
        );
    }

    await sendTelegramMessage(env.BOT_TOKEN, message.chat.id, `Сообщение по заявке ${active.public_id} передано специалисту.`);
    return true;
}
