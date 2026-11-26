import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AppEnv } from "./db/client";

import tickets from "./routes/tickets";
import ideas from "./routes/ideas";
import comments from "./routes/comments";
import users from "./routes/users";
import ticketMessages from "./routes/ticket-messages";
import auth from "./routes/auth";
import { authenticateSession } from "./services/auth.service";

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
    allowHeaders: ["Content-Type", "Authorization", "X-Bootstrap-Secret", "X-Bot-Api-Token"],
    maxAge: 600,
}),
);

app.use("*", async (context, next) => {
    const path = context.req.path;
    if (path === "/" || path === "/health" || path === "/auth/status" ||
        path === "/auth/login" || path === "/auth/bootstrap") return next();

    const bearer = context.req.header("Authorization") ?? "";
    const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    const staff = token ? await authenticateSession(context.env, token) : null;
    if (staff) {
        if (staff.access_role !== "Admin" && path.startsWith("/api/users")) {
            return context.json({ ok: false, error: "Недостаточно прав." }, 403);
        }
        if (staff.access_role !== "Admin" && context.req.method === "DELETE") {
            return context.json({ ok: false, error: "Удалять данные может только администратор." }, 403);
        }
        context.set("staff", staff);
        return next();
    }

    const isBotCreate = context.req.method === "POST" &&
        (path === "/api/tickets" || path === "/api/ideas");
    const botToken = context.req.header("X-Bot-Api-Token") ?? "";
    if (isBotCreate && context.env.BOT_API_TOKEN && context.env.BOT_API_TOKEN.length >= 32 && botToken.length === context.env.BOT_API_TOKEN.length &&
        constantTimeEqual(botToken, context.env.BOT_API_TOKEN)) {
        return next();
    }

    return context.json({ ok: false, error: "Требуется войти в HelpDesk." }, 401);
});

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

app.route("/auth", auth);
app.route("/api/tickets", ticketMessages);
app.route("/api/tickets", tickets);
app.route("/api/ideas", ideas);
app.route("/api/tickets", comments);
app.route("/api/users", users);

export default app;

function contextlessOrigin(origin: string, allowed: string[]) {
    return allowed.includes(origin);
}

function constantTimeEqual(left: string, right: string) {
    if (left.length !== right.length) return false;
    let result = 0;
    for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return result === 0;
}
