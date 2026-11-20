import { HelpdeskApiClient } from "../api-client";
import { getChoiceKeyboard, getConfirmKeyboard, getMainKeyboard, MAIN_ACTIONS } from "../keyboards/main.keyboard";
import { sendTelegramMessage, type TelegramMessage } from "../telegram-client";
import { sendToSupportChat } from "../support-chat";

type BotEnv = { DB: D1Database; API_URL: string; BOT_TOKEN: string; SUPPORT_CHAT_ID?: string };
type TicketSessionState = "city" | "department" | "system" | "type" | "problem" | "confirmation";
type TicketSessionData = { employee?: string; telegramId?: string; city?: string; department?: string; system?: string; type?: string; problem?: string };
type TicketSession = { state: TicketSessionState; data: TicketSessionData };

const cities = ["Новосибирск", "Красноярск", "Томск", "Кемерово", "Барнаул"];
const departments = ["Офис", "Склад", "Логистика", "Закупки", "Другое"];
const types = ["Не работает", "Ошибка", "Доступ", "Настройка", "Оборудование", "Другое"];

async function getSession(env: BotEnv, chatId: number): Promise<TicketSession | null> {
    const row = await env.DB.prepare("SELECT state, payload FROM bot_sessions WHERE chat_id = ?")
        .bind(String(chatId)).first<{ state: string; payload: string }>();
    if (!row) return null;
    const data = JSON.parse(row.payload) as TicketSessionData & { attachments?: unknown };
    // Skip the old attachment step for sessions created before attachments were disabled.
    if ("expectedResult" in data || "scale" in data) {
        await deleteSession(env, chatId);
        return null;
    }
    const hadAttachments = "attachments" in data;
    delete data.attachments;
    const state: TicketSessionState = row.state === "attachments" ? "confirmation" : row.state as TicketSessionState;
    const session = { state, data };
    if (hadAttachments || row.state !== state) await saveSession(env, chatId, session);
    return session;
}

async function saveSession(env: BotEnv, chatId: number, session: TicketSession) {
    await env.DB.prepare(`INSERT INTO bot_sessions (chat_id, state, payload, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chat_id) DO UPDATE SET state=excluded.state, payload=excluded.payload, updated_at=CURRENT_TIMESTAMP`)
        .bind(String(chatId), session.state, JSON.stringify(session.data)).run();
}

async function deleteSession(env: BotEnv, chatId: number) {
    await env.DB.prepare("DELETE FROM bot_sessions WHERE chat_id = ?").bind(String(chatId)).run();
}

function promptFor(state: TicketSessionState) {
    const prompts: Record<TicketSessionState, string> = {
        city: "Выберите ваш город:",
        department: "Выберите подразделение:",
        system: "В какой программе или системе возникла проблема? Например: 1С, почта, принтер.",
        type: "Выберите тип проблемы:",
        problem: "Опишите, что случилось и что именно не работает.",
        confirmation: "Проверьте заявку и подтвердите создание:",
    };
    return prompts[state];
}

function keyboardFor(state: TicketSessionState) {
    if (state === "city") return getChoiceKeyboard(cities);
    if (state === "department") return getChoiceKeyboard(departments);
    if (state === "type") return getChoiceKeyboard(types);
    if (state === "confirmation") return getConfirmKeyboard();
    return undefined;
}

function preview(data: TicketSessionData) {
    return ["Проверьте заявку:", "", `Сотрудник: ${data.employee || "Пользователь Telegram"}`, `Telegram: ${data.telegramId || "не указан"}`, `Город: ${data.city}`,
        `Подразделение: ${data.department}`, `Система: ${data.system}`, `Тип: ${data.type}`,
        `Проблема: ${data.problem}`, "", "Создать заявку?"].join("\n");
}

