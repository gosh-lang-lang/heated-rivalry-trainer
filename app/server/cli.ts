/**
 * Управление входом (на сервере: docker exec heated-rivalry node server/cli.ts …).
 *
 *   user:add <имя> [Отображаемое имя]   — создать пользователя (публичной регистрации нет)
 *   users                               — список пользователей
 *   enroll <имя> [минут=15]             — одноразовая ссылка привязки passkey
 *   passkeys [имя]                      — привязанные passkey
 *   passkey:remove <id или начало id>   — отозвать passkey
 *   logout <имя>                        — завершить все сессии пользователя
 *   user:remove <имя>                   — удалить пользователя со всеми passkey и сессиями
 */
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openAuthStore } from "./auth-store.ts";
import { authConfigFromEnv } from "./auth.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const store = openAuthStore(process.env.AUTH_DB ?? join(ROOT, "server/cache/auth.db"));
const cfg = authConfigFromEnv();
const [cmd, ...args] = process.argv.slice(2);
const date = (t: number | null) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) : "—");
const die = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};
const need = (name: string | undefined) => (name ? store.userByName(name) : undefined) ?? die(`нет пользователя ${name ?? ""}`.trim());

switch (cmd) {
  case "user:add": {
    const [name, ...display] = args;
    if (!name) die("user:add <имя> [Отображаемое имя]");
    const u = store.addUser(name!, display.join(" ") || name);
    console.log(`создан: ${u.name} (${u.display_name}). Ссылка для passkey: node server/cli.ts enroll ${u.name}`);
    break;
  }
  case "users":
    for (const u of store.listUsers())
      console.log(`${u.name}\t${u.display_name}\tpasskey: ${store.credentialsOf(u.id).length}\tсессий: ${store.countSessions(u.id)}`);
    break;
  case "enroll": {
    const u = need(args[0]);
    const minutes = Math.min(Math.max(Number(args[1] ?? 15) || 15, 1), 24 * 60);
    const token = store.createEnrollToken(u.id, minutes * 60 * 1000);
    // токен — во фрагменте (#): не попадает в логи сервера и в Referer
    console.log(`Ссылка для ${u.display_name} (одноразовая, ${minutes} мин):\n${cfg.origin}/login#enroll=${token}`);
    break;
  }
  case "passkeys":
    for (const c of store.allCredentials().filter((c) => !args[0] || c.user_name === args[0]))
      console.log(`${c.id.slice(0, 16)}…\t${c.user_name}\t${c.device_type}${c.backed_up ? " (синхронизируется)" : ""}\tсоздан ${date(c.created_at)}\tвход ${date(c.last_used_at)}\t${c.label ?? ""}`);
    break;
  case "passkey:remove": {
    const p = args[0] ?? die("passkey:remove <id или начало id>");
    const found = store.allCredentials().filter((c) => c.id.startsWith(p.replace(/…$/, "")));
    if (found.length !== 1) die(found.length ? "под это начало подходит несколько passkey — уточни" : "не найдено");
    store.removeCredential(found[0].id);
    console.log(`отозван passkey ${found[0].id.slice(0, 16)}… пользователя ${found[0].user_name}`);
    break;
  }
  case "logout": {
    const u = need(args[0]);
    console.log(`завершено сессий: ${store.deleteSessionsOf(u.id)}`);
    break;
  }
  case "user:remove":
    console.log(store.removeUser(args[0] ?? "") ? "удалён" : "нет такого пользователя");
    break;
  default:
    console.log(readmeUsage());
}

function readmeUsage() {
  return `Команды: user:add <имя> [Имя], users, enroll <имя> [минут], passkeys [имя], passkey:remove <id>, logout <имя>, user:remove <имя>
База: ${process.env.AUTH_DB ?? "server/cache/auth.db"} · адрес: ${cfg.origin}`;
}
