import { HelpdeskApiClient } from "../api-client";
import { getAttachmentsKeyboard, getChoiceKeyboard, getConfirmKeyboard, getMainKeyboard } from "../keyboards/main.keyboard";
import { getTelegramAttachment, sendTelegramMessage, type TelegramAttachment, type TelegramMessage } from "../telegram-client";
import { sendToSupportChat } from "../support-chat";

type BotEnv = { DB: D1Database; API_URL: string; BOT_TOKEN: string; SUPPORT_CHAT_ID?: string };
type IdeaSessionState = "city" | "department" | "system" | "idea" | "expectedResult" | "priority" | "attachments" | "confirmation";
type IdeaSessionData = {
    employee?: string;
    city?: string;
    department?: string;
    system?: string;
    idea?: string;
    expectedResult?: string;
    priority?: "Low" | "Medium" | "High";
    attachments?: TelegramAttachment[];
};
type IdeaSession = { state: IdeaSessionState; data: IdeaSessionData };

async function getSession(env: BotEnv, chatId: number): Promise<IdeaSession | null> {
    const row = await env.DB.prepare("SELECT state, payload FROM bot_sessions WHERE chat_id = ?")
        .bind(String(chatId)).first<{ state: IdeaSessionState; payload: string }>();
    if (!row) return null;
    return { state: row.state, data: JSON.parse(row.payload) as IdeaSessionData };
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
        attachments: "Прикрепите фото или файлы к идее. Когда закончите, нажмите «✅ Готово». Если вложений нет — «⏭ Пропустить».",
        confirmation: "Проверьте идею и подтвердите создание:",
    };
    return prompts[state];
}

function keyboard(state: IdeaSessionState) {
    if (state === "city") return getChoiceKeyboard(["Новосибирск", "Красноярск", "Томск", "Кемерово", "Братск", "Другой город"]);
    if (state === "department") return getChoiceKeyboard(["Офис", "Склад", "Логистика", "Бухгалтерия", "Закупки", "Другое"]);
    if (state === "priority") return getChoiceKeyboard(["Низкий", "Средний", "Высокий"]);
    if (state === "attachments") return getAttachmentsKeyboard();
    if (state === "confirmation") return getConfirmKeyboard();
    return undefined;
}

