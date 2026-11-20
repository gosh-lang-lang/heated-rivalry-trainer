import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeHint, encodeHint, ENROLL_TTL_MS, openAuthStore, SEEN_EVERY_MS, SESSION_TTL_MS, sessionIdOf, sha256 } from "./auth-store.ts";

const setup = () => {
  let t = 1_000_000;
  const store = openAuthStore(":memory:", () => t);
  return { store, tick: (ms: number) => (t += ms) };
};

describe("хранилище входа", () => {
  it("пользователя можно создать только с корректным именем и один раз", () => {
    const { store } = setup();
    expect(store.addUser("evgeny", "Евгений").display_name).toBe("Евгений");
    expect(() => store.addUser("evgeny")).toThrow(/уже есть/);
    expect(() => store.addUser("Bad Name")).toThrow(/имя/);
  });

  it("ссылка привязки: одноразовая, хранится только хэш", () => {
    const { store } = setup();
    const u = store.addUser("evgeny");
    const token = store.createEnrollToken(u.id);
    expect(store.enrollTokenUser(token)?.name).toBe("evgeny");
    const raw = store.db.prepare("SELECT hash FROM enroll_tokens").get() as { hash: string };
    expect(raw.hash).not.toContain(token);
    expect(store.useEnrollToken(token)).toBe(true);
    expect(store.useEnrollToken(token)).toBe(false);
    expect(store.enrollTokenUser(token)).toBeUndefined();
  });

  it("ссылка привязки истекает", () => {
    const { store, tick } = setup();
    const token = store.createEnrollToken(store.addUser("evgeny").id);
    tick(ENROLL_TTL_MS + 1);
    expect(store.enrollTokenUser(token)).toBeUndefined();
    expect(store.useEnrollToken(token)).toBe(false);
  });

  it("чужие и мусорные токены не подходят", () => {
    const { store } = setup();
    store.createEnrollToken(store.addUser("evgeny").id);
    expect(store.enrollTokenUser("x".repeat(43))).toBeUndefined();
    expect(store.enrollTokenUser("")).toBeUndefined();
  });

  it("вызов входа — одноразовый и с ограниченным сроком", () => {
    const { store, tick } = setup();
    const id = store.createChallenge("abc");
    expect(store.takeChallenge(id)).toBe("abc");
    expect(store.takeChallenge(id)).toBeUndefined();
    const id2 = store.createChallenge("def");
    tick(5 * 60 * 1000 + 1);
    expect(store.takeChallenge(id2)).toBeUndefined();
  });

  it("сессия: живёт 30 дней, продлевается при использовании, удаляется при выходе", () => {
    const { store, tick } = setup();
    const u = store.addUser("evgeny");
    const s = store.createSession(u.id);
    expect(store.sessionUser(s)?.user.name).toBe("evgeny");
    tick(20 * 24 * 3600 * 1000);
    expect(store.sessionUser(s)?.refreshed).toBe(true); // осталось < 15 дней → продлили
    tick(SESSION_TTL_MS - 1000);
    expect(store.sessionUser(s)).toBeDefined();
    store.deleteSession(s);
    expect(store.sessionUser(s)).toBeUndefined();
  });

  it("сессия истекает без использования; удаление пользователя убирает всё", () => {
    const { store, tick } = setup();
    const u = store.addUser("evgeny");
    const s = store.createSession(u.id);
    store.addCredential({ id: "cred1", user_id: u.id, public_key: new Uint8Array([1, 2]), counter: 0, transports: null, device_type: "multiDevice", backed_up: 1, label: null });
    tick(SESSION_TTL_MS + 1);
    expect(store.sessionUser(s)).toBeUndefined();
    const s2 = store.createSession(u.id);
    store.removeUser("evgeny");
    expect(store.sessionUser(s2)).toBeUndefined();
    expect(store.credential("cred1")).toBeUndefined();
  });

  it("passkey: сколько и сколько синхронизируется", () => {
    const { store } = setup();
    const u = store.addUser("evgeny");
    expect(store.passkeySummary(u.id)).toEqual({ count: 0, synced: 0 });
    const c = { user_id: u.id, public_key: new Uint8Array([1]), counter: 0, transports: null, label: null };
    store.addCredential({ ...c, id: "icloud", device_type: "multiDevice", backed_up: 1 });
    store.addCredential({ ...c, id: "key", device_type: "singleDevice", backed_up: 0 });
    expect(store.passkeySummary(u.id)).toEqual({ count: 2, synced: 1 });
  });
});

