import { describe, expect, it } from "vitest";
import { openAuthStore } from "./auth-store.ts";
import { openProgress, parseStateBody, TZ_CHANGE_MS } from "./progress.ts";
import { emptyState } from "../src/core/state.ts";
import type { AppState } from "../src/core/types.ts";

/** Часы сервера в тестах: 21.11.2026, 12:00 по Москве. */
const NOW = Date.parse("2026-11-21T12:00:00+03:00");
const setup = (clock: { t: number } = { t: NOW }) => {
  const store = openAuthStore(":memory:", () => 1_000_000);
  const progress = openProgress(store.db, { now: () => clock.t, rare: (id) => id === "rare" });
  return { store, progress, clock, a: store.addUser("alice"), b: store.addUser("bob") };
};
const st = (upd: number, newPerDay = 12): AppState => ({
  ...emptyState(),
  upd,
  settings: { ...emptyState().settings, newPerDay },
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
    expect(progress.put(a.id, st(20, 18)).saved).toBe(false); // то же самое — не перезаписываем
    expect(progress.get(a.id)!.settings.newPerDay).toBe(18);
  });

  it("настройки сливаются по пунктам: старый прогресс с новой настройкой и наоборот", () => {
    const { progress, a } = setup();
    const at = (s: AppState, newPerDay: number, voice: number) => ({ ...s, settingsAt: { ...s.settingsAt, newPerDay, voice } });
    progress.put(a.id, at(st(10, 6), 100, 0));
    // устройство со старым прогрессом, но только что выбранным голосом
    const r1 = progress.put(a.id, at({ ...st(5, 12), srs: {}, settings: { ...emptyState().settings, newPerDay: 12, voice: "bf_emma" } }, 50, 200));
    expect(r1.saved).toBe(true);
    expect(r1.state.upd).toBe(10);
    expect(Object.keys(r1.state.srs)).toEqual(["sacred"]); // прогресс — новее, остался
    expect(r1.state.settings).toMatchObject({ newPerDay: 6, voice: "bf_emma" }); // 6 — поменяли позже, чем 12
    // устройство с новым прогрессом (занятие), но старыми настройками — настройки не трогает
    const r2 = progress.put(a.id, at({ ...st(30, 24), settings: { ...emptyState().settings, newPerDay: 24, voice: "af_heart" } }, 0, 0));
    expect(r2.state.upd).toBe(30);
    expect(r2.state.settings).toMatchObject({ newPerDay: 6, voice: "bf_emma" });
    expect(progress.get(a.id)).toEqual(r2.state);
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
    expect(progress.summary()).toEqual([{ name: "alice", upd: 10, savedAt: NOW, bytes: expect.any(Number), words: 1, days: 0, tz: "" }]);
  });
});

