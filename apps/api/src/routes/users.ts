import { Hono } from "hono";

import type { Env } from "../db/client";

import {
createUser,
getUserById,
listUsers,
updateUser,
} from "../services/user.services";

const users = new Hono<{ Bindings: Env }>();

users.get("/", async (context) => {
    const result = await listUsers(context.env);

    return context.json({
        ok: true,
        users: result,
    });
});

users.get("/:id", async (context) => {
    const id = Number(context.req.param("id"));

    if (!Number.isInteger(id)) {
        return context.json(
        {
            ok: false,
            error: "Invalid user ID",
        },
        400,
        );
    }

    const user = await getUserById(
    context.env,
    id,
    );

    if (!user) {
        return context.json(
        {
            ok: false,
            error: "User not found",
        },
        404,
        );
    }

    return context.json({
        ok: true,
        user,
    });
});

users.post("/", async (context) => {
    const body = await context.req.json();

    if (!body.name) {
        return context.json(
        {
            ok: false,
            error: "name is required",
        },
        400,
        );
    }

    const result = await createUser(
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

users.patch("/:id", async (context) => {
    const id = Number(context.req.param("id"));

    if (!Number.isInteger(id)) {
        return context.json(
        {
            ok: false,
            error: "Invalid user ID",
        },
        400,
        );
    }

    const body = await context.req.json();

    const user = await updateUser(
    context.env,
    id,
    body,
    );

    if (!user) {
        return context.json(
        {
            ok: false,
            error: "User not found",
        },
        404,
        );
    }

    return context.json({
        ok: true,
        user,
    });
});

export default users;