describe("устройства (сессии)", () => {
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";

  it("«когда был» отмечается не чаще раза в 5 минут", () => {
    const { store, tick } = setup();
    const u = store.addUser("evgeny");
    const s = store.createSession(u.id, MAC);
    const seen = () => store.sessionsOf(u.id)[0].last_seen_at;
    const t0 = seen();
    tick(SEEN_EVERY_MS - 1000);
    store.sessionUser(s);
    expect(seen()).toBe(t0); // рано — не пишем
    tick(1000);
    store.sessionUser(s);
    expect(seen()).toBe(t0 + SEEN_EVERY_MS);
  });

  it("список: свои действующие сессии, недавние первыми; id — начало хэша, не токен", () => {
    const { store, tick } = setup();
    const u = store.addUser("evgeny");
    const other = store.addUser("anna");
    const a = store.createSession(u.id, "A");
    tick(60_000);
    const b = store.createSession(u.id, "B");
    store.createSession(other.id, "чужая");
    const list = store.sessionsOf(u.id);
    expect(list.map((s) => s.user_agent)).toEqual(["B", "A"]);
    expect(list.map((s) => s.id)).toEqual([sessionIdOf(b), sessionIdOf(a)]);
    for (const s of list) {
      expect(s.id).toMatch(/^[0-9a-f]{16}$/);
      expect(sha256(a).startsWith(s.id) || sha256(b).startsWith(s.id)).toBe(true);
      expect(a).not.toContain(s.id);
    }
    tick(SESSION_TTL_MS);
    expect(store.sessionsOf(u.id)).toEqual([]); // истёкшие не показываем
  });

  it("подсказка браузера: только флаги, пишется при изменении, обновляет User-Agent", () => {
    const { store } = setup();
    const u = store.addUser("evgeny");
    const s = store.createSession(u.id, "старый UA");
    expect(store.sessionsOf(u.id)[0].device).toBeNull();
    expect(store.setSessionDevice(s, MAC, { touch: true, standalone: false })).toBe(true);
    expect(store.sessionsOf(u.id)[0]).toMatchObject({ device: "t", user_agent: MAC });
    expect(decodeHint("t")).toEqual({ touch: true, standalone: false });
    expect(decodeHint(encodeHint({ touch: false, standalone: false }))).toEqual({ touch: false, standalone: false });
    expect(decodeHint(encodeHint({ touch: true, standalone: true }))).toEqual({ touch: true, standalone: true });
    expect(decodeHint(null)).toBeNull();
    expect(store.setSessionDevice("нет-такой", MAC, { touch: false, standalone: false })).toBe(false);
  });

  it("выйти на устройстве можно только на своём", () => {
    const { store } = setup();
    const u = store.addUser("evgeny");
    const anna = store.addUser("anna");
    const mine = store.createSession(u.id);
    const hers = store.createSession(anna.id);
    expect(store.revokeSession(u.id, sessionIdOf(hers))).toBe(false); // чужая — нельзя
    expect(store.sessionUser(hers)).toBeDefined();
    for (const bad of ["", "%", "0".repeat(16), sha256(mine), sessionIdOf(mine).slice(0, 8), mine]) expect(store.revokeSession(u.id, bad)).toBe(false);
    expect(store.sessionUser(mine)).toBeDefined();
    expect(store.revokeSession(u.id, sessionIdOf(mine))).toBe(true);
    expect(store.sessionUser(mine)).toBeUndefined();
  });

  it("выйти везде, кроме этого: остаётся текущая, чужие не трогаем", () => {
    const { store } = setup();
    const u = store.addUser("evgeny");
    const anna = store.addUser("anna");
    const here = store.createSession(u.id);
    const phone = store.createSession(u.id);
    const tablet = store.createSession(u.id);
    const hers = store.createSession(anna.id);
    expect(store.revokeOtherSessions(u.id, here)).toBe(2);
    expect(store.sessionUser(here)).toBeDefined();
    expect(store.sessionUser(phone)).toBeUndefined();
    expect(store.sessionUser(tablet)).toBeUndefined();
    expect(store.sessionUser(hers)).toBeDefined();
  });

  it("старая база без last_seen_at и device получает колонки, сессии не теряются", () => {
    const dir = mkdtempSync(join(tmpdir(), "hr-auth-mig-"));
    try {
      const path = join(dir, "auth.db");
      const old = new DatabaseSync(path);
      old.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, webauthn_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
        CREATE TABLE sessions (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, user_agent TEXT);
        INSERT INTO users VALUES (1, 'evgeny', 'Евгений', 'w1', 1);
      `);
      old.prepare("INSERT INTO sessions VALUES (?, 1, 500, ?, ?)").run(sha256("старый-токен-старый-токен"), 1_000_000 + SESSION_TTL_MS, MAC);
      old.close();

      const store = openAuthStore(path, () => 1_000_000);
      expect(store.sessionUser("старый-токен-старый-токен")?.user.name).toBe("evgeny");
      expect(store.sessionsOf(1)).toEqual([{ id: sessionIdOf("старый-токен-старый-токен"), created_at: 500, last_seen_at: 1_000_000, user_agent: MAC, device: null }]);
      store.db.close();
      // повторное открытие (и второй процесс) ничего не ломает
      const again = openAuthStore(path, () => 1_000_000);
      expect(again.sessionsOf(1)).toHaveLength(1);
      again.db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
