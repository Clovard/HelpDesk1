import { answerTelegramCallback, editTelegramMessage, sendTelegramMessage, type TelegramUpdate } from "../telegram-client";
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

type TicketCategory = "active" | "closed";
const TICKETS_PER_PAGE = 5;

const statusLabels: Record<string, string> = {
    New: "Новая",
    "Under Review": "На рассмотрении",
    "In Progress": "В работе",
    Closed: "Закрыта",
};

function employeeTicketBindings(telegramUserId: string) {
    return [
        telegramUserId,
        `ID: ${telegramUserId}`,
        `Идентификатор: ${telegramUserId}`,
        `%ID: ${telegramUserId})%`,
        `%идентификатор: ${telegramUserId})%`,
    ];
}

async function getEmployeeTicketCounts(env: BotEnv, telegramUserId: string) {
    const result = await env.DB.prepare(`
        SELECT
            SUM(CASE WHEN status <> 'Closed' THEN 1 ELSE 0 END) AS active_count,
            SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) AS closed_count
        FROM tickets
        WHERE telegram_user_id = ?
           OR (telegram_user_id IS NULL AND (
                employee_telegram_id = ? OR employee_telegram_id = ? OR
                employee_telegram_id LIKE ? OR employee_telegram_id LIKE ?
           ))
    `).bind(...employeeTicketBindings(telegramUserId)).first<{ active_count: number | null; closed_count: number | null }>();
    return { active: result?.active_count ?? 0, closed: result?.closed_count ?? 0 };
}

async function getEmployeeTickets(env: BotEnv, telegramUserId: string, category: TicketCategory, page: number) {
    const result = await env.DB.prepare(`
        SELECT id, public_id, status, problem
        FROM tickets
        WHERE (telegram_user_id = ?
           OR (telegram_user_id IS NULL AND (
                employee_telegram_id = ? OR employee_telegram_id = ? OR
                employee_telegram_id LIKE ? OR employee_telegram_id LIKE ?
           )))
          AND ${category === "closed" ? "status = 'Closed'" : "status <> 'Closed'"}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `).bind(...employeeTicketBindings(telegramUserId), TICKETS_PER_PAGE, page * TICKETS_PER_PAGE).all<EmployeeTicket>();
    return result.results;
}

async function showTicketPage(
    env: BotEnv,
    chatId: number,
    telegramUserId: string,
    category: TicketCategory,
    requestedPage: number,
    messageId?: number,
) {
    const counts = await getEmployeeTicketCounts(env, telegramUserId);
    const total = counts[category];
    const pageCount = Math.max(1, Math.ceil(total / TICKETS_PER_PAGE));
    const page = Math.min(Math.max(0, requestedPage), pageCount - 1);
    const tickets = await getEmployeeTickets(env, telegramUserId, category, page);
    const keyboard: Array<Array<{ text: string; callback_data: string }>> = tickets.map((ticket) => [{
        text: `${ticket.public_id} · ${statusLabels[ticket.status] || ticket.status}`,
        callback_data: `ticket_chat:${ticket.id}`,
    }]);

    const navigation: Array<{ text: string; callback_data: string }> = [];
    if (page > 0) navigation.push({ text: "← Назад", callback_data: `tickets_page:${category}:${page - 1}` });
    if ((page + 1) * TICKETS_PER_PAGE < total) navigation.push({ text: "Дальше →", callback_data: `tickets_page:${category}:${page + 1}` });
    if (navigation.length) keyboard.push(navigation);
    keyboard.push([{
        text: category === "active" ? `Закрытые (${counts.closed})` : `Активные (${counts.active})`,
        callback_data: `tickets_page:${category === "active" ? "closed" : "active"}:0`,
    }]);

    const categoryLabel = category === "active" ? "активные" : "закрытые";
    const text = total
        ? `Ваши ${categoryLabel} заявки · ${page + 1}/${pageCount}\n\n${tickets.map((ticket) =>
            `${ticket.public_id} · ${statusLabels[ticket.status] || ticket.status}\n${ticket.problem.slice(0, 90)}`,
        ).join("\n\n")}\n\nВыберите заявку, чтобы открыть переписку.`
        : `У вас пока нет ${categoryLabel} заявок.`;
    const markup = { inline_keyboard: keyboard };
    if (messageId !== undefined) {
        await editTelegramMessage(env.BOT_TOKEN, chatId, messageId, text, markup);
    } else {
        await sendTelegramMessage(env.BOT_TOKEN, chatId, text, markup);
    }
}

