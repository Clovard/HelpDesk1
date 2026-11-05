import { Hono } from "hono";

import type { Env } from "../db/client";

import {
createTicket,
getTicketById,
listTickets,
updateTicket,
} from "../services/ticket.service";

const tickets = new Hono<{ Bindings: Env }>();

tickets.get("/", async (context) => {
    const result = await listTickets(context.env);

    return context.json({
        ok: true,
        tickets: result,
    });
});

tickets.get("/:id", async (context) => {
    const id = Number(context.req.param("id"));

    if (!Number.isInteger(id)) {
        return context.json(
        {
            ok: false,
            error: "Invalid ticket ID",
        },
        400,
        );
    }

    const ticket = await getTicketById(
    context.env,
    id,
    );

    if (!ticket) {
        return context.json(
        {
            ok: false,
            error: "Ticket not found",
        },
        404,
        );
    }

    return context.json({
        ok: true,
        ticket,
    });
});

tickets.post("/", async (context) => {
    const body = await context.req.json();

    if (!body.employee || !body.problem) {
        return context.json(
        {
            ok: false,
            error: "employee and problem are required",
        },
        400,
        );
    }

    const result = await createTicket(
    context.env,
    body,
    );

    return context.json(
    {
        ok: true,
        ...result,
    },
    201,
    );
});

tickets.patch("/:id", async (context) => {
    const id = Number(context.req.param("id"));

    if (!Number.isInteger(id)) {
        return context.json(
        {
            ok: false,
            error: "Invalid ticket ID",
        },
        400,
        );
    }

    const body = await context.req.json();

    const ticket = await updateTicket(
    context.env,
    id,
    body,
    );

    if (!ticket) {
        return context.json(
        {
            ok: false,
            error: "Ticket not found",
        },
        404,
        );
    }

    return context.json({
        ok: true,
        ticket,
    });
});

export default tickets;