describe("день занятия решает сервер", () => {
  const msk = (day: string, hm: string) => new Date(`${day}T${hm}:00+03:00`).toISOString();
  const res = (at: string) => ({ score: 30, total: 38, mins: 15, newN: 12, at });
  const lesson = (upd: number, day: string, at: string): AppState => ({ ...st(upd), days: { [day]: { morning: res(at) } } });
  const H = 3600_000;

  it("пояс берётся с устройства один раз; присланный потом и пояс в самом состоянии не меняют его", () => {
    const { progress, a } = setup();
    expect(progress.put(a.id, st(10), "Asia/Tokyo").state).toMatchObject({ tz: "Asia/Tokyo", tzAt: NOW });
    expect(progress.put(a.id, { ...st(20), tz: "Europe/London", tzAt: NOW * 2 }, "America/New_York").state).toMatchObject({ tz: "Asia/Tokyo", tzAt: NOW });
  });

  it("пока пояса нет (старое приложение) — Москва", () => {
    const { progress, a } = setup({ t: Date.parse("2026-11-20T22:30:00Z") }); // Москва: 01:30 21-го
    const s = progress.put(a.id, lesson(10, "2026-11-20", "2026-11-20T22:29:00Z")).state;
    expect(Object.keys(s.days)).toEqual(["2026-11-21"]);
    expect(s.tz).toBe("");
  });

  it("часы устройства вперёд и назад — день по серверу", () => {
    const { progress, a } = setup();
    progress.put(a.id, st(1), "Europe/Moscow");
    // вперёд на 3 дня
    let s = progress.put(a.id, lesson(10, "2026-11-24", msk("2026-11-24", "11:00"))).state;
    expect(Object.keys(s.days)).toEqual(["2026-11-21"]);
    // назад на неделю — тоже сегодня (часть 1 сегодня уже есть: день один)
    s = progress.put(a.id, { ...s, upd: 20, days: { ...s.days, "2026-11-14": { morning: res(msk("2026-11-14", "11:00")) } } }).state;
    expect(Object.keys(s.days)).toEqual(["2026-11-21"]);
    expect(progress.get(a.id)!.days).toEqual(s.days);
  });

  it("без сети: через 3 часа — день занятия, через 2 дня — день получения", () => {
    const clock = { t: Date.parse(msk("2026-11-21", "02:00")) };
    const { progress, a } = setup(clock);
    progress.put(a.id, st(1), "Europe/Moscow");
    expect(Object.keys(progress.put(a.id, lesson(10, "2026-11-20", msk("2026-11-20", "23:00"))).state.days)).toEqual(["2026-11-20"]);
    clock.t += 50 * H; // 23.11, 04:00
    const s = progress.put(a.id, { ...progress.get(a.id)!, upd: 20, days: { ...progress.get(a.id)!.days, "2026-11-21": { morning: res(msk("2026-11-21", "01:00")) } } }).state;
    expect(Object.keys(s.days)).toEqual(["2026-11-20", "2026-11-23"]);
  });

  it("два устройства: итог, переложенный сервером, второе устройство не возвращает под старым днём", () => {
    const { progress, a } = setup();
    const phone = lesson(10, "2026-11-24", msk("2026-11-24", "09:00")); // часы телефона впереди
    progress.put(a.id, phone, "Europe/Moscow");
    // ноутбук слил ответ сервера со старой копией телефона (без srv) и прислал всё вместе
    const laptop: AppState = { ...phone, upd: 30, days: { ...phone.days, "2026-11-21": { evening: res(msk("2026-11-21", "11:00")) } } };
    const s = progress.put(a.id, laptop).state;
    expect(Object.keys(s.days)).toEqual(["2026-11-21"]);
    expect(s.days["2026-11-21"].morning?.srv).toBe(NOW);
    expect(s.days["2026-11-21"].evening?.srv).toBe(Date.parse(msk("2026-11-21", "11:00")));
  });

  it("старые данные: get отдаёт итоги подтверждёнными, дни и серия на месте", () => {
    const { progress, store, a } = setup();
    const old = { ...st(5), days: { "2026-11-19": { morning: res(msk("2026-11-19", "09:00")) }, "2026-11-20": { morning: res(msk("2026-11-20", "09:00")) } } };
    store.db.prepare("INSERT INTO progress (user_id, state, upd, saved_at) VALUES (?, ?, ?, ?)").run(a.id, JSON.stringify(old), 5, 1);
    const got = progress.get(a.id)!;
    expect(Object.keys(got.days)).toEqual(["2026-11-19", "2026-11-20"]);
    expect(got.days["2026-11-19"].morning?.srv).toBe(Date.parse(msk("2026-11-19", "09:00")));
    // устройство со старым кэшем шлёт ту же историю (больше 48 часов назад) — она не переезжает в сегодня
    expect(Object.keys(progress.put(a.id, { ...old, upd: 9 }, "Europe/Moscow").state.days)).toEqual(["2026-11-19", "2026-11-20"]);
  });

  it("смена пояса: явно, не чаще раза в сутки; пройденные дни не двигаются", () => {
    const clock = { t: NOW };
    const { progress, a } = setup(clock);
    progress.put(a.id, lesson(10, "2026-11-21", msk("2026-11-21", "09:00")), "Europe/Moscow");
    expect(progress.setTz(a.id, "Mars/Olympus")).toEqual({ error: "неизвестный часовой пояс" });
    expect(progress.setTz(a.id, "America/New_York")).toMatchObject({ next: NOW + TZ_CHANGE_MS });
    expect(progress.setTz(a.id, "Europe/Moscow")).toHaveProperty("state"); // тот же — не смена
    clock.t += TZ_CHANGE_MS;
    const r = progress.setTz(a.id, "America/New_York");
    expect(r).toHaveProperty("state");
    const s = progress.get(a.id)!;
    expect(s).toMatchObject({ tz: "America/New_York", tzAt: clock.t });
    expect(Object.keys(s.days)).toEqual(["2026-11-21"]);
    expect(progress.setTz(a.id, "Asia/Tokyo")).toHaveProperty("next"); // снова — только через сутки
    // новое занятие — по новому поясу: 22.11 03:00 UTC — в Нью-Йорке ещё 21-е
    clock.t = Date.parse("2026-11-22T03:00:00Z");
    const after = progress.put(a.id, { ...s, upd: 40, days: { ...s.days, "2026-11-22": { evening: res("2026-11-22T02:00:00Z") } } }).state;
    expect(Object.keys(after.days)).toEqual(["2026-11-21"]);
    expect(after.days["2026-11-21"].evening).toBeTruthy();
  });

  it("слова: даты повтора не дальше интервала от сегодня сервера (редкое — вдвое)", () => {
    const { progress, a } = setup();
    const s = progress.put(a.id, {
      ...st(10),
      srs: { w: { lvl: 2, due: "2027-01-01", intro: "2026-12-01", right: 3, wrong: 0 }, rare: { lvl: 2, due: "2027-01-01", intro: "2026-11-01", right: 3, wrong: 0 } },
    }).state;
    expect(s.srs.w).toMatchObject({ intro: "2026-11-21", due: "2026-11-24" });
    expect(s.srs.rare).toMatchObject({ intro: "2026-11-01", due: "2026-11-27" });
  });
});

describe("тело запроса сохранения", () => {
  it("принимает состояние и чистит его", () => {
    const s = parseStateBody(JSON.stringify({ state: { ...st(5), junk: 1 } }));
    expect(s).toEqual({ state: st(5) });
  });
  it("пояс устройства — только настоящий пояс IANA", () => {
    expect(parseStateBody(JSON.stringify({ state: st(5), tz: "Asia/Tokyo" }))).toEqual({ state: st(5), tz: "Asia/Tokyo" });
    expect(parseStateBody(JSON.stringify({ state: st(5), tz: "Mars/Olympus" }))).toEqual({ state: st(5) });
    expect(parseStateBody(JSON.stringify({ state: st(5), tz: 3 }))).toEqual({ state: st(5) });
  });
  it("отклоняет не-JSON, чужие данные и состояние без upd", () => {
    expect(parseStateBody("nope")).toMatch(/JSON/);
    expect(parseStateBody(JSON.stringify({ state: { foo: 1 } }))).toMatch(/srs/);
    expect(parseStateBody(JSON.stringify({ state: emptyState() }))).toMatch(/upd/);
    expect(parseStateBody(JSON.stringify(null))).toMatch(/srs/);
  });
});