export async function handleMyTickets(env: BotEnv, chatId: number, telegramUserId: string) {
    const counts = await getEmployeeTicketCounts(env, telegramUserId);
    if (!counts.active && !counts.closed) {
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "У вас пока нет заявок, созданных через этот Telegram-аккаунт.", getMainKeyboard());
        return;
    }
    await showTicketPage(env, chatId, telegramUserId, counts.active ? "active" : "closed", 0);
}

export async function startTicketChat(env: BotEnv, chatId: number, ticketId: number) {
    const ticket = await env.DB.prepare("SELECT id, public_id FROM tickets WHERE id = ?")
        .bind(ticketId).first<{ id: number; public_id: string }>();
    if (!ticket) return false;
    await env.DB.prepare(`
        INSERT INTO bot_ticket_chats (chat_id, ticket_id, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chat_id) DO UPDATE SET ticket_id = excluded.ticket_id, updated_at = CURRENT_TIMESTAMP
    `).bind(String(chatId), ticket.id).run();
    await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        `Переписка по заявке ${ticket.public_id} открыта. Напишите сообщение здесь — оно появится в HelpDesk. Чтобы выбрать другую заявку, нажмите кнопку возврата ниже.`,
        { inline_keyboard: [[
            { text: "← К списку заявок", callback_data: "ticket_list" },
            { text: "Завершить переписку", callback_data: "ticket_end" },
        ]] },
    );
    return true;
}

