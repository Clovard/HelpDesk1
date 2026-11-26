import { spawnSync } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const users = [
  ["andrey", "Андрей · администратор"],
  ["artem", "Артём · технический специалист L2"],
  ["pentagon", "Пентагон · технический специалист L3"],
];
// Keep this in sync with apps/api/src/services/auth.service.ts (Workers cap: 100,000).
const iterations = 100_000;

function readHidden(label) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
      reject(new Error("Запустите скрипт в обычном окне PowerShell."));
      return;
    }
    stdout.write(label);
    let value = "";
    const onData = (chunk) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Отменено."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0008" || char === "\u007f") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    function cleanup() {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

try {
  console.log("Этот скрипт изменит пароли трёх сотрудников в удалённой базе helpdesk-db.");
  console.log("Можно временно задать 123. После входа каждому нужно сменить пароль через кнопку «Пароль».");
  console.log("Пароли вводятся скрыто и не сохраняются в проекте.\n");
  const confirm = createInterface({ input: stdin, output: stdout });
  const answer = await confirm.question('Для продолжения введите SET: ');
  confirm.close();
  if (answer !== "SET") {
    console.log("Отменено, база не изменена.");
    process.exit(0);
  }

  const credentials = [];
  for (const [username, label] of users) {
    const password = await readHidden(`${label} — временный пароль: `);
    const repeated = await readHidden("Повторите пароль: ");
    if (password.length < 1 || password.length > 256) throw new Error("Пароль не должен быть пустым и не может быть длиннее 256 символов.");
    if (password !== repeated) throw new Error("Пароли не совпали. База не изменена.");
    const salt = randomBytes(16).toString("hex");
    const hash = pbkdf2Sync(password, Buffer.from(salt, "hex"), iterations, 32, "sha256").toString("hex");
    credentials.push({ username, salt, hash });
  }

  const updates = credentials.map(({ username, salt, hash }) =>
    `UPDATE staff_accounts SET password_salt=${sqlString(salt)}, password_hash=${sqlString(hash)}, updated_at=CURRENT_TIMESTAMP WHERE username=${sqlString(username)} AND active=1;`
  ).join(" ");
  const invalidateSessions = credentials.map(({ username }) =>
    `DELETE FROM staff_sessions WHERE username=${sqlString(username)};`
  ).join(" ");
  const sql = `${updates} ${invalidateSessions}`;
  const isWindows = process.platform === "win32";
  let command = "npx";
  let args = [
    "wrangler", "d1", "execute", "helpdesk-db", "--remote",
    "--config", "apps/api/wrangler.toml", "--command", sql,
  ];
  if (isWindows) {
    const located = spawnSync("where.exe", ["npx.cmd"], { encoding: "utf8" });
    const npxCmd = located.stdout?.split(/\r?\n/).find((line) => line.trim());
    if (located.status !== 0 || !npxCmd) throw new Error("Не найден npx. Установите Node.js и повторите запуск.");
    const npxCli = resolve(dirname(npxCmd.trim()), "node_modules/npm/bin/npx-cli.js");
    command = process.execPath;
    args = [npxCli, ...args];
  }
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Wrangler не смог обновить базу. Проверьте вывод выше.");
  console.log("\nПароли обновлены. Войдите в HelpDesk с выбранными паролями.");
} catch (error) {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
}
