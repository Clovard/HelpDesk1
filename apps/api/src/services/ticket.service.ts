import type { Env } from "../db/client";

export type CreateTicketInput = {
    employee: string;
    city?: string;
    department?: string;
    system?: string;
    type?: string;
    problem: string;
    employeeTelegramId?: string;
    telegramUserId?: string;
    scale?: string;
};

const assigneeByLevel: Record<"L1" | "L2" | "L3", string> = {
    L1: "Андрей",
    L2: "Артём",
    L3: "Пентагон",
};

async function notifyEmployeeToConfirmClosure(env: Env, ticket: {
    id: number;
    public_id: string;
    problem: string;
    telegram_user_id: string | null;
    employee_telegram_id: string | null;
}) {
    if (!env.BOT_TOKEN) return;
    const telegramId = ticket.telegram_user_id
        ?? /(?:ID|идентификатор)\s*:\s*(\d+)/i.exec(ticket.employee_telegram_id ?? "")?.[1];
    if (!telegramId) return;

    try {
        const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: telegramId,
                text: `Заявка ${ticket.public_id} отмечена как закрытая. Подтвердите, пожалуйста, проблема действительно решена?`,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ Да, проблема решена", callback_data: `ticket_closed:${ticket.id}:yes` }],
                        [{ text: "❌ Нет, проблема осталась", callback_data: `ticket_closed:${ticket.id}:no` }],
                    ],
                },
            }),
        });
        const result = await response.json() as { ok?: boolean; description?: string };
        if (!response.ok || result.ok !== true) {
            console.error("Telegram closure confirmation delivery failed", {
                ticketId: ticket.id,
                status: response.status,
                description: result.description,
            });
        }
    } catch (error) {
        console.error("Telegram closure confirmation delivery failed", {
            ticketId: ticket.id,
            error: error instanceof Error ? error.message : "unknown error",
        });
    }
}

function normalizeAssignee(value: string | null | undefined) {
    const normalized = value?.trim().toLocaleLowerCase("ru") ?? "";
    if (["тёма", "тема", "артем", "артём", "tema", "artem"].includes(normalized)) return "Артём";
    if (normalized === "пентагон") return "Пентагон";
    return "Андрей";
}

function levelForAssignee(assignee: string) {
    return (Object.entries(assigneeByLevel).find(([, name]) => name === assignee)?.[0] ?? "L1") as "L1" | "L2" | "L3";
}
export type UpdateTicketInput = {
    date?: string;
    time?: string;
    employee?: string;
    city?: string | null;
    department?: string | null;
    system?: string | null;
    type?: string | null;
    problem?: string;
    status?: string;
    itComment?: string | null;
    supportLevel?: "L1" | "L2" | "L3" | null;
    assignee?: string | null;
    scale?: string | null;
};

export async function listTickets(env: Env) {
    const result = await env.DB.prepare(
    `
      SELECT *
      FROM tickets
      ORDER BY created_at DESC
    `,
    ).all();

    return result.results;
}

export async function getTicketById(
env: Env,
id: number,
) {
    return env.DB.prepare(
    `
      SELECT *
      FROM tickets
      WHERE id = ?
    `,
    )
    .bind(id)
    .first();
}

export async function createTicket(
env: Env,
input: CreateTicketInput,
) {
    const now = new Date();

    const date = now.toISOString().slice(0, 10);
    const time = now.toISOString().slice(11, 19);
    const publicId = `REQ-${crypto.randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;

    const result = await env.DB.prepare(
    `
      INSERT INTO tickets (
        public_id,
        date,
        time,
        employee,
        city,
        department,
        system,
        type,
        problem,
        status,
        support_level,
        assignee,
        employee_telegram_id,
        telegram_user_id,
        scale
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
    publicId,
    date,
    time,
    input.employee,
    input.city ?? null,
    input.department ?? null,
    input.system ?? null,
    input.type ?? null,
    input.problem,
    "New",
    "L1",
    "Андрей",
    input.employeeTelegramId ?? null,
    input.telegramUserId ?? null,
    input.scale ?? null,
    )
    .run();

    return {
        id: result.meta.last_row_id,
        publicId,
    };
}

