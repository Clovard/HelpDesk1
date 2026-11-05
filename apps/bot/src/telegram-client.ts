export type TelegramMessage = {
    message_id: number;
    chat: {
        id: number;
    };
    from?: {
        id: number;
        first_name?: string;
        last_name?: string;
        username?: string;
    };
    text?: string;
};

export type TelegramUpdate = {
    update_id: number;
    message?: TelegramMessage;
};

export async function sendTelegramMessage(
token: string,
chatId: number,
text: string,
replyMarkup?: unknown,
) {
    const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            reply_markup: replyMarkup,
        }),
    },
    );

    const result = await response.json() as {
        ok?: boolean;
        description?: string;
        error_code?: number;
    };

    if (!response.ok || result.ok === false) {
        console.error("Telegram sendMessage failed", {
            status: response.status,
            errorCode: result.error_code,
            description: result.description,
        });
    }

    return result;
}
