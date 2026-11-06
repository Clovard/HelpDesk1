import type { Env } from "../db/client";

export type CreateTicketInput = {
    employee: string;
    city?: string;
    department?: string;
    system?: string;
    type?: string;
    problem: string;
    expectedResult?: string;
    scale?: string;
};

export type UpdateTicketInput = {
    date?: string;
    time?: string;
    employee?: string;
    city?: string | null;
    department?: string | null;
    system?: string | null;
    type?: string | null;
    problem?: string;
    expectedResult?: string | null;
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
        expected_result,
        status,
        support_level,
        assignee,
        scale
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    input.expectedResult ?? null,
    "New",
    "L1",
    "Андрей",
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
    date: string;
    time: string;
    employee: string;
    city: string | null;
    department: string | null;
    system: string | null;
    type: string | null;
    problem: string;
    expected_result: string | null;
    status: string;
    it_comment: string | null;
    support_level: string | null;
    assignee: string | null;
    scale: string | null;
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
    const nextExpectedResult = input.expectedResult === undefined ? current.expected_result : input.expectedResult;
    const nextStatus = input.status ?? current.status;
    const nextComment = input.itComment === undefined ? current.it_comment : input.itComment;
    const nextLevel = input.supportLevel === undefined ? current.support_level : input.supportLevel;
    const nextAssignee = input.assignee === undefined ? current.assignee : input.assignee;
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
        expected_result = ?,
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
    nextExpectedResult,
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