function formatPreview(data: IdeaSessionData) {
    const attachments = data.attachments ?? [];
    const photos = attachments.filter((item) => item.kind === "photo").length;
    const files = attachments.length - photos;
    return [
        "Проверьте идею:", "",
        `Сотрудник: ${data.employee}`, `Город: ${data.city}`, `Подразделение: ${data.department}`,
        `Система: ${data.system}`, `Идея: ${data.idea}`, `Ожидаемый результат: ${data.expectedResult || "не указан"}`,
        `Приоритет: ${priorityLabel(data.priority)}`,
        `Вложения: ${attachments.length ? `${photos} фото, ${files} файлов` : "нет"}`,
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
    const incomingAttachment = getTelegramAttachment(message);
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

    if (incomingAttachment) {
        if (session.state === "idea" && incomingAttachment.caption) {
            session.data.idea = incomingAttachment.caption;
            session.data.attachments = [...(session.data.attachments ?? []), incomingAttachment];
            session.state = "expectedResult";
            await saveSession(env, chatId, session);
            await sendTelegramMessage(env.BOT_TOKEN, chatId, prompt(session.state), keyboard(session.state));
            return true;
        }
        if (session.state === "idea") {
            session.data.attachments = [...(session.data.attachments ?? []), incomingAttachment];
            await saveSession(env, chatId, session);
            await sendTelegramMessage(env.BOT_TOKEN, chatId, "Вложение добавлено. Теперь опишите идею текстом.");
            return true;
        }
        if (session.state === "attachments" || session.state === "confirmation") {
            session.data.attachments = [...(session.data.attachments ?? []), incomingAttachment];
            await saveSession(env, chatId, session);
            await sendTelegramMessage(env.BOT_TOKEN, chatId,
                session.state === "confirmation" ? formatPreview(session.data) : "Вложение добавлено. Можете отправить ещё или нажать «✅ Готово».",
                session.state === "confirmation" ? getConfirmKeyboard() : getAttachmentsKeyboard());
            return true;
        }
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "Вложения можно добавить после описания идеи.");
        return true;
    }

    if (!text) return false;
    if (session.state === "attachments") {
        if (["✅ готово", "готово", "дальше", "⏭ пропустить", "пропустить", "без вложений"].includes(normalized)) {
            session.state = "confirmation";
            await saveSession(env, chatId, session);
            await sendTelegramMessage(env.BOT_TOKEN, chatId, formatPreview(session.data), getConfirmKeyboard());
        } else {
            await sendTelegramMessage(env.BOT_TOKEN, chatId, "Отправьте фото или файл, затем нажмите «✅ Готово». Если вложений нет — «⏭ Пропустить».", getAttachmentsKeyboard());
        }
        return true;
    }

    if (session.state === "confirmation") {
        if (!["yes", "да", "создать", "✅ да, создать"].includes(normalized)) {
            await sendTelegramMessage(env.BOT_TOKEN, chatId, "Нажмите «✅ Да, создать» или «✖ Отмена».", getConfirmKeyboard());
            return true;
        }
        const attachments = session.data.attachments ?? [];
        const photoCount = attachments.filter((item) => item.kind === "photo").length;
        const fileCount = attachments.length - photoCount;
        const result = await new HelpdeskApiClient({ apiUrl: env.API_URL }).createIdea({
            employee: session.data.employee!, city: session.data.city, department: session.data.department,
            system: session.data.system, idea: session.data.idea!, expectedResult: session.data.expectedResult,
            priority: session.data.priority, photoCount, fileCount,
        }) as { ok: boolean; publicId?: string; error?: string };
        await deleteSession(env, chatId);
        if (!result.ok) {
            await sendTelegramMessage(env.BOT_TOKEN, chatId, `Не удалось создать идею: ${result.error || "ошибка сервера"}`);
            return true;
        }
        const publicId = result.publicId || "создана";
        const summary = [
            `Новое предложение ${publicId}`, `Сотрудник: ${session.data.employee}`,
            `Город: ${session.data.city}`, `Подразделение: ${session.data.department}`,
            `Система: ${session.data.system}`, `Идея: ${session.data.idea}`,
            `Ожидаемый результат: ${session.data.expectedResult || "не указан"}`,
            `Приоритет: ${priorityLabel(session.data.priority)}`,
            `Вложения: ${photoCount} фото, ${fileCount} файлов`,
        ].join("\n");
        const delivery = await sendToSupportChat(env.BOT_TOKEN, env.SUPPORT_CHAT_ID, publicId, summary, attachments);
        const note = !delivery.configured
            ? "\nКопия в рабочую группу не отправлена: не задан SUPPORT_CHAT_ID."
            : !delivery.summarySent
                ? "\nНе удалось отправить копию в группу. Проверьте chat ID и права бота."
                : delivery.sentAttachmentCount < delivery.attachmentCount
                    ? `\nВ группу отправлено вложений: ${delivery.sentAttachmentCount} из ${delivery.attachmentCount}.` : "";
        await sendTelegramMessage(env.BOT_TOKEN, chatId, `✅ Идея создана!\nНомер: ${publicId}${note}`, getMainKeyboard());
        return true;
    }

    const order: IdeaSessionState[] = ["city", "department", "system", "idea", "expectedResult", "priority", "attachments", "confirmation"];
    const currentIndex = order.indexOf(session.state);
    if (currentIndex < 0 || session.state === "confirmation" || session.state === "attachments") {
        await deleteSession(env, chatId);
        return false;
    }
    if (session.state === "city" && !["Новосибирск", "Красноярск", "Томск", "Кемерово", "Братск", "Другой город"].includes(text)) {
        await sendTelegramMessage(env.BOT_TOKEN, chatId, "Выберите город кнопкой ниже.", keyboard("city"));
        return true;
    }
    if (session.state === "department" && !["Офис", "Склад", "Логистика", "Бухгалтерия", "Закупки", "Другое"].includes(text)) {
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