export async function updateTicket(
env: Env,
id: number,
input: UpdateTicketInput,
) {
    const current = await env.DB.prepare(
    `
      SELECT *
      FROM tickets
      WHERE id = ?
    `,
    )
    .bind(id)
    .first<{
    public_id: string;
    date: string;
    time: string;
    employee: string;
    city: string | null;
    department: string | null;
    system: string | null;
    type: string | null;
    problem: string;
    status: string;
    it_comment: string | null;
    support_level: string | null;
    assignee: string | null;
    scale: string | null;
    telegram_user_id: string | null;
    employee_telegram_id: string | null;
    }>();

    if (!current) {
        return null;
    }

    const nextDate = input.date ?? current.date;
    const nextTime = input.time ?? current.time;
    const nextEmployee = input.employee ?? current.employee;
    const nextCity = input.city === undefined ? current.city : input.city;
    const nextDepartment = input.department === undefined ? current.department : input.department;
    const nextSystem = input.system === undefined ? current.system : input.system;
    const nextType = input.type === undefined ? current.type : input.type;
    const nextProblem = input.problem ?? current.problem;
    const nextStatus = input.status ?? current.status;
    const nextComment = input.itComment === undefined ? current.it_comment : input.itComment;
    const currentAssignee = normalizeAssignee(current.assignee);
    let nextLevel = input.supportLevel === undefined ? current.support_level : input.supportLevel;
    let nextAssignee = currentAssignee;
    if (input.assignee !== undefined) {
        nextAssignee = normalizeAssignee(input.assignee);
        nextLevel = levelForAssignee(nextAssignee);
    } else if (input.supportLevel !== undefined) {
        nextLevel = input.supportLevel && input.supportLevel in assigneeByLevel ? input.supportLevel : "L1";
        nextAssignee = assigneeByLevel[nextLevel as "L1" | "L2" | "L3"];
    } else {
        nextLevel = levelForAssignee(nextAssignee);
    }
    const nextScale = input.scale === undefined ? current.scale : input.scale;

    await env.DB.prepare(
    `
      UPDATE tickets
      SET
        date = ?,
        time = ?,
        employee = ?,
        city = ?,
        department = ?,
        system = ?,
        type = ?,
        problem = ?,
        status = ?,
        it_comment = ?,
        support_level = ?,
        assignee = ?,
        scale = ?,
        updated_at = CURRENT_TIMESTAMP,
        closed_at = CASE
          WHEN ? = 'Closed'
            THEN CURRENT_TIMESTAMP
          ELSE closed_at
        END
      WHERE id = ?
    `,
    )
    .bind(
    nextDate,
    nextTime,
    nextEmployee,
    nextCity,
    nextDepartment,
    nextSystem,
    nextType,
    nextProblem,
    nextStatus,
    nextComment,
    nextLevel,
    nextAssignee,
    nextScale,
    nextStatus,
    id,
    )
    .run();

    if (current.status !== nextStatus) {
        await env.DB.prepare(
        `
        INSERT INTO ticket_events (
          ticket_id,
          event_type,
          old_value,
          new_value,
          author_name
        )
        VALUES (?, ?, ?, ?, ?)
      `,
        )
        .bind(
        id,
        "status_changed",
        current.status,
        nextStatus,
        "Helpdesk",
        )
        .run();
    }

    if (current.status !== "Closed" && nextStatus === "Closed") {
        await notifyEmployeeToConfirmClosure(env, {
            id,
            public_id: current.public_id,
            problem: nextProblem,
            telegram_user_id: current.telegram_user_id,
            employee_telegram_id: current.employee_telegram_id,
        });
    }

    return getTicketById(env, id);
}

export async function deleteTicket(env: Env, id: number) {
    const result = await env.DB.prepare(
    `DELETE FROM tickets WHERE id = ?`,
    )
    .bind(id)
    .run();

    return result.meta.changes > 0;
}
