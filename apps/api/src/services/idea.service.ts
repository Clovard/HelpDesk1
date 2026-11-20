import type { Env } from "../db/client";

export type CreateIdeaInput = {
    employee: string;
    city?: string;
    department?: string;
    system?: string;
    idea: string;
    expectedResult?: string;
    priority?: "Low" | "Medium" | "High";
    linkedTicketId?: number;
    photoCount?: number;
    fileCount?: number;
};

export type UpdateIdeaInput = {
    employee?: string;
    city?: string | null;
    department?: string | null;
    system?: string | null;
    idea?: string;
    expectedResult?: string | null;
    priority?: "Low" | "Medium" | "High";
    status?: string;
    assignee?: string | null;
    comment?: string | null;
};

export async function listIdeas(env: Env) {
    const result = await env.DB.prepare(
    `
      SELECT *
      FROM ideas
      ORDER BY created_at DESC
    `,
    ).all();

    return result.results;
}

export async function getIdeaById(
env: Env,
id: number,
) {
    return env.DB.prepare(
    `
      SELECT *
      FROM ideas
      WHERE id = ?
    `,
    )
    .bind(id)
    .first();
}

export async function createIdea(
env: Env,
input: CreateIdeaInput,
) {
    const now = new Date();

    const date = now.toISOString().slice(0, 10);
    const time = now.toISOString().slice(11, 19);
    const publicId = `IDEA-${crypto.randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;

    const result = await env.DB.prepare(
    `
      INSERT INTO ideas (
        public_id,
        date,
        time,
        employee,
        city,
        department,
        system,
        idea,
        expected_result,
        priority,
        status,
        linked_ticket_id,
        photo_count,
        file_count
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
    input.idea,
    input.expectedResult ?? null,
    input.priority ?? "Medium",
    "New",
    input.linkedTicketId ?? null,
    input.photoCount ?? 0,
    input.fileCount ?? 0,
    )
    .run();

    return {
        id: result.meta.last_row_id,
        publicId,
    };
}

export async function updateIdea(env: Env, id: number, input: UpdateIdeaInput) {
    const current = await getIdeaById(env, id) as {
        employee: string; city: string | null; department: string | null; system: string | null;
        idea: string; expected_result: string | null; priority: string; status: string;
        assignee: string | null; comment: string | null;
    } | null;
    if (!current) return null;

    await env.DB.prepare(`UPDATE ideas SET
        employee = ?, city = ?, department = ?, system = ?, idea = ?, expected_result = ?,
        priority = ?, status = ?, assignee = ?, comment = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`)
        .bind(
            input.employee ?? current.employee,
            input.city === undefined ? current.city : input.city,
            input.department === undefined ? current.department : input.department,
            input.system === undefined ? current.system : input.system,
            input.idea ?? current.idea,
            input.expectedResult === undefined ? current.expected_result : input.expectedResult,
            input.priority ?? current.priority,
            input.status ?? current.status,
            input.assignee === undefined ? current.assignee : input.assignee,
            input.comment === undefined ? current.comment : input.comment,
            id,
        ).run();

    return getIdeaById(env, id);
}

export async function deleteIdea(env: Env, id: number) {
    const result = await env.DB.prepare("DELETE FROM ideas WHERE id = ?").bind(id).run();
    return result.meta.changes > 0;
}
