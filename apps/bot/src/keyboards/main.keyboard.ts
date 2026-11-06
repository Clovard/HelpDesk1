export const MAIN_ACTIONS = {
    createTicket: "🛠 Создать заявку",
    createIdea: "💡 Предложить идею",
    myTickets: "📋 Мои заявки",
};

export function getMainKeyboard() {
    return {
        keyboard: [
            [{ text: MAIN_ACTIONS.createTicket }, { text: MAIN_ACTIONS.createIdea }],
            [{ text: MAIN_ACTIONS.myTickets }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
    };
}

export function getChoiceKeyboard(options: string[], includeCancel = true) {
    const keyboard = options.map((text) => [{ text }]);
    if (includeCancel) keyboard.push([{ text: "Отмена" }]);
    return { keyboard, resize_keyboard: true, one_time_keyboard: true };
}

export function getConfirmKeyboard() {
    return {
        keyboard: [[{ text: "✅ Да, создать" }, { text: "✖ Отмена" }]],
        resize_keyboard: true,
        one_time_keyboard: true,
    };
}
