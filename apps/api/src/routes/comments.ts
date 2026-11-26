import { Hono } from "hono";

import type { AppEnv } from "../db/client";

import {
createComment,
listComments,
} from "../services/comment.service";

import {
createTicketEvent,
listTicketEvents,
} from "../services/event.service";

const comments = new Hono<AppEnv>();

comments.get(
"/:ticketId/comments",
async (context) => {
    const ticketId = Number(
    context.req.param("ticketId"),
    );

    if (!Number.isInteger(ticketId)) {
        return context.json(
        {
            ok: false,
            error: "Invalid ticket ID",
        },
        400,
        );
    }

    const result = await listComments(
    context.env,
    ticketId,
    );

    return context.json({
        ok: true,
        comments: result,
    });
},
);

comments.post(
"/:ticketId/comments",
async (context) => {
    const ticketId = Number(
    context.req.param("ticketId"),
    );

    if (!Number.isInteger(ticketId)) {
        return context.json(
        {
            ok: false,
            error: "Invalid ticket ID",
        },
        400,
        );
    }

    const body = await context.req.json();

    if (!body.body) {
        return context.json(
        {
            ok: false,
            error: "Comment body is required",
        },
        400,
        );
    }

    const authorName = "ИТ-поддержка";

    const result = await createComment(
    context.env,
    ticketId,
    {
        authorName,
        body: body.body,
    },
    );

    await createTicketEvent(
    context.env,
    ticketId,
    "comment_added",
    body.body,
    authorName,
    );

    return context.json(
    {
        ok: true,
        commentId: result.id,
    },
    201,
    );
},
);

comments.get(
"/:ticketId/events",
async (context) => {
    const ticketId = Number(
    context.req.param("ticketId"),
    );

    if (!Number.isInteger(ticketId)) {
        return context.json(
        {
            ok: false,
            error: "Invalid ticket ID",
        },
        400,
        );
    }

    const result = await listTicketEvents(
    context.env,
    ticketId,
    );

    return context.json({
        ok: true,
        events: result,
    });
},
);

export default comments;
