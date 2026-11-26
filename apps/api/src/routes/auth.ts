import { Hono } from "hono";
import type { AppEnv } from "../db/client";
import { authenticateSession, changePassword, getAuthStatus, initializeStaff, login, revokeSession } from "../services/auth.service";

const auth = new Hono<AppEnv>();

auth.get("/status", async (context) => context.json({ ok: true, ...(await getAuthStatus(context.env)) }));

auth.post("/bootstrap", async (context) => {
    const body = await context.req.json<{ passwords?: Record<string, unknown> }>();
    const result = await initializeStaff(context.env, context.req.header("X-Bootstrap-Secret") ?? "", body.passwords ?? {});
    if (!result.ok) return context.json({ ok: false, error: result.error }, 403);
    return context.json({ ok: true });
});

auth.post("/login", async (context) => {
    const body = await context.req.json<{ username?: string; password?: string }>();
    if (typeof body.username !== "string" || typeof body.password !== "string" || body.password.length > 256) {
        return context.json({ ok: false, error: "Выберите пользователя и введите пароль." }, 400);
    }
    const session = await login(context.env, body.username, body.password, context.req.header("CF-Connecting-IP") ?? "unknown");
    if (session && "limited" in session) return context.json({ ok: false, error: "Слишком много попыток. Подождите 15 минут." }, 429);
    if (!session) return context.json({ ok: false, error: "Неверный пользователь или пароль." }, 401);
    return context.json({ ok: true, token: session.token, expiresAt: session.expiresAt, user: session.user });
});

auth.get("/me", async (context) => {
    const authorization = context.req.header("Authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const user = token ? await authenticateSession(context.env, token) : null;
    if (!user) return context.json({ ok: false, error: "Сессия завершена. Войдите снова." }, 401);
    return context.json({ ok: true, user });
});

auth.post("/logout", async (context) => {
    const authorization = context.req.header("Authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (token) await revokeSession(context.env, token);
    return context.json({ ok: true });
});

auth.post("/change-password", async (context) => {
    const authorization = context.req.header("Authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const user = token ? await authenticateSession(context.env, token) : null;
    if (!user) return context.json({ ok: false, error: "Сессия завершена." }, 401);
    const body = await context.req.json<{ currentPassword?: string; newPassword?: string }>();
    const verified = await login(context.env, user.username, body.currentPassword ?? "", context.req.header("CF-Connecting-IP") ?? "unknown");
    if (!verified || "limited" in verified) return context.json({ ok: false, error: "Текущий пароль указан неверно." }, 401);
    const changed = await changePassword(context.env, user.username, body.newPassword ?? "");
    if (!changed) return context.json({ ok: false, error: "Новый пароль должен содержать от 12 до 256 символов." }, 400);
    await revokeSession(context.env, token);
    await revokeSession(context.env, verified.token);
    return context.json({ ok: true });
});

auth.put("/accounts/:username/password", async (context) => {
    const actor = context.get("staff");
    if (actor.access_role !== "Admin") return context.json({ ok: false, error: "Недостаточно прав." }, 403);
    const target = context.req.param("username");
    if (!["andrey", "artem", "pentagon"].includes(target)) return context.json({ ok: false, error: "Неизвестный специалист." }, 404);
    const body = await context.req.json<{ password?: string }>();
    const changed = await changePassword(context.env, target, body.password ?? "");
    if (!changed) return context.json({ ok: false, error: "Пароль должен содержать от 12 до 256 символов." }, 400);
    return context.json({ ok: true });
});

export default auth;
