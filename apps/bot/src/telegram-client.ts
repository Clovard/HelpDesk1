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
    caption?: string;
    photo?: Array<{ file_id: string; width: number; height: number; file_size?: number }>;
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
};

export type TelegramAttachment = {
    kind: "photo" | "file";
    fileId: string;
    fileName: string;
    caption?: string;
};

export type TelegramUpdate = {
    update_id: number;
    message?: TelegramMessage;
};

export function getTelegramAttachment(message: TelegramMessage): TelegramAttachment | null {
    if (message.photo?.length) {
        const photo = message.photo[message.photo.length - 1];
        return { kind: "photo", fileId: photo.file_id, fileName: "Скриншот", caption: message.caption?.trim() || undefined };
    }
    if (message.document) {
        return {
            kind: "file",
            fileId: message.document.file_id,
            fileName: message.document.file_name || "Файл",
            caption: message.caption?.trim() || undefined,
        };
    }
    return null;
}

async function callTelegram(
    token: string,
    method: string,
    payload: Record<string, unknown>,
) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const result = await response.json() as { ok?: boolean; description?: string; error_code?: number };
    if (!response.ok || result.ok === false) {
        console.error(`Telegram ${method} failed`, {
            status: response.status,
            errorCode: result.error_code,
            description: result.description,
        });
    }
    return result;
}

export async function sendTelegramMessage(
token: string,
chatId: number | string,
text: string,
replyMarkup?: unknown,
) {
    return callTelegram(token, "sendMessage", {
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
    });
}

export async function sendTelegramAttachment(
    token: string,
    chatId: number | string,
    attachment: TelegramAttachment,
    caption: string,
) {
    const method = attachment.kind === "photo" ? "sendPhoto" : "sendDocument";
    const mediaKey = attachment.kind === "photo" ? "photo" : "document";
    const fullCaption = [caption, attachment.caption].filter(Boolean).join("\n").slice(0, 1000);
    return callTelegram(token, method, {
        chat_id: chatId,
        [mediaKey]: attachment.fileId,
        caption: fullCaption,
    });
}
