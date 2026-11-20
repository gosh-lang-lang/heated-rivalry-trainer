import { describe, expect, it } from "vitest";
import { ENROLL_TTL_MS, openAuthStore, SESSION_TTL_MS } from "./auth-store.ts";

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
});
