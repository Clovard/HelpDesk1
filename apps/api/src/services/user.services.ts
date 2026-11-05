import type { Env } from "../db/client";

export type CreateUserInput = {
    telegramId?: string;
    name: string;
    role?: "Employee" | "Agent" | "Admin";
    city?: string;
    department?: string;
};

export type UpdateUserInput = {
    name?: string;
    role?: "Employee" | "Agent" | "Admin";
    city?: string | null;
    department?: string | null;
};

export async function listUsers(env: Env) {
    const result = await env.DB.prepare(
    `
      SELECT *
      FROM users
      ORDER BY name ASC
    `,
    ).all();

    return result.results;
}

export async function getUserById(
env: Env,
id: number,
) {
    return env.DB.prepare(
    `
      SELECT *
      FROM users
      WHERE id = ?
    `,
    )
    .bind(id)
    .first();
}

export async function createUser(
env: Env,
input: CreateUserInput,
) {
    const result = await env.DB.prepare(
    `
      INSERT INTO users (
        telegram_id,
        name,
        role,
        city,
        department
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    )
    .bind(
    input.telegramId ?? null,
    input.name,
    input.role ?? "Employee",
    input.city ?? null,
    input.department ?? null,
    )
    .run();

    return {
        id: result.meta.last_row_id,
    };
}

export async function updateUser(
env: Env,
id: number,
input: UpdateUserInput,
) {
    const current = await getUserById(
    env,
    id,
    );

    if (!current) {
        return null;
    }

    await env.DB.prepare(
    `
      UPDATE users
      SET
        name = COALESCE(?, name),
        role = COALESCE(?, role),
        city = ?,
        department = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    )
    .bind(
    input.name ?? null,
    input.role ?? null,
    input.city ?? null,
    input.department ?? null,
    id,
    )
    .run();

    return getUserById(env, id);
}