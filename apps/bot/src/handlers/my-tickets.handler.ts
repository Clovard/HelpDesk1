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
        "У вас пока нет заявок.",
        );

        return;
    }

    const statusLabels: Record<string, string> = {
        New: "Новая",
        "Under Review": "На рассмотрении",
        "In Progress": "В работе",
        Closed: "Закрыта",
    };

    const message = tickets
    .slice(0, 20)
    .map((ticket) => {
        return [
        `Номер: ${ticket.public_id}`,
        `Статус: ${statusLabels[ticket.status] || ticket.status}`,
        `Проблема: ${ticket.problem}`,
        ].join("\n");
    })
    .join("\n\n");

    await sendTelegramMessage(
    env.BOT_TOKEN,
    chatId,
    `Ваши заявки:\n\n${message}`,
    );
}
