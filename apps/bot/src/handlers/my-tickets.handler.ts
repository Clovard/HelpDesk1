import {
HelpdeskApiClient,
} from "../api-client";

import {
sendTelegramMessage,
} from "../telegram-client";

type Env = {
    BOT_TOKEN: string;
    API_URL: string;
};

export async function handleMyTickets(
env: Env,
chatId: number,
employeeName: string,
) {
    const api = new HelpdeskApiClient({
        apiUrl: env.API_URL,
    });

    const tickets =
    await api.getTicketsByEmployee(
    employeeName,
    );

    if (tickets.length === 0) {
        await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        "You do not have any tickets yet.",
        );

        return;
    }

    const message = tickets
    .slice(0, 20)
    .map((ticket) => {
        return [
        `ID: ${ticket.public_id}`,
        `Status: ${ticket.status}`,
        `Problem: ${ticket.problem}`,
        ].join("\n");
    })
    .join("\n\n");

    await sendTelegramMessage(
    env.BOT_TOKEN,
    chatId,
    `Your tickets:\n\n${message}`,
    );
}