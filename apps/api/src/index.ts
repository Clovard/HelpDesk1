import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AppEnv } from "./db/client";
import type { StaffAccount } from "./db/client";
import { authenticate } from "./services/auth.service";

import auth from "./routes/auth";
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
    allowHeaders: ["Content-Type", "Authorization", "X-Bot-Api-Token"],
    maxAge: 600,
}),
);

app.use("/api/*", async (context, next) => {
    if (context.req.method === "OPTIONS") return next();
    const path = new URL(context.req.url).pathname;
    const botCreate = context.req.method === "POST" && ["/api/tickets", "/api/ideas"].includes(path);
    const botToken = context.req.header("X-Bot-Api-Token");
    if (botCreate && context.env.BOT_API_TOKEN && botToken === context.env.BOT_API_TOKEN) return next();

    const token = context.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    const staff = token ? await authenticate(context.env, token) : null;
    if (!staff) return context.json({ ok: false, error: "Войдите в HelpDesk." }, 401);
    context.set("staff", staff as StaffAccount);
    await next();
});

app.use("/auth/*", async (context, next) => {
    if (context.req.method === "OPTIONS" || new URL(context.req.url).pathname === "/auth/login") return next();
    const token = context.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    const staff = token ? await authenticate(context.env, token) : null;
    if (!staff) return context.json({ ok: false, error: "Войдите в HelpDesk." }, 401);
    context.set("staff", staff);
    if (new URL(context.req.url).pathname.startsWith("/auth/staff") && staff.access_role !== "Admin") {
        return context.json({ ok: false, error: "Управлять пользователями может только администратор." }, 403);
    }
    await next();
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

