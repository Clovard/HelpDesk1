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

type Env = {
    DB: D1Database;
    BOT_TOKEN: string;
    API_URL: string;
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

        if (!message?.text) {
            return new Response("OK");
        }

        const chatId = message.chat.id;
        const text = message.text.trim();

        if (text === "/start") {
            await handleStart(
            env.BOT_TOKEN,
            chatId,
            message.from?.first_name,
            );

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

        if (text === "My Tickets") {
            await handleMyTickets(
            env,
            chatId,
            message.from?.first_name ||
            "Unknown Employee",
            );

            return new Response("OK");
        }

        await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        "Please choose an action from the menu.",
        );

        return new Response("OK");
    },
};