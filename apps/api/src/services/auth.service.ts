import type { Env, StaffAccount } from "../db/client";

const ITERATIONS = 100_000;
const SESSION_DAYS = 14;
const encoder = new TextEncoder();

function toHex(bytes: Uint8Array) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
    return new Uint8Array(value.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? []);
}

async function derive(password: string, salt: Uint8Array) {
    const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, material, 256);
    return new Uint8Array(bits);
}

async function digest(value: string) {
    return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
    return diff === 0;
}

export async function login(env: Env, username: string, password: string) {
    const user = await env.DB.prepare("SELECT username, display_name, access_role, support_level, password_salt, password_hash, active FROM staff_accounts WHERE username = ?")
        .bind(username.toLowerCase()).first<StaffAccount & { password_salt: string | null; password_hash: string | null; active: number }>();
    if (!user?.active || !user.password_salt || !user.password_hash) return null;
    const actual = await derive(password, fromHex(user.password_salt));
    if (!constantTimeEqual(actual, fromHex(user.password_hash))) return null;

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = toHex(tokenBytes);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
    await env.DB.prepare("INSERT INTO staff_sessions (token_hash, username, expires_at) VALUES (?, ?, ?)")
        .bind(await digest(token), user.username, expiresAt).run();
    return { token, user: publicUser(user) };
}

function publicUser(user: StaffAccount) {
    return { username: user.username, displayName: user.display_name, role: user.access_role, level: user.support_level };
}

export async function authenticate(env: Env, token: string): Promise<StaffAccount | null> {
    const hash = await digest(token);
    return env.DB.prepare(`SELECT a.username, a.display_name, a.access_role, a.support_level
        FROM staff_sessions s JOIN staff_accounts a ON a.username = s.username
        WHERE s.token_hash = ? AND s.expires_at > ? AND a.active = 1`)
        .bind(hash, new Date().toISOString()).first<StaffAccount>();
}

export async function logout(env: Env, token: string) {
    await env.DB.prepare("DELETE FROM staff_sessions WHERE token_hash = ?").bind(await digest(token)).run();
}

export async function listStaff(env: Env) {
    const result = await env.DB.prepare("SELECT username, display_name, access_role, support_level, active, created_at FROM staff_accounts ORDER BY display_name")
        .all<Record<string, unknown>>();
    return result.results;
}

export async function createStaff(env: Env, input: { username: string; displayName: string; password: string; level: string }) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(input.password, salt);
    await env.DB.prepare(`INSERT INTO staff_accounts (username, display_name, access_role, support_level, password_salt, password_hash)
        VALUES (?, ?, 'Agent', ?, ?, ?)`)
        .bind(input.username, input.displayName, input.level, toHex(salt), toHex(hash)).run();
}

export async function updateStaffPassword(env: Env, username: string, password: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(password, salt);
    await env.DB.prepare("UPDATE staff_accounts SET password_salt = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?")
        .bind(toHex(salt), toHex(hash), username).run();
    await env.DB.prepare("DELETE FROM staff_sessions WHERE username = ?").bind(username).run();
}

export async function deactivateStaff(env: Env, username: string) {
    await env.DB.prepare("UPDATE staff_accounts SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE username = ? AND access_role != 'Admin'").bind(username).run();
    await env.DB.prepare("DELETE FROM staff_sessions WHERE username = ?").bind(username).run();
}
