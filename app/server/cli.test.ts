/** Команды управления входом (server/cli.ts) — на временной базе, как их запускают на сервере. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyState } from "../src/core/state.ts";
import { openAuthStore } from "./auth-store.ts";
import { openProgress } from "./progress.ts";

const dir = mkdtempSync(join(tmpdir(), "hr-cli-"));
const db = join(dir, "auth.db");
const ORIGIN = "https://trainer.example";
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const cli = (...args: string[]) => {
  const r = spawnSync("node", ["--disable-warning=ExperimentalWarning", "server/cli.ts", ...args], {
    env: { ...process.env, AUTH_DB: db, AUTH_ORIGIN: ORIGIN },
    encoding: "utf8",
  });
  return { out: r.stdout, err: r.stderr, code: r.status };
};
const store = () => openAuthStore(db);

describe("CLI входа", () => {
  beforeAll(() => {
    expect(cli("user:add", "evgeny", "Евгений", "Л.").code).toBe(0);
  });

  it("user:add: создаёт; повтор и плохое имя — ошибка; без имени — подсказка", () => {
    expect(store().userByName("evgeny")?.display_name).toBe("Евгений Л.");
    expect(cli("user:add", "evgeny").code).not.toBe(0);
    expect(cli("user:add", "Bad Name!").code).not.toBe(0);
    const r = cli("user:add");
    expect(r.code).toBe(1);
    expect(r.err).toContain("user:add <имя>");
  });

  it("enroll: одноразовая ссылка на свой домен, токен во фрагменте; срок — в разумных пределах", () => {
    const r = cli("enroll", "evgeny", "60");
    expect(r.code).toBe(0);
    expect(r.out).toContain("60 мин");
    const token = r.out.match(new RegExp(`^${ORIGIN}/login#enroll=([\\w-]{40,})$`, "m"))![1];
    expect(store().enrollTokenUser(token)?.name).toBe("evgeny");
    expect(cli("enroll", "evgeny", "99999").out).toContain("1440 мин"); // не дольше суток
    expect(cli("enroll", "evgeny", "abc").out).toContain("15 мин");
    expect(cli("enroll", "nobody").code).toBe(1);
  });

  it("users, passkeys, passkey:remove", () => {
    const s = store();
    const u = s.userByName("evgeny")!;
    for (const id of ["AAAAkey1-iphone", "AAAAkey2-mac"])
      s.addCredential({ id, user_id: u.id, public_key: new Uint8Array([1]), counter: 0, transports: null, device_type: "multiDevice", backed_up: 1, label: "Safari" });
    s.createSession(u.id);
    expect(cli("users").out).toContain("evgeny\tЕвгений Л.\tpasskey: 2\tсессий: 1");
    expect(cli("passkeys", "evgeny").out.trim().split("\n")).toHaveLength(2);
    expect(cli("passkeys", "evgeny").out).toContain("(синхронизируется)");
    expect(cli("passkeys", "someone-else").out).toBe("");

    const ambiguous = cli("passkey:remove", "AAAA");
    expect(ambiguous.code).toBe(1);
    expect(ambiguous.err).toContain("несколько");
    expect(cli("passkey:remove", "ZZZ").err).toContain("не найдено");
    expect(cli("passkey:remove", "AAAAkey2…").out).toContain("отозван"); // можно вставить как в списке, с «…»
    expect(store().credentialsOf(u.id).map((c) => c.id)).toEqual(["AAAAkey1-iphone"]);
  });

  it("logout завершает все сессии пользователя", () => {
    const s = store();
    const u = s.userByName("evgeny")!;
    s.createSession(u.id);
    expect(cli("logout", "evgeny").out).toMatch(/завершено сессий: [1-9]/);
    expect(store().countSessions(u.id)).toBe(0);
    expect(cli("logout", "nobody").code).toBe(1);
  });

  it("progress показывает, чей прогресс и сколько слов", () => {
    const u = store().userByName("evgeny")!;
    openProgress(openAuthStore(db).db).put(u.id, { ...emptyState(), upd: Date.now(), srs: { sacred: { lvl: 1, due: "2026-11-21", intro: "2026-11-20", right: 1, wrong: 0 } } });
    expect(cli("progress").out).toMatch(/^evgeny\tслов: 1\t/m);
  });

  it("user:remove удаляет пользователя со всем, что к нему привязано", () => {
    cli("user:add", "anna");
    const s = store();
    const anna = s.userByName("anna")!;
    s.addCredential({ id: "anna-key", user_id: anna.id, public_key: new Uint8Array([1]), counter: 0, transports: null, device_type: "singleDevice", backed_up: 0, label: null });
    s.createSession(anna.id);
    openProgress(s.db).put(anna.id, { ...emptyState(), upd: Date.now() });
    expect(cli("user:remove", "anna").out).toContain("удалён");
    const left = (t: string) => (store().db.prepare(`SELECT count(*) AS n FROM ${t} WHERE user_id = ?`).get(anna.id) as { n: number }).n;
    expect([left("credentials"), left("sessions"), left("progress")]).toEqual([0, 0, 0]);
    expect(cli("user:remove", "anna").out).toContain("нет такого пользователя");
    expect(cli("users").out).not.toContain("anna");
  });

  it("без команды — список команд и куда смотрит", () => {
    const r = cli();
    expect(r.out).toContain("Команды:");
    expect(r.out).toContain(ORIGIN);
  });
});
