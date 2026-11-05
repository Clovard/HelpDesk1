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
    status?: string;
    itComment?: string;
    supportLevel?: "L1" | "L2" | "L3" | null;
    assignee?: string | null;
    scale?: string;
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
        scale
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      SELECT
        status,
        it_comment,
        support_level,
        assignee,
        scale
      FROM tickets
      WHERE id = ?
    `,
    )
    .bind(id)
    .first<{
    status: string;
    it_comment: string | null;
    support_level: string | null;
    assignee: string | null;
    scale: string | null;
    }>();

    if (!current) {
        return null;
    }

    const nextStatus =
    input.status ?? current.status;

    const nextComment =
    input.itComment ?? current.it_comment;

    const nextLevel =
    input.supportLevel === undefined
    ? current.support_level
    : input.supportLevel;

    const nextAssignee =
    input.assignee === undefined
    ? current.assignee
    : input.assignee;

    const nextScale =
    input.scale ?? current.scale;

    await env.DB.prepare(
    `
      UPDATE tickets
      SET
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