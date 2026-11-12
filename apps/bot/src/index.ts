import {
handleStart,
} from "./handlers/start.handler";

import {
handleMyTickets,
} from "./handlers/my-tickets.handler";

import {
handleCreateTicketFlow,
} from "./flows/create-ticket.flow";

import {
handleCreateIdeaFlow,
} from "./flows/create-idea.flow";

import {
sendTelegramMessage,
type TelegramUpdate,
} from "./telegram-client";
import { getMainKeyboard, MAIN_ACTIONS } from "./keyboards/main.keyboard";

type Env = {
    DB: D1Database;
    BOT_TOKEN: string;
    API_URL: string;
    SUPPORT_CHAT_ID?: string;
};

export default {
    async fetch(
    request: Request,
    env: Env,
    ): Promise<Response> {
        if (request.method !== "POST") {
            return new Response(
            "Helpdesk Bot is running",
            );
        }

        const update =
        await request.json<TelegramUpdate>();

        const message = update.message;

        if (!message) {
            return new Response("OK");
        }

        const chatId = message.chat.id;
        const text = message.text?.trim() ?? "";
        const normalized = text.toLocaleLowerCase("ru").replace(/[✅✖❌🛠💡📋]/gu, "").trim();

        if (text === "/chatid") {
            await sendTelegramMessage(env.BOT_TOKEN, chatId, `ID этого чата: ${chatId}`);
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
            await handleMyTickets(
            env,
            chatId,
            message.from?.first_name ||
            "Сотрудник",
            );

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