async function handleTicketClosureCallback(
    env: BotEnv,
    callback: NonNullable<TelegramUpdate["callback_query"]>,
) {
    const match = /^tc:(\d+):([a-f0-9-]{36}):(yes|no)$/.exec(callback.data ?? "")
        ?? /^ticket_closed:(\d+):(yes|no)$/.exec(callback.data ?? "");
    if (!match) return false;
    // Acknowledge immediately so Telegram clears the button spinner while D1 is queried.
    await answerTelegramCallback(env.BOT_TOKEN, callback.id);
    if (!callback.message || callback.message.chat.type !== "private") {
        return true;
    }

    const isLegacyCallback = match.length === 3;
    const ticketId = Number(match[1]);
    const closureToken = isLegacyCallback ? null : match[2];
    const decision = (isLegacyCallback ? match[2] : match[3]) as "yes" | "no";
    const telegramUserId = String(callback.from.id);
    const ticket = await env.DB.prepare(`
        SELECT id, public_id, employee, status, initiator_acceptance, closure_confirmation_token
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
    ).first<{
        id: number;
        public_id: string;
        employee: string;
        status: string;
        initiator_acceptance: string | null;
        closure_confirmation_token: string | null;
    }>();

    if (!ticket) {
        return true;
    }
    if (ticket.status !== "Closed") {
        return true;
    }
    if (ticket.initiator_acceptance !== "pending") {
        return true;
    }
    if (ticket.closure_confirmation_token !== closureToken) {
        if (ticket.closure_confirmation_token) {
            await sendTelegramMessage(
                env.BOT_TOKEN,
                callback.message.chat.id,
                `Заявка ${ticket.public_id} закрыта. Подтвердите, пожалуйста, проблема решена?`,
                { inline_keyboard: [
                    [{ text: "✅ Да, проблема решена", callback_data: `tc:${ticket.id}:${ticket.closure_confirmation_token}:yes` }],
                    [{ text: "❌ Нет, проблема осталась", callback_data: `tc:${ticket.id}:${ticket.closure_confirmation_token}:no` }],
                ] },
            );
        }
        return true;
    }

    const senderName = [callback.from.first_name, callback.from.last_name].filter(Boolean).join(" ").trim()
        || (callback.from.username ? `@${callback.from.username}` : "Сотрудник");
    const confirmation = decision === "yes"
        ? "Сотрудник подтвердил, что проблема решена."
        : "Сотрудник сообщил, что проблема осталась.";
    const nextAcceptance = decision === "yes" ? "accepted" : "rejected";
    const updateAndRecord = await env.DB.batch([
        env.DB.prepare(`
            UPDATE tickets
            SET initiator_acceptance = ?,
                status = CASE WHEN ? = 'no' THEN 'In Progress' ELSE status END,
                closed_at = CASE WHEN ? = 'no' THEN NULL ELSE closed_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'Closed' AND initiator_acceptance = 'pending'
                AND closure_confirmation_token IS ?
        `).bind(nextAcceptance, decision, decision, ticket.id, closureToken),
        env.DB.prepare(`
            INSERT OR IGNORE INTO ticket_messages (
                ticket_id, sender_type, sender_telegram_id, telegram_message_id, sender_name, body
            )
            SELECT ?, 'employee', ?, ?, ?, ?
            WHERE EXISTS (
                SELECT 1 FROM tickets
                WHERE id = ? AND initiator_acceptance = ? AND closure_confirmation_token IS ?
            )
        `).bind(
            ticket.id,
            telegramUserId,
            callback.message.message_id,
            senderName,
            confirmation,
            ticket.id,
            nextAcceptance,
            closureToken,
        ),
    ]);
    const accepted = updateAndRecord[0].meta.changes > 0;
    const reopened = accepted && decision === "no";

    if (!accepted) {
        return true;
    }

    if (reopened) {
        await env.DB.prepare(`
            INSERT INTO ticket_events (ticket_id, event_type, old_value, new_value, author_name)
            VALUES (?, 'status_changed', 'Closed', 'In Progress', ?)
        `).bind(ticket.id, senderName).run();
        if (env.SUPPORT_CHAT_ID) {
            await sendTelegramMessage(
                env.BOT_TOKEN,
                env.SUPPORT_CHAT_ID,
                `⚠️ Сотрудник сообщил, что заявка ${ticket.public_id} не решена. Статус возвращён в «В работе».\nСотрудник: ${senderName}`,
            );
        }
    }

    const resultText = decision === "yes"
        ? "✅ Вы подтвердили, что проблема решена. Спасибо!"
        : reopened
            ? "❌ Вы сообщили, что проблема осталась. Заявка возвращена в работу."
            : "Ответ получен, но статус заявки уже изменился. Специалист проверит её.";
    await editTelegramMessage(
        env.BOT_TOKEN,
        callback.message.chat.id,
        callback.message.message_id,
        `${callback.message.text ?? `Заявка ${ticket.public_id}` }\n\n${resultText}`,
        { inline_keyboard: [] },
    );
    await sendTelegramMessage(env.BOT_TOKEN, callback.message.chat.id, resultText, getMainKeyboard());
    return true;
}

export async function handleTicketChatCallback(
    env: BotEnv,
    callback: NonNullable<TelegramUpdate["callback_query"]>,
) {
    if (await handleTicketClosureCallback(env, callback)) return true;

    if (callback.data === "ticket_end" && callback.message?.chat.type === "private") {
        const chatId = callback.message.chat.id;
        await env.DB.prepare("DELETE FROM bot_ticket_chats WHERE chat_id = ?")
            .bind(String(chatId)).run();
        await answerTelegramCallback(env.BOT_TOKEN, callback.id, "Переписка завершена");
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "Переписка завершена. Выберите действие в меню.", getMainKeyboard());
        return true;
    }

    if (callback.data === "ticket_list" && callback.message?.chat.type === "private") {
        const chatId = callback.message.chat.id;
        await env.DB.prepare("DELETE FROM bot_ticket_chats WHERE chat_id = ?")
            .bind(String(chatId)).run();
        const telegramUserId = String(callback.from.id);
        const counts = await getEmployeeTicketCounts(env, telegramUserId);
        const category: TicketCategory = counts.active ? "active" : "closed";
        await answerTelegramCallback(env.BOT_TOKEN, callback.id, "Возвращаю к списку заявок");
        await showTicketPage(env, chatId, telegramUserId, category, 0, callback.message.message_id);
        return true;
    }

    const pageMatch = /^tickets_page:(active|closed):(\d+)$/.exec(callback.data ?? "");
    if (pageMatch && callback.message?.chat.type === "private") {
        await answerTelegramCallback(env.BOT_TOKEN, callback.id);
        await showTicketPage(
            env,
            callback.message.chat.id,
            String(callback.from.id),
            pageMatch[1] as TicketCategory,
            Number(pageMatch[2]),
            callback.message.message_id,
        );
        return true;
    }

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

    await answerTelegramCallback(env.BOT_TOKEN, callback.id, "Переписка открыта");
    await startTicketChat(env, chatId, ticket.id);
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
