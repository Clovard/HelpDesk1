import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AppEnv } from "./db/client";

import tickets from "./routes/tickets";
import ideas from "./routes/ideas";
import comments from "./routes/comments";
import users from "./routes/users";
import ticketMessages from "./routes/ticket-messages";

const app = new Hono<AppEnv>();

app.use(
"*",
cors({
    origin: (origin) => {
        const allowed = [
            "https://helpdesk-frontend.andrejsarafonov.workers.dev",
            "https://helpdesk-frontend-test.andrejsarafonov.workers.dev",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ];
        if (contextlessOrigin(origin, allowed)) return origin;
        return null;
    },
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 600,
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

app.route("/api/tickets", ticketMessages);
app.route("/api/tickets", tickets);
app.route("/api/ideas", ideas);
app.route("/api/tickets", comments);
app.route("/api/users", users);

export default app;

function contextlessOrigin(origin: string, allowed: string[]) {
    return allowed.includes(origin);
}

