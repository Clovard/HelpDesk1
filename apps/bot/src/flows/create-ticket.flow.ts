import { HelpdeskApiClient } from "../api-client";
import { getChoiceKeyboard, getConfirmKeyboard, MAIN_ACTIONS } from "../keyboards/main.keyboard";
import { sendTelegramMessage, type TelegramMessage } from "../telegram-client";

type BotEnv = { DB: D1Database; API_URL: string; BOT_TOKEN: string };
type TicketSessionState = "city" | "department" | "system" | "type" | "problem" | "confirmation";
type TicketSessionData = { employee?: string; telegramId?: string; city?: string; department?: string; system?: string; type?: string; problem?: string };
type TicketSession = { state: TicketSessionState; data: TicketSessionData };

const cities = ["Новосибирск", "Красноярск", "Томск", "Кемерово", "Братск", "Другой город"];
const departments = ["Офис", "Склад", "Логистика", "Бухгалтерия", "Закупки", "Другое"];
const types = ["Не работает", "Ошибка", "Доступ", "Настройка", "Оборудование", "Другое"];

async function getSession(env: BotEnv, chatId: number): Promise<TicketSession | null> {
    const row = await env.DB.prepare("SELECT state, payload FROM bot_sessions WHERE chat_id = ?")
        .bind(String(chatId)).first<{ state: TicketSessionState; payload: string }>();
    if (!row) return null;
    const data = JSON.parse(row.payload) as TicketSessionData;
    // Discard a session from the previous English form so it cannot ask irrelevant questions.
    if ("expectedResult" in data || "scale" in data) {
        await deleteSession(env, chatId);
        return null;
    }
    return { state: row.state, data };
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
        `Проблема: ${data.problem}`, "", "Создать заявку?"] .join("\n");
}

export async function handleCreateTicketFlow(env: BotEnv, message: TelegramMessage) {
    const chatId = message.chat.id;
    const text = message.text?.trim();
    if (!text) return false;

    let session = await getSession(env, chatId);
    if ([MAIN_ACTIONS.createTicket, "Создать заявку", "🛠 создать заявку", "Create Ticket", "/ticket"].includes(text)) {
        const from = message.from;
        const employee = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim()
            || (from?.username ? `@${from.username}` : "Пользователь Telegram");
        session = {
            state: "city",
            data: {
                employee,
                telegramId: from?.username ? `@${from.username} (ID: ${from.id})` : `ID: ${from?.id ?? chatId}`,
            },
        };
        await saveSession(env, chatId, session);
        await sendTelegramMessage(env.BOT_TOKEN, chatId, promptFor(session.state), keyboardFor(session.state));
        return true;
    }
    if (!session) return false;

    const normalized = text.toLocaleLowerCase("ru");
    if (["отмена", "✖ отмена", "/cancel"].includes(normalized)) {
        await deleteSession(env, chatId);
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "Создание заявки отменено.");
        return true;
    }

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
        await sendTelegramMessage(env.BOT_TOKEN, chatId,
            result.ok ? `✅ Заявка создана!\nНомер: ${result.publicId || result.ticket?.public_id || "создана"}` : `Не удалось создать заявку: ${result.error || "ошибка сервера"}`);
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
