import type { Env } from "../db/client";

export type CreateCommentInput = {
    authorName: string;
    body: string;
};

export async function listComments(
env: Env,
ticketId: number,
) {
    const result = await env.DB.prepare(
    `
      SELECT *
      FROM comments
      WHERE ticket_id = ?
      ORDER BY created_at ASC
    `,
    )
    .bind(ticketId)
    .all();

    return result.results;
}

export async function createComment(
env: Env,
ticketId: number,
input: CreateCommentInput,
) {
    const result = await env.DB.prepare(
    `
      INSERT INTO comments (
        ticket_id,
        author_name,
        body
      )
      VALUES (?, ?, ?)
    `,
    )
    .bind(
    ticketId,
    input.authorName,
    input.body,
    )
    .run();

    return {
        id: result.meta.last_row_id,
    };
}