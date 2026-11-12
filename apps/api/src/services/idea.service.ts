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
