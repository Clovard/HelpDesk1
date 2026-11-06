import { getMainKeyboard } from "../keyboards/main.keyboard";
import { sendTelegramMessage } from "../telegram-client";

export async function handleStart(
    token: string,
    chatId: number,
    firstName?: string,
) {
    const name = firstName || "коллега";

    return sendTelegramMessage(
        token,
        chatId,
        `Привет, ${name}! 👋\n\nДобро пожаловать в IT-поддержку. Выберите действие:`,
        getMainKeyboard(),
    );
}
