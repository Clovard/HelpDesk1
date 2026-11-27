import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function hiddenPrompt(label) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("Запустите скрипт в обычном окне PowerShell."));
    process.stdout.write(label);
    const input = process.stdin;
    input.setRawMode(true);
    input.resume();
    let value = "";
    const onData = (chunk) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") { cleanup(); reject(new Error("Отменено.")); return; }
        if (char === "\r" || char === "\n") { cleanup(); resolve(value); return; }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    function cleanup() { input.off("data", onData); input.setRawMode(false); input.pause(); process.stdout.write("\n"); }
    input.on("data", onData);
  });
}

try {
  const first = await hiddenPrompt("Новый пароль для администратора andrey (минимум 8 символов): ");
  const second = await hiddenPrompt("Повторите пароль: ");
  if (first.length < 8 || first.length > 128) throw new Error("Пароль должен содержать от 8 до 128 символов.");
  if (first !== second) throw new Error("Пароли не совпадают.");

  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(first, Buffer.from(salt, "hex"), 100_000, 32, "sha256").toString("hex");
  const sql = `UPDATE staff_accounts SET password_salt='${salt}', password_hash='${hash}', active=1, updated_at=CURRENT_TIMESTAMP WHERE username='andrey'; DELETE FROM staff_sessions WHERE username='andrey';`;
  const require = createRequire(import.meta.url);
  let cli;
  for (const location of ["wrangler/bin/wrangler.js", "node_modules/wrangler/bin/wrangler.js"]) {
    try { cli = require.resolve(location); break; } catch {}
  }
  if (!cli) {
    const npx = spawnSync("where.exe", ["npx.cmd"], { encoding: "utf8" }).stdout?.split(/\r?\n/)[0]?.trim();
    const candidate = npx && join(dirname(npx), "node_modules", "npm", "bin", "npx-cli.js");
    if (candidate && existsSync(candidate)) {
      const run = spawnSync(process.execPath, [candidate, "--yes", "wrangler", "d1", "execute", "helpdesk-db", "--remote", "--config", "apps/api/wrangler.toml", "--command", sql], { stdio: "inherit" });
      if (run.status !== 0) process.exit(run.status ?? 1);
      console.log("Пароль администратора установлен. Логин: andrey");
      process.exit(0);
    }
    throw new Error("Не найден Wrangler. Сначала выполните npm install в корне проекта.");
  }
  const run = spawnSync(process.execPath, [cli, "d1", "execute", "helpdesk-db", "--remote", "--config", "apps/api/wrangler.toml", "--command", sql], { stdio: "inherit" });
  if (run.status !== 0) process.exit(run.status ?? 1);
  console.log("Пароль администратора установлен. Логин: andrey");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