export async function handleCreateTicketFlow(env: BotEnv, message: TelegramMessage) {
    const chatId = message.chat.id;
    const text = message.text?.trim();

    let session = await getSession(env, chatId);
    if (text && [MAIN_ACTIONS.createTicket, "Создать заявку", "🛠 создать заявку", "Create Ticket", "/ticket"].includes(text)) {
        const from = message.from;
        const employee = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim()
            || (from?.username ? `@${from.username}` : "Пользователь Telegram");
        session = {
            state: "city",
            data: {
                employee,
                telegramId: from?.username ? `@${from.username} (идентификатор: ${from.id})` : `Идентификатор: ${from?.id ?? chatId}`,
            },
        };
        await saveSession(env, chatId, session);
        await sendTelegramMessage(env.BOT_TOKEN, chatId, promptFor(session.state), keyboardFor(session.state));
        return true;
    }
    if (!session) return false;

    const normalized = text?.toLocaleLowerCase("ru") || "";
    if (text && ["отмена", "✖ отмена", "/cancel"].includes(normalized)) {
        await deleteSession(env, chatId);
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "Создание заявки отменено.");
        return true;
    }
    if (!text) return false;
    if (session.state === "confirmation") {
        if (!["✅ да, создать", "да", "создать"].includes(normalized)) {
            await sendTelegramMessage(env.BOT_TOKEN, chatId, "Нажмите «✅ Да, создать» или «✖ Отмена».", getConfirmKeyboard());
            return true;
        }
        const result = await new HelpdeskApiClient({ apiUrl: env.API_URL }).createTicket({
            employee: session.data.employee!, city: session.data.city, department: session.data.department,
            system: session.data.system, type: session.data.type, problem: session.data.problem!,
            employeeTelegramId: session.data.telegramId,
        }) as { ok: boolean; publicId?: string; ticket?: { public_id?: string }; error?: string };
        await deleteSession(env, chatId);
        if (!result.ok) {
            await sendTelegramMessage(env.BOT_TOKEN, chatId, "Не удалось создать заявку. Попробуйте ещё раз позже.", getMainKeyboard());
            return true;
        }
        const publicId = result.publicId || result.ticket?.public_id || "создана";
        const summary = [
            `Новая заявка ${publicId}`,
            `Сотрудник: ${session.data.employee}`,
            `Telegram: ${session.data.telegramId || "не указан"}`,
            `Город: ${session.data.city}`,
            `Подразделение: ${session.data.department}`,
            `Система: ${session.data.system}`,
            `Тип: ${session.data.type}`,
            `Проблема: ${session.data.problem}`,
            "Уровень: L1",
            "Ответственный: Андрей",
        ].join("\n");
        const supportDelivery = await sendToSupportChat(env.BOT_TOKEN, env.SUPPORT_CHAT_ID, publicId, summary, []);
        let deliveryNote = "";
        if (!supportDelivery.configured) deliveryNote = "\nУведомление в рабочую группу не отправлено: не задан её идентификатор.";
        else if (!supportDelivery.summarySent) deliveryNote = "\nНе удалось отправить копию в рабочую группу. Проверьте её идентификатор и права бота.";
        await sendTelegramMessage(env.BOT_TOKEN, chatId, `✅ Заявка создана!\nНомер: ${publicId}${deliveryNote}`, getMainKeyboard());
        return true;
    }

    const order: TicketSessionState[] = ["city", "department", "system", "type", "problem", "confirmation"];
    const currentIndex = order.indexOf(session.state);
    if (currentIndex < 0) { await deleteSession(env, chatId); return false; }
    if (session.state === "city" && !cities.includes(text)) {
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "Выберите город кнопкой ниже.", getChoiceKeyboard(cities)); return true;
    }
    if (session.state === "department" && !departments.includes(text)) {
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "Выберите подразделение кнопкой ниже.", getChoiceKeyboard(departments)); return true;
    }
    if (session.state === "type" && !types.includes(text)) {
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "Выберите тип проблемы кнопкой ниже.", getChoiceKeyboard(types)); return true;
    }
    if (session.state !== "confirmation") session.data[session.state] = text;
    session.state = order[currentIndex + 1];
    await saveSession(env, chatId, session);
    await sendTelegramMessage(env.BOT_TOKEN, chatId,
        session.state === "confirmation" ? preview(session.data) : promptFor(session.state),
        keyboardFor(session.state));
    return true;
}
