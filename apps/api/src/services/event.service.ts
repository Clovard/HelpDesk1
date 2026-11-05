import type { Env } from "../db/client";

export async function listTicketEvents(
env: Env,
ticketId: number,
) {
    const result = await env.DB.prepare(
    `
      SELECT *
      FROM ticket_events
      WHERE ticket_id = ?
      ORDER BY created_at ASC
    `,
    )
    .bind(ticketId)
    .all();

    return result.results;
}

export async function createTicketEvent(
env: Env,
ticketId: number,
eventType: string,
newValue: string,
authorName: string,
) {
    await env.DB.prepare(
    `
      INSERT INTO ticket_events (
        ticket_id,
        event_type,
        new_value,
        author_name
      )
      VALUES (?, ?, ?, ?)
    `,
    )
    .bind(
    ticketId,
    eventType,
    newValue,
    authorName,
    )
    .run();
}