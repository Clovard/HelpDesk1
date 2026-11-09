import {
sendTelegramMessage,
type TelegramMessage,
} from "../telegram-client";

import {
HelpdeskApiClient,
} from "../api-client";
import { getChoiceKeyboard, getConfirmKeyboard } from "../keyboards/main.keyboard";

type BotEnv = {
    DB: D1Database;
    API_URL: string;
    BOT_TOKEN: string;
};

type IdeaSessionState =
| "city"
| "department"
| "system"
| "idea"
| "expectedResult"
| "priority"
| "confirmation";

type IdeaSessionData = {
    employee?: string;
    city?: string;
    department?: string;
    system?: string;
    idea?: string;
    expectedResult?: string;
    priority?: "Low" | "Medium" | "High";
};

type IdeaSession = {
    state: IdeaSessionState;
    data: IdeaSessionData;
};

async function getSession(
env: BotEnv,
chatId: number,
) {
    const result = await env.DB.prepare(
    `
      SELECT state, payload
      FROM bot_sessions
      WHERE chat_id = ?
    `,
    )
    .bind(String(chatId))
    .first<{
    state: IdeaSessionState;
    payload: string;
    }>();

    if (!result) {
        return null;
    }

    return {
        state: result.state,
        data: JSON.parse(result.payload) as IdeaSessionData,
    } satisfies IdeaSession;
}

async function saveSession(
env: BotEnv,
chatId: number,
session: IdeaSession,
) {
    await env.DB.prepare(
    `
      INSERT INTO bot_sessions (
        chat_id,
        state,
        payload,
        updated_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(chat_id)
      DO UPDATE SET
        state = excluded.state,
        payload = excluded.payload,
        updated_at = CURRENT_TIMESTAMP
    `,
    )
    .bind(
    String(chatId),
    session.state,
    JSON.stringify(session.data),
    )
    .run();
}

async function deleteSession(
env: BotEnv,
chatId: number,
) {
    await env.DB.prepare(
    `
      DELETE FROM bot_sessions
      WHERE chat_id = ?
    `,
    )
    .bind(String(chatId))
    .run();
}

async function askNextQuestion(
env: BotEnv,
chatId: number,
state: IdeaSessionState,
) {
    const questions: Record<
        IdeaSessionState,
        string
        > = {
        city: "Выберите ваш город:",
        department: "Выберите подразделение:",
        system: "Укажите систему или процесс:",
        idea: "Опишите вашу идею:",
        expectedResult: "Какого результата вы ожидаете?",
        priority: "Выберите приоритет идеи:",
        confirmation: "Проверьте идею и подтвердите создание:",
    };

    const keyboard = state === "city"
        ? getChoiceKeyboard(["Новосибирск", "Красноярск", "Томск", "Кемерово", "Братск", "Другой город"])
        : state === "department"
          ? getChoiceKeyboard(["Офис", "Склад", "Логистика", "Бухгалтерия", "Закупки", "Другое"])
          : state === "priority"
            ? getChoiceKeyboard(["Низкий", "Средний", "Высокий"])
            : state === "confirmation" ? getConfirmKeyboard() : undefined;
    await sendTelegramMessage(
    env.BOT_TOKEN,
    chatId,
    questions[state],
    keyboard,
    );
}

function formatPreview(
data: IdeaSessionData,
) {
    return [
    "Проверьте идею:",
    "",
    `Сотрудник: ${data.employee}`,
    `Город: ${data.city}`,
    `Подразделение: ${data.department}`,
    `Система: ${data.system}`,
    `Идея: ${data.idea}`,
    `Ожидаемый результат: ${data.expectedResult}`,
    `Приоритет: ${{ Low: "Низкий", Medium: "Средний", High: "Высокий" }[data.priority || "Medium"]}`,
    "",
    "Создать идею?",
    ].join("\n");
}

function normalizePriority(
value: string,
) {
    const normalized = value.toLowerCase();

    if (normalized === "low" || normalized === "низкий") {
        return "Low" as const;
    }

    if (normalized === "high" || normalized === "высокий") {
        return "High" as const;
    }

    return "Medium" as const;
}

export async function handleCreateIdeaFlow(
env: BotEnv,
message: TelegramMessage,
) {
    const chatId = message.chat.id;
    const text = message.text?.trim();

    if (!text) {
        return false;
    }

    let session = await getSession(env, chatId);

    if (text === "💡 Предложить идею" || text === "Предложить идею" || text === "Create Idea") {
        const from = message.from;
        const employee = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim()
            || (from?.username ? `@${from.username}` : "Пользователь Telegram");
        session = {
            state: "city",
            data: { employee },
        };

        await saveSession(
        env,
        chatId,
        session,
        );

        await askNextQuestion(
        env,
        chatId,
        "city",
        );

        return true;
    }

    if (!session) {
        return false;
    }

    if (
    session.state === "confirmation" &&
    ["cancel", "отмена", "✖ отмена"].includes(text.toLowerCase())
    ) {
        await deleteSession(env, chatId);

        await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        "Создание идеи отменено.",
        );

        return true;
    }

    if (
    session.state === "confirmation" &&
    ["yes", "да", "создать", "✅ да, создать"].includes(text.toLowerCase())
    ) {
        const api = new HelpdeskApiClient({
            apiUrl: env.API_URL,
        });

        const result = await api.createIdea({
            employee: session.data.employee!,
            city: session.data.city,
            department: session.data.department,
            system: session.data.system,
            idea: session.data.idea!,
            expectedResult:
            session.data.expectedResult,
            priority: session.data.priority,
        }) as {
            ok: boolean;
            publicId?: string;
            error?: string;
        };

        await deleteSession(env, chatId);

        if (!result.ok) {
            await sendTelegramMessage(
            env.BOT_TOKEN,
            chatId,
            `Не удалось создать идею: ${result.error || "ошибка сервера"}`,
            );

            return true;
        }

        await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        `Идея создана!\nНомер: ${result.publicId}`,
        );

        return true;
    }

    const stateOrder: IdeaSessionState[] = [
    "city",
    "department",
    "system",
    "idea",
    "expectedResult",
    "priority",
    "confirmation",
    ];

    const currentIndex =
    stateOrder.indexOf(session.state);

    if (currentIndex === -1) {
        await deleteSession(env, chatId);
        return false;
    }

    const currentState = session.state;

    if (currentState === "priority") {
        session.data.priority =
        normalizePriority(text);
    } else if (currentState !== "confirmation") {
        session.data[currentState] = text;
    }

    const nextState =
    stateOrder[currentIndex + 1];

    if (!nextState) {
        await deleteSession(env, chatId);
        return false;
    }

    session.state = nextState;

    await saveSession(
    env,
    chatId,
    session,
    );

    if (nextState === "confirmation") {
        await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        formatPreview(session.data),
        );
    } else {
        await askNextQuestion(
        env,
        chatId,
        nextState,
        );
    }

    return true;
}
