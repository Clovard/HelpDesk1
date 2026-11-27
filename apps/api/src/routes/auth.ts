import { Hono } from "hono";
import type { AppEnv } from "../db/client";
import { createStaff, deactivateStaff, listStaff, login, logout, updateStaffPassword } from "../services/auth.service";

const auth = new Hono<AppEnv>();
const usernamePattern = /^[a-z0-9._-]{3,32}$/;

auth.post("/login", async (c) => {
    const body = await c.req.json<{ username?: string; password?: string }>();
    if (!body.username || !body.password) return c.json({ ok: false, error: "Введите логин и пароль." }, 400);
    const result = await login(c.env, body.username.trim(), body.password);
    if (!result) return c.json({ ok: false, error: "Неверный логин или пароль." }, 401);
    return c.json({ ok: true, ...result });
});

auth.get("/me", (c) => {
    const user = c.get("staff");
    return c.json({ ok: true, user: { username: user.username, displayName: user.display_name, role: user.access_role, level: user.support_level } });
});

auth.post("/logout", async (c) => {
    const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    if (token) await logout(c.env, token);
    return c.json({ ok: true });
});

auth.get("/staff", async (c) => c.json({ ok: true, users: await listStaff(c.env) }));

auth.post("/staff", async (c) => {
    const body = await c.req.json<{ username?: string; displayName?: string; password?: string; level?: string }>();
    const username = body.username?.trim().toLowerCase() ?? "";
    const displayName = body.displayName?.trim() ?? "";
    if (!usernamePattern.test(username)) return c.json({ ok: false, error: "Логин: 3–32 символа, латинские буквы, цифры, точка, дефис или подчёркивание." }, 400);
    if (displayName.length < 2 || displayName.length > 80) return c.json({ ok: false, error: "Укажите имя (2–80 символов)." }, 400);
    if (!body.password || body.password.length < 3 || body.password.length > 128) return c.json({ ok: false, error: "Пароль должен содержать от 3 до 128 символов." }, 400);
    if (!body.level || !["L1", "L2", "L3"].includes(body.level)) return c.json({ ok: false, error: "Выберите уровень специалиста." }, 400);
    try {
        await createStaff(c.env, { username, displayName, password: body.password, level: body.level });
        return c.json({ ok: true }, 201);
    } catch {
        return c.json({ ok: false, error: "Такой логин уже занят." }, 409);
    }
});

auth.put("/staff/:username/password", async (c) => {
    const body = await c.req.json<{ password?: string }>();
    if (!body.password || body.password.length < 3 || body.password.length > 128) return c.json({ ok: false, error: "Пароль должен содержать от 3 до 128 символов." }, 400);
    const username = c.req.param("username");
    const result = await c.env.DB.prepare("SELECT username FROM staff_accounts WHERE username = ? AND active = 1").bind(username).first();
    if (!result) return c.json({ ok: false, error: "Пользователь не найден." }, 404);
    await updateStaffPassword(c.env, username, body.password);
    return c.json({ ok: true });
});

auth.delete("/staff/:username", async (c) => {
    const username = c.req.param("username");
    if (username === c.get("staff").username) return c.json({ ok: false, error: "Нельзя отключить собственную учётную запись." }, 400);
    await deactivateStaff(c.env, username);
    return c.json({ ok: true });
});

export default auth;
