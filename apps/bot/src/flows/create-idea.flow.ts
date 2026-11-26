import { HelpdeskApiClient } from "../api-client";
import { getChoiceKeyboard, getConfirmKeyboard, getMainKeyboard } from "../keyboards/main.keyboard";
import { sendTelegramMessage, type TelegramMessage } from "../telegram-client";
import { sendToSupportChat } from "../support-chat";

type BotEnv = { DB: D1Database; API_URL: string; BOT_TOKEN: string; BOT_API_TOKEN?: string; SUPPORT_CHAT_ID?: string };
type IdeaSessionState = "city" | "department" | "system" | "idea" | "expectedResult" | "priority" | "confirmation";
type IdeaSessionData = {
    employee?: string;
    city?: string;
    department?: string;
    system?: string;
    idea?: string;
    expectedResult?: string;
    priority?: "Low" | "Medium" | "High";
};
type IdeaSession = { state: IdeaSessionState; data: IdeaSessionData };

async function getSession(env: BotEnv, chatId: number): Promise<IdeaSession | null> {
    const row = await env.DB.prepare("SELECT state, payload FROM bot_sessions WHERE chat_id = ?")
        .bind(String(chatId)).first<{ state: string; payload: string }>();
    if (!row) return null;
    const data = JSON.parse(row.payload) as IdeaSessionData & { attachments?: unknown };
    const hadAttachments = "attachments" in data;
    delete data.attachments;
    const state: IdeaSessionState = row.state === "attachments" ? "confirmation" : row.state as IdeaSessionState;
    const session = { state, data };
    if (hadAttachments || row.state !== state) await saveSession(env, chatId, session);
    return session;
}

async function saveSession(env: BotEnv, chatId: number, session: IdeaSession) {
    await env.DB.prepare(`INSERT INTO bot_sessions (chat_id, state, payload, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chat_id) DO UPDATE SET state=excluded.state, payload=excluded.payload, updated_at=CURRENT_TIMESTAMP`)
        .bind(String(chatId), session.state, JSON.stringify(session.data)).run();
}

async function deleteSession(env: BotEnv, chatId: number) {
    await env.DB.prepare("DELETE FROM bot_sessions WHERE chat_id = ?").bind(String(chatId)).run();
}

function priorityLabel(priority: IdeaSessionData["priority"]) {
    return { Low: "Низкий", Medium: "Средний", High: "Высокий" }[priority || "Medium"];
}

function prompt(state: IdeaSessionState) {
    const prompts: Record<IdeaSessionState, string> = {
        city: "Выберите ваш город:",
        department: "Выберите подразделение:",
        system: "Укажите систему или процесс:",
        idea: "Опишите вашу идею:",
        expectedResult: "Какого результата вы ожидаете?",
        priority: "Выберите приоритет идеи:",
        confirmation: "Проверьте идею и подтвердите создание:",
    };
    return prompts[state];
}

function keyboard(state: IdeaSessionState) {
    if (state === "city") return getChoiceKeyboard(["Новосибирск", "Красноярск", "Томск", "Кемерово", "Барнаул"]);
    if (state === "department") return getChoiceKeyboard(["Офис", "Склад", "Логистика", "Закупки", "Другое"]);
    if (state === "priority") return getChoiceKeyboard(["Низкий", "Средний", "Высокий"]);
    if (state === "confirmation") return getConfirmKeyboard();
    return undefined;
}

function formatPreview(data: IdeaSessionData) {
    return [
        "Проверьте идею:", "",
        `Сотрудник: ${data.employee}`, `Город: ${data.city}`, `Подразделение: ${data.department}`,
        `Система: ${data.system}`, `Идея: ${data.idea}`, `Ожидаемый результат: ${data.expectedResult || "не указан"}`,
        `Приоритет: ${priorityLabel(data.priority)}`,
        "", "Создать идею?",
    ].join("\n");
}

function normalizePriority(value: string): "Low" | "Medium" | "High" {
    const normalized = value.toLocaleLowerCase("ru");
    if (normalized === "low" || normalized === "низкий") return "Low";
    if (normalized === "high" || normalized === "высокий") return "High";
    return "Medium";
}

