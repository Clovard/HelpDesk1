import {
sendTelegramMessage,
type TelegramMessage,
} from "../telegram-client";

import {
HelpdeskApiClient,
} from "../api-client";

type BotEnv = {
    DB: D1Database;
    API_URL: string;
    BOT_TOKEN: string;
};

type IdeaSessionState =
| "employee"
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
        employee: "Enter your name:",
        city: "Enter your city:",
        department: "Enter your department:",
        system: "Enter the system or process:",
        idea: "Describe your idea:",
        expectedResult:
        "What result do you expect?",
        priority:
        "Choose priority: Low, Medium or High.",
        confirmation:
        "Create this idea?\n\nReply with Yes or Cancel.",
    };

    await sendTelegramMessage(
    env.BOT_TOKEN,
    chatId,
    questions[state],
    );
}

function formatPreview(
data: IdeaSessionData,
) {
    return [
    "Please check the idea:",
    "",
    `Employee: ${data.employee}`,
    `City: ${data.city}`,
    `Department: ${data.department}`,
    `System: ${data.system}`,
    `Idea: ${data.idea}`,
    `Expected result: ${data.expectedResult}`,
    `Priority: ${data.priority}`,
    "",
    "Create this idea?",
    "Reply with Yes or Cancel.",
    ].join("\n");
}

function normalizePriority(
value: string,
) {
    const normalized = value.toLowerCase();

    if (normalized === "low") {
        return "Low" as const;
    }

    if (normalized === "high") {
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

    if (text === "Create Idea") {
        session = {
            state: "employee",
            data: {},
        };

        await saveSession(
        env,
        chatId,
        session,
        );

        await askNextQuestion(
        env,
        chatId,
        "employee",
        );

        return true;
    }

    if (!session) {
        return false;
    }

    if (
    session.state === "confirmation" &&
    text.toLowerCase() === "cancel"
    ) {
        await deleteSession(env, chatId);

        await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        "Idea creation cancelled.",
        );

        return true;
    }

    if (
    session.state === "confirmation" &&
    text.toLowerCase() === "yes"
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
            `Idea creation failed: ${
            result.error || "Unknown error"
            }`,
            );

            return true;
        }

        await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        `Idea created successfully.\n\nIdea ID: ${result.publicId}`,
        );

        return true;
    }

    const stateOrder: IdeaSessionState[] = [
    "employee",
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