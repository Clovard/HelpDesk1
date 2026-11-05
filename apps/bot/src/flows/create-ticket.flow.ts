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

type TicketSessionState =
| "employee"
| "city"
| "department"
| "system"
| "type"
| "problem"
| "expectedResult"
| "scale"
| "confirmation";

type TicketSessionData = {
    employee?: string;
    city?: string;
    department?: string;
    system?: string;
    type?: string;
    problem?: string;
    expectedResult?: string;
    scale?: string;
};

type TicketSession = {
    state: TicketSessionState;
    data: TicketSessionData;
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
    state: TicketSessionState;
    payload: string;
    }>();

    if (!result) {
        return null;
    }

    return {
        state: result.state,
        data: JSON.parse(result.payload) as TicketSessionData,
    } satisfies TicketSession;
}

async function saveSession(
env: BotEnv,
chatId: number,
session: TicketSession,
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
state: TicketSessionState,
) {
    const questions: Record<
        TicketSessionState,
        string
        > = {
        employee: "Enter your name:",
        city: "Enter your city:",
        department: "Enter your department:",
        system: "Enter the system or application:",
        type: "Enter the request type:",
        problem: "Describe the problem:",
        expectedResult: "What result do you expect?",
        scale: "Describe the scale or impact:",
        confirmation:
        "Create this ticket?\n\nReply with Yes or Cancel.",
    };

    await sendTelegramMessage(
    env.BOT_TOKEN,
    chatId,
    questions[state],
    );
}

function formatPreview(
data: TicketSessionData,
) {
    return [
    "Please check the ticket:",
    "",
    `Employee: ${data.employee}`,
    `City: ${data.city}`,
    `Department: ${data.department}`,
    `System: ${data.system}`,
    `Type: ${data.type}`,
    `Problem: ${data.problem}`,
    `Expected result: ${data.expectedResult}`,
    `Scale: ${data.scale}`,
    "",
    "Create this ticket?",
    "Reply with Yes or Cancel.",
    ].join("\n");
}

export async function handleCreateTicketFlow(
env: BotEnv,
message: TelegramMessage,
) {
    const chatId = message.chat.id;
    const text = message.text?.trim();

    if (!text) {
        return false;
    }

    let session = await getSession(env, chatId);

    if (text === "Create Ticket") {
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
        "Ticket creation cancelled.",
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

        const result = await api.createTicket({
            employee: session.data.employee!,
            city: session.data.city,
            department: session.data.department,
            system: session.data.system,
            type: session.data.type,
            problem: session.data.problem!,
            expectedResult: session.data.expectedResult,
            scale: session.data.scale,
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
            `Ticket creation failed: ${
            result.error || "Unknown error"
            }`,
            );

            return true;
        }

        await sendTelegramMessage(
        env.BOT_TOKEN,
        chatId,
        `Ticket created successfully.\n\nTicket ID: ${result.publicId}`,
        );

        return true;
    }

    const stateOrder: TicketSessionState[] = [
    "employee",
    "city",
    "department",
    "system",
    "type",
    "problem",
    "expectedResult",
    "scale",
    "confirmation",
    ];

    const currentIndex =
    stateOrder.indexOf(session.state);

    if (currentIndex === -1) {
        await deleteSession(env, chatId);
        return false;
    }

    const currentState = session.state;

    if (currentState !== "confirmation") {
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