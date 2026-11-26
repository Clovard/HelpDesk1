import type { Env, StaffAccount } from "../db/client";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
// Cloudflare Workers Web Crypto rejects PBKDF2 iteration counts above 100,000.
const PBKDF2_ITERATIONS = 100_000;

function toHex(bytes: Uint8Array) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
}

async function sha256(value: string) {
    return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function passwordHash(password: string, salt: string) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: fromHex(salt), iterations: PBKDF2_ITERATIONS },
        key,
        256,
    );
    return toHex(new Uint8Array(bits));
}

function safeEqual(left: string, right: string) {
    if (left.length !== right.length) return false;
    let mismatch = 0;
    for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return mismatch === 0;
}

function randomHex(byteCount: number) {
    const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
    return toHex(bytes);
}

export async function getAuthStatus(env: Env) {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM staff_accounts WHERE active = 1 AND password_hash IS NOT NULL")
        .first<{ count: number }>();
    const initialized = (row?.count ?? 0) === 3;
    const users = await env.DB.prepare("SELECT username, display_name FROM staff_accounts WHERE active = 1 ORDER BY CASE username WHEN 'andrey' THEN 1 WHEN 'artem' THEN 2 ELSE 3 END")
        .all<{ username: string; display_name: string }>();
    return { initialized, users: users.results };
}

export async function initializeStaff(env: Env, bootstrapSecret: string, passwords: Record<string, unknown>) {
    if (!env.BOOTSTRAP_SECRET || env.BOOTSTRAP_SECRET.length < 32 || !safeEqual(bootstrapSecret, env.BOOTSTRAP_SECRET)) {
        return { ok: false as const, error: "Ключ первичной настройки неверный." };
    }
    const status = await getAuthStatus(env);
    if (status.initialized) return { ok: false as const, error: "Первичная настройка уже завершена." };

    const usernames = ["andrey", "artem", "pentagon"];
    for (const username of usernames) {
        const password = passwords[username];
        if (typeof password !== "string" || password.length < 12 || password.length > 256) {
            return { ok: false as const, error: "Для каждого специалиста задайте пароль длиной от 12 символов." };
        }
    }

    const statements = await Promise.all(usernames.map(async (username) => {
        const salt = randomHex(16);
        const hash = await passwordHash(passwords[username] as string, salt);
        return env.DB.prepare("UPDATE staff_accounts SET password_salt = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? AND active = 1")
            .bind(salt, hash, username);
    }));
    await env.DB.batch(statements);
    return { ok: true as const };
}

async function createSession(env: Env, username: string) {
    await env.DB.prepare("DELETE FROM staff_sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
    const token = randomHex(32);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString().replace("T", " ").replace("Z", "").slice(0, 19);
    await env.DB.prepare("INSERT INTO staff_sessions (token_hash, username, expires_at) VALUES (?, ?, ?)")
        .bind(await sha256(token), username, expiresAt).run();
    return { token, expiresAt };
}

export async function login(env: Env, username: string, password: string, clientAddress = "password-change") {
    const addressHash = await sha256(clientAddress || "unknown");
    await env.DB.prepare("DELETE FROM auth_login_failures WHERE failed_at < datetime('now', '-1 day')").run();
    const failures = await env.DB.prepare("SELECT COUNT(*) AS count FROM auth_login_failures WHERE ip_hash = ? AND failed_at > datetime('now', '-15 minutes')")
        .bind(addressHash).first<{ count: number }>();
    if ((failures?.count ?? 0) >= 10) return { limited: true as const };
    const account = await env.DB.prepare("SELECT username, display_name, access_role, support_level, password_salt, password_hash FROM staff_accounts WHERE username = ? AND active = 1")
        .bind(username)
        .first<StaffAccount & { password_salt: string | null; password_hash: string | null }>();
    if (!account?.password_hash || !account.password_salt) {
        await env.DB.prepare("INSERT INTO auth_login_failures (ip_hash) VALUES (?)").bind(addressHash).run();
        return null;
    }
    const actual = await passwordHash(password, account.password_salt);
    if (!safeEqual(actual, account.password_hash)) {
        await env.DB.prepare("INSERT INTO auth_login_failures (ip_hash) VALUES (?)").bind(addressHash).run();
        return null;
    }
    await env.DB.prepare("DELETE FROM auth_login_failures WHERE ip_hash = ?").bind(addressHash).run();
    const session = await createSession(env, account.username);
    return {
        ...session,
        user: {
            username: account.username,
            display_name: account.display_name,
            access_role: account.access_role,
            support_level: account.support_level,
        },
    };
}

export async function authenticateSession(env: Env, token: string): Promise<StaffAccount | null> {
    const row = await env.DB.prepare(`
      SELECT a.username, a.display_name, a.access_role, a.support_level
      FROM staff_sessions s
      JOIN staff_accounts a ON a.username = s.username
      WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND a.active = 1
    `).bind(await sha256(token)).first<StaffAccount>();
    return row ?? null;
}

export async function revokeSession(env: Env, token: string) {
    await env.DB.prepare("DELETE FROM staff_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function changePassword(env: Env, username: string, password: string) {
    if (password.length < 12 || password.length > 256) return false;
    const salt = randomHex(16);
    const hash = await passwordHash(password, salt);
    const result = await env.DB.prepare("UPDATE staff_accounts SET password_salt = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? AND active = 1")
        .bind(salt, hash, username).run();
    if (result.meta.changes > 0) {
        await env.DB.prepare("DELETE FROM staff_sessions WHERE username = ?").bind(username).run();
    }
    return result.meta.changes > 0;
}
