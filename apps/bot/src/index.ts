import {
handleStart,
} from "./handlers/start.handler";
import { sendHelp } from "./handlers/help.handler";

import {
handleMyTickets,
handleTicketChatCallback,
handleTicketChatMessage,
} from "./handlers/my-tickets.handler";

import {
handleCreateTicketFlow,
} from "./flows/create-ticket.flow";

import {
handleCreateIdeaFlow,
} from "./flows/create-idea.flow";

import {
answerTelegramCallback,
sendTelegramMessage,
type TelegramUpdate,
} from "./telegram-client";
import { getMainKeyboard, MAIN_ACTIONS } from "./keyboards/main.keyboard";

type Env = {
    DB: D1Database;
    BOT_TOKEN: string;
    API_URL: string;
    BOT_API_TOKEN?: string;
    TELEGRAM_WEBHOOK_SECRET?: string;
    SUPPORT_CHAT_ID?: string;
};

export default {
    async fetch(
    request: Request,
    env: Env,
    ): Promise<Response> {
        if (request.method !== "POST") {
            return new Response(
            "Бот поддержки работает",
            );
        }

        if (env.TELEGRAM_WEBHOOK_SECRET) {
            const providedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
            if (!constantTimeEqual(providedSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
                return new Response("Unauthorized", { status: 401 });
            }
        }

        const update =
        await request.json<TelegramUpdate>();

        if (update.callback_query) {
            // Answer before any DB work so every inline button stops spinning immediately.
            await answerTelegramCallback(env.BOT_TOKEN, update.callback_query.id);
            try {
                await handleTicketChatCallback(env, update.callback_query);
            } catch (error) {
                console.error("Telegram callback processing failed", error);
                const chatId = update.callback_query.message?.chat.id;
                if (chatId !== undefined) {
                    await sendTelegramMessage(env.BOT_TOKEN, chatId, "Не удалось обработать нажатие. Ответ не сохранён; попробуйте ещё раз чуть позже.");
                }
            }
            return new Response("OK");
        }

        const message = update.message;

        if (!message) {
            return new Response("OK");
        }

        const chatId = message.chat.id;
        if (message.photo?.length || message.document) {
            if (message.chat.type === "private") {
                await sendTelegramMessage(env.BOT_TOKEN, chatId, "Приём фото и файлов временно отключён. Отправьте описание текстом.");
            }
            return new Response("OK");
        }
        const text = message.text?.trim() ?? "";
        const normalized = text.toLocaleLowerCase("ru").replace(/[✅✖❌🛠💡📋]/gu, "").trim();

        if (text === "/chatid") {
            await sendTelegramMessage(env.BOT_TOKEN, chatId, `Идентификатор этого чата: ${chatId}`);
            return new Response("OK");
        }

        if (text === MAIN_ACTIONS.help || ["/help", "help", "помощь", "как пользоваться"].includes(normalized)) {
            const [activeSession, selectedTicket] = await Promise.all([
                env.DB.prepare("SELECT chat_id FROM bot_sessions WHERE chat_id = ?").bind(String(chatId)).first<{ chat_id: string }>(),
                env.DB.prepare("SELECT chat_id FROM bot_ticket_chats WHERE chat_id = ?").bind(String(chatId)).first<{ chat_id: string }>(),
            ]);
            const replyMarkup = activeSession || selectedTicket ? undefined : getMainKeyboard();
            await sendHelp(env.BOT_TOKEN, chatId, replyMarkup);
            return new Response("OK");
        }

        // Reset stale ticket/idea sessions before any flow can consume the message as form data.
        if (text === "/start") {
            await env.DB.prepare("DELETE FROM bot_sessions WHERE chat_id = ?").bind(String(chatId)).run();
            await handleStart(env.BOT_TOKEN, chatId, message.from?.first_name);
            return new Response("OK");
        }
        if (text && ["отмена", "cancel", "/cancel"].includes(normalized)) {
            await env.DB.prepare("DELETE FROM bot_sessions WHERE chat_id = ?").bind(String(chatId)).run();
            await sendTelegramMessage(env.BOT_TOKEN, chatId, "Действие отменено. Выберите, что сделать дальше:", getMainKeyboard());
            return new Response("OK");
        }

        const ticketFlowHandled =
        await handleCreateTicketFlow(
        env,
        message,
        );

        if (ticketFlowHandled) {
            return new Response("OK");
        }

        const ideaFlowHandled =
        await handleCreateIdeaFlow(
        env,
        message,
        );

        if (ideaFlowHandled) {
            return new Response("OK");
        }

        if (text && [MAIN_ACTIONS.myTickets, "Мои заявки", "My Tickets"].includes(text)) {
            await env.DB.prepare("DELETE FROM bot_ticket_chats WHERE chat_id = ?")
                .bind(String(chatId)).run();
            await handleMyTickets(
            env,
            chatId,
            String(message.from?.id ?? chatId),
            );

            return new Response("OK");
        }

        if (await handleTicketChatMessage(env, message)) {
            return new Response("OK");
        }

        if (!text && !message.photo?.length && !message.document) return new Response("OK");

        await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        "Выберите действие с помощью кнопок меню.",
        getMainKeyboard(),
        );

        return new Response("OK");
    },
};

function constantTimeEqual(left: string, right: string) {
    if (left.length !== right.length) return false;
    let mismatch = 0;
    for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return mismatch === 0;
}