export async function handleCreateIdeaFlow(env: BotEnv, message: TelegramMessage) {
    const chatId = message.chat.id;
    const text = message.text?.trim() ?? "";
    const normalized = text.toLocaleLowerCase("ru");
    let session = await getSession(env, chatId);

    if (["💡 Предложить идею", "Предложить идею", "Create Idea"].includes(text)) {
        const from = message.from;
        const employee = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim()
            || (from?.username ? `@${from.username}` : "Пользователь Telegram");
        session = { state: "city", data: { employee } };
        await saveSession(env, chatId, session);
        await sendTelegramMessage(env.BOT_TOKEN, chatId, prompt(session.state), keyboard(session.state));
        return true;
    }
    if (!session) return false;

    if (text && ["cancel", "отмена", "✖ отмена", "/cancel"].includes(normalized)) {
        await deleteSession(env, chatId);
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "Создание идеи отменено.", getMainKeyboard());
        return true;
    }
    if (!text) return false;
    if (session.state === "confirmation") {
        if (!["yes", "да", "создать", "✅ да, создать"].includes(normalized)) {
            await sendTelegramMessage(env.BOT_TOKEN, chatId, "Нажмите «✅ Да, создать» или «✖ Отмена».", getConfirmKeyboard());
            return true;
        }
        const result = await new HelpdeskApiClient({ apiUrl: env.API_URL, apiToken: env.BOT_API_TOKEN }).createIdea({
            employee: session.data.employee!, city: session.data.city, department: session.data.department,
            system: session.data.system, idea: session.data.idea!, expectedResult: session.data.expectedResult,
            priority: session.data.priority,
        }) as { ok: boolean; publicId?: string; error?: string };
        await deleteSession(env, chatId);
        if (!result.ok) {
            await sendTelegramMessage(env.BOT_TOKEN, chatId, "Не удалось создать идею. Попробуйте ещё раз позже.", getMainKeyboard());
            return true;
        }
        const publicId = result.publicId || "создана";
        const summary = [
            `Новое предложение ${publicId}`, `Сотрудник: ${session.data.employee}`,
            `Город: ${session.data.city}`, `Подразделение: ${session.data.department}`,
            `Система: ${session.data.system}`, `Идея: ${session.data.idea}`,
            `Ожидаемый результат: ${session.data.expectedResult || "не указан"}`,
            `Приоритет: ${priorityLabel(session.data.priority)}`,
        ].join("\n");
        const delivery = await sendToSupportChat(env.BOT_TOKEN, env.SUPPORT_CHAT_ID, publicId, summary, []);
        const note = !delivery.configured
            ? "\nКопия в рабочую группу не отправлена: не задан её идентификатор."
            : !delivery.summarySent
                ? "\nНе удалось отправить копию в группу. Проверьте её идентификатор и права бота."
                : "";
        await sendTelegramMessage(env.BOT_TOKEN, chatId, `✅ Идея создана!\nНомер: ${publicId}${note}`, getMainKeyboard());
        return true;
    }

    const order: IdeaSessionState[] = ["city", "department", "system", "idea", "expectedResult", "priority", "confirmation"];
    const currentIndex = order.indexOf(session.state);
    if (currentIndex < 0 || session.state === "confirmation") {
        await deleteSession(env, chatId);
        return false;
    }
    if (session.state === "city" && !["Новосибирск", "Красноярск", "Томск", "Кемерово", "Барнаул"].includes(text)) {
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "Выберите город кнопкой ниже.", keyboard("city"));
        return true;
    }
    if (session.state === "department" && !["Офис", "Склад", "Логистика", "Закупки", "Другое"].includes(text)) {
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "Выберите подразделение кнопкой ниже.", keyboard("department"));
        return true;
    }
    if (session.state === "priority") session.data.priority = normalizePriority(text);
    else session.data[session.state] = text;

    session.state = order[currentIndex + 1];
    await saveSession(env, chatId, session);
    await sendTelegramMessage(env.BOT_TOKEN, chatId,
        session.state === "confirmation" ? formatPreview(session.data) : prompt(session.state), keyboard(session.state));
    return true;
}
