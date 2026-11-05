import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Env } from "./db/client";

import tickets from "./routes/tickets";
import ideas from "./routes/ideas";
import comments from "./routes/comments";
import users from "./routes/users";

const app = new Hono<{ Bindings: Env }>();

app.use(
"*",
cors({
    origin: "*",
}),
);

app.get("/", (context) => {
    return context.json({
        ok: true,
        service: "helpdesk-api",
    });
});

app.get("/health", (context) => {
    return context.json({
        ok: true,
        service: "helpdesk-api",
        databaseConfigured: Boolean(context.env.DB),
    });
});

app.route("/api/tickets", tickets);
app.route("/api/ideas", ideas);
app.route("/api/tickets", comments);
app.route("/api/users", users);

export default app;