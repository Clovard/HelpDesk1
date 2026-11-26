import { Hono } from "hono";

import type { AppEnv } from "../db/client";

import {
createIdea,
deleteIdea,
getIdeaById,
listIdeas,
updateIdea,
} from "../services/idea.service";

const ideas = new Hono<AppEnv>();

ideas.get("/", async (context) => {
    const result = await listIdeas(context.env);

    return context.json({
        ok: true,
        ideas: result,
    });
});

ideas.get("/:id", async (context) => {
    const id = Number(context.req.param("id"));

    if (!Number.isInteger(id)) {
        return context.json(
        {
            ok: false,
            error: "Invalid idea ID",
        },
        400,
        );
    }

    const idea = await getIdeaById(
    context.env,
    id,
    );

    if (!idea) {
        return context.json(
        {
            ok: false,
            error: "Idea not found",
        },
        404,
        );
    }

    return context.json({
        ok: true,
        idea,
    });
});

ideas.post("/", async (context) => {
    const body = await context.req.json();

    if (!body.employee || !body.idea) {
        return context.json(
        {
            ok: false,
            error: "employee and idea are required",
        },
        400,
        );
    }

    const result = await createIdea(
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

ideas.patch("/:id", async (context) => {
    const id = Number(context.req.param("id"));
    if (!Number.isInteger(id)) return context.json({ ok: false, error: "Invalid idea ID" }, 400);
    const body = await context.req.json();
    const idea = await updateIdea(context.env, id, body);
    if (!idea) return context.json({ ok: false, error: "Idea not found" }, 404);
    return context.json({ ok: true, idea });
});

ideas.delete("/:id", async (context) => {
    const id = Number(context.req.param("id"));
    if (!Number.isInteger(id)) return context.json({ ok: false, error: "Invalid idea ID" }, 400);
    const deleted = await deleteIdea(context.env, id);
    if (!deleted) return context.json({ ok: false, error: "Idea not found" }, 404);
    return context.json({ ok: true, deleted, id });
});

export default ideas;
