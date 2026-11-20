import { describe, expect, it } from "vitest";
import { openAuthStore } from "./auth-store.ts";
import { openProgress, parseStateBody } from "./progress.ts";
import { emptyState } from "../src/core/state.ts";
import type { AppState } from "../src/core/types.ts";

const setup = () => {
  const store = openAuthStore(":memory:", () => 1_000_000);
  const progress = openProgress(store.db, () => 2_000_000);
  return { store, progress, a: store.addUser("alice"), b: store.addUser("bob") };
};
const st = (upd: number, newPerDay = 12): AppState => ({
  ...emptyState(),
  upd,
  settings: { newPerDay },
  srs: { sacred: { lvl: 2, due: "2026-11-22", intro: "2026-11-20", right: 3, wrong: 1 } },
});

describe("прогресс на сервере", () => {
  it("у нового пользователя прогресса нет", () => {
    const { progress, a } = setup();
    expect(progress.get(a.id)).toBeNull();
  });

  it("первое сохранение записывается и читается обратно", () => {
    const { progress, a } = setup();
    expect(progress.put(a.id, st(10)).saved).toBe(true);
    expect(progress.get(a.id)).toEqual(st(10));
  });

  it("более новое заменяет, более старое и такое же — нет, в ответ приходит актуальное", () => {
    const { progress, a } = setup();
    progress.put(a.id, st(10, 6));
    expect(progress.put(a.id, st(20, 18))).toEqual({ state: st(20, 18), saved: true });
    expect(progress.put(a.id, st(15, 24))).toEqual({ state: st(20, 18), saved: false });
    expect(progress.put(a.id, st(20, 24)).saved).toBe(false);
    expect(progress.get(a.id)!.settings.newPerDay).toBe(18);
  });

  it("у каждого пользователя свой прогресс", () => {
    const { progress, a, b } = setup();
    progress.put(a.id, st(10, 6));
    progress.put(b.id, st(5, 24));
    expect(progress.get(a.id)!.settings.newPerDay).toBe(6);
    expect(progress.get(b.id)!.settings.newPerDay).toBe(24);
  });

  it("прогресс удаляется вместе с пользователем", () => {
    const { store, progress, a } = setup();
    progress.put(a.id, st(10));
    store.removeUser("alice");
    expect((store.db.prepare("SELECT count(*) n FROM progress").get() as { n: number }).n).toBe(0);
  });

  it("сводка для командной строки", () => {
    const { progress, a } = setup();
    progress.put(a.id, st(10));
    expect(progress.summary()).toEqual([{ name: "alice", upd: 10, savedAt: 2_000_000, bytes: expect.any(Number), words: 1, days: 0 }]);
  });
});

describe("тело запроса сохранения", () => {
  it("принимает состояние и чистит его", () => {
    const s = parseStateBody(JSON.stringify({ state: { ...st(5), junk: 1 } }));
    expect(s).toEqual(st(5));
  });
  it("отклоняет не-JSON, чужие данные и состояние без upd", () => {
    expect(parseStateBody("nope")).toMatch(/JSON/);
    expect(parseStateBody(JSON.stringify({ state: { foo: 1 } }))).toMatch(/srs/);
    expect(parseStateBody(JSON.stringify({ state: emptyState() }))).toMatch(/upd/);
    expect(parseStateBody(JSON.stringify(null))).toMatch(/srs/);
  });
});
