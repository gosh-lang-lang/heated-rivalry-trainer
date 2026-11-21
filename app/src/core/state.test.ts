import { describe, expect, it } from "vitest";
import { changeSetting, emptyState, mergeStates, parseState, resetProgress, sameState, withPersonal } from "./state";
import { state } from "./fixtures";
import type { SavedRun } from "./types";

const prototypeExport = {
  upd: 1763650000000,
  settings: { newPerDay: 18 },
  srs: { sacred: { lvl: 3, due: "2026-11-25", intro: "2026-11-10", right: 5, wrong: 2 } },
  days: { "2026-11-19": { morning: { score: 34, total: 38, mins: 14, newN: 12, at: "2026-11-19T07:00:00Z" }, reread: true } },
  sent: [{ at: "2026-11-19T19:00:00Z", words: ["endure"], text: "I endured it.", ok: true, corrected: "I endured it.", comment: "" }],
  exportedAt: "2026-11-20T10:00:00Z",
  app: "hr2",
};

describe("импорт состояния", () => {
  it("экспорт прототипа сохраняет уровни, дни и предложения", () => {
    const s = parseState(JSON.stringify(prototypeExport));
    expect(s.srs.sacred).toEqual(prototypeExport.srs.sacred);
    expect(s.days["2026-11-19"].morning?.score).toBe(34);
    expect(s.days["2026-11-19"].reread).toBe(true);
    expect(s.settings.newPerDay).toBe(18);
    expect(s.sent).toHaveLength(1);
    expect(s).not.toHaveProperty("exportedAt");
  });
  it("мусор отбрасывается", () => {
    const s = parseState({ srs: { a: { lvl: 99, due: "завтра" }, b: "x" }, days: { bad: {} }, sent: [1, { text: "ok" }] });
    expect(s.srs.a).toMatchObject({ lvl: 6, due: "" });
    expect(s.srs.b).toBeUndefined();
    expect(s.days).toEqual({});
    expect(s.sent).toHaveLength(1);
    expect(s.settings.newPerDay).toBe(12);
  });
  it("не экспорт — ошибка", () => {
    expect(() => parseState({ foo: 1 })).toThrow(/srs/);
    expect(() => parseState("не json")).toThrow();
  });
  it("слияние по upd", () => {
    const a = state({ upd: 5 }),
      b = state({ upd: 7, srs: { x: { lvl: 1, due: "", intro: "", right: 0, wrong: 0 } } });
    expect(mergeStates(a, b)).toEqual(b);
    expect(mergeStates(b, a)).toEqual(b);
  });
});

describe("слияние копий: прогресс — кто новее, настройки — по пунктам", () => {
  const base = { ...emptyState(), srs: { a: { lvl: 1, due: "2026-11-21", intro: "2026-11-20", right: 1, wrong: 0 } } };
  const laptop = { ...changeSetting(base, "newPerDay", 6, 1000), upd: 5000 }; // занимался позже
  const phone = { ...changeSetting(changeSetting(emptyState(), "voice", "bf_emma", 3000), "newPerDay", 24, 3000), upd: 3000 };

  it("прогресс — из более новой копии, каждый пункт настроек — изменённый позже", () => {
    const m = mergeStates(laptop, phone);
    expect(m.upd).toBe(5000);
    expect(m.srs).toEqual(laptop.srs);
    expect(m.settings).toEqual({ newPerDay: 24, voice: "bf_emma", look: "ice", theme: "system", avatar: "", avatarNum: "" });
    expect(m.settingsAt).toEqual({ newPerDay: 3000, voice: 3000, look: 0, theme: 0, avatar: 0, avatarNum: 0 });
  });

  it("порядок не важен, повторное слияние ничего не меняет", () => {
    expect(mergeStates(phone, laptop)).toEqual(mergeStates(laptop, phone));
    const m = mergeStates(laptop, phone);
    expect(mergeStates(m, phone)).toEqual(m);
    expect(mergeStates(m, laptop)).toEqual(m);
    const tie = { ...phone, upd: laptop.upd };
    expect(mergeStates(tie, laptop)).toEqual(mergeStates(laptop, tie));
  });

  it("оформление и день/ночь — такие же пункты: сливаются по отдельности, мусор отбрасывается", () => {
    const phone = changeSetting(changeSetting(emptyState(), "look", "match", 2000), "theme", "dark", 2000);
    const laptop = { ...changeSetting(emptyState(), "theme", "light", 1000), upd: 9000 };
    expect(mergeStates(laptop, phone).settings).toMatchObject({ look: "match", theme: "dark" });
    expect(parseState({ srs: {}, settings: { look: "neon", theme: "sepia" } }).settings).toMatchObject({ look: "ice", theme: "system", avatar: "", avatarNum: "" });
    expect(parseState({ srs: {}, settings: { look: "classic", theme: "light" } }).settings).toMatchObject({ look: "classic", theme: "light" });
    for (const look of ["cities-red", "cities-black", "away"] as const)
      expect(parseState({ srs: {}, settings: { look } }).settings.look).toBe(look);
  });

  it("изменение пункта: новое значение и метка, даже если часы ушли назад", () => {
    const s = changeSetting(changeSetting(emptyState(), "voice", "bf_emma", 5000), "voice", "am_adam", 4000);
    expect(s.settings.voice).toBe("am_adam");
    expect(s.settingsAt.voice).toBe(5001);
    expect(s.settingsAt.newPerDay).toBe(0);
  });

  it("старые копии без меток и голоса читаются: голос по умолчанию, метки — 0; неизвестный голос отбрасывается", () => {
    const s = parseState({ upd: 1, settings: { newPerDay: 18 }, srs: {} });
    expect(s.settings).toEqual({ newPerDay: 18, voice: "af_heart", look: "ice", theme: "system", avatar: "", avatarNum: "" });
    expect(s.settingsAt).toEqual({ newPerDay: 0, voice: 0, look: 0, theme: 0, avatar: 0, avatarNum: 0 });
    expect(parseState({ srs: {}, settings: { voice: "robot" } }).settings.voice).toBe("af_heart");
    expect(parseState({ srs: {}, settings: { voice: "bm_george" }, settingsAt: { voice: 7 } })).toMatchObject({ settings: { voice: "bm_george" }, settingsAt: { voice: 7 } });
  });
});

describe("слияние прогресса с двух устройств", () => {
  const w = (right: number, wrong = 0, intro = "2026-11-20", lvl = 1) => ({ lvl, due: "2026-11-21", intro, right, wrong });
  const res = (at: string, score = 30) => ({ score, total: 38, mins: 14, newN: 12, at });
  const sent = (at: string, text: string, pending?: boolean) => ({ at, words: ["endure"], text, ...(pending ? { pending } : {}) });

  const laptop = state({
    upd: 100,
    srs: { a: w(3), b: w(1), c: w(0) },
    days: { "2026-11-20": { morning: res("2026-11-20T07:00:00Z"), extra: [res("2026-11-20T12:00:00Z")] } },
    sent: [sent("2026-11-20T19:00:00Z", "I endure.", true)],
  });
  const phone = state({
    upd: 200, // отправлен позже, но занимался на старом кэше
    srs: { a: w(1), b: w(2, 1, "2026-11-20", 2), d: w(1) },
    days: {
      "2026-11-20": { evening: res("2026-11-20T19:30:00Z"), extra: [res("2026-11-20T15:00:00Z")], reread: true },
      "2026-11-21": { morning: res("2026-11-21T07:00:00Z") },
    },
    sent: [{ ...sent("2026-11-20T19:00:00Z", "I endure."), ok: true, corrected: "I endure it." }, sent("2026-11-20T19:40:00Z", "I praise you.", true)],
  });

  it("слова: все с обоих устройств, у каждого — версия, где отвечали больше", () => {
    const m = mergeStates(laptop, phone);
    expect(m.srs).toEqual({ a: w(3), b: w(2, 1, "2026-11-20", 2), c: w(0), d: w(1) });
  });

  it("знакомство со словом не теряется, если ответов поровну", () => {
    const seen = state({ upd: 1, srs: { x: w(0, 0, "2026-11-20") } });
    const blank = state({ upd: 9, srs: { x: w(0, 0, "", 0) } });
    expect(mergeStates(seen, blank).srs.x.intro).toBe("2026-11-20");
  });

  it("дни: утро с одного, вечер с другого, все дополнительные по времени, «перечитал» сохраняется", () => {
    const m = mergeStates(laptop, phone);
    expect(m.days["2026-11-20"]).toEqual({
      morning: res("2026-11-20T07:00:00Z"),
      evening: res("2026-11-20T19:30:00Z"),
      extra: [res("2026-11-20T12:00:00Z"), res("2026-11-20T15:00:00Z")],
      reread: true,
    });
    expect(m.days["2026-11-21"].morning?.at).toBe("2026-11-21T07:00:00Z");
    // одно и то же утро на двух устройствах — остаётся более позднее
    const again = mergeStates(state({ upd: 9, days: { d: { morning: res("2026-11-20T07:00:00Z", 10) } } }), state({ upd: 1, days: { d: { morning: res("2026-11-20T08:00:00Z", 20) } } }));
    expect(again.days.d.morning?.score).toBe(20);
  });

  it("предложения: все, по времени; проверенная версия побеждает ждущую проверки", () => {
    const m = mergeStates(laptop, phone);
    expect(m.sent.map((s) => [s.text, !!s.pending, s.corrected])).toEqual([
      ["I endure.", false, "I endure it."],
      ["I praise you.", true, undefined],
    ]);
    // даже если проверенная — в более старой копии
    const checkedOld = mergeStates(state({ upd: 1, sent: [{ ...sent("t", "x"), ok: true }] }), state({ upd: 9, sent: [sent("t", "x", true)] }));
    expect(checkedOld.sent).toEqual([{ ...sent("t", "x"), ok: true }]);
  });

  it("upd — наибольший; порядок не важен; повторное слияние ничего не меняет", () => {
    const m = mergeStates(laptop, phone);
    expect(m.upd).toBe(200);
    expect(sameState(mergeStates(phone, laptop), m)).toBe(true);
    expect(sameState(mergeStates(m, laptop), m)).toBe(true);
    expect(sameState(mergeStates(m, phone), m)).toBe(true);
    expect(sameState(mergeStates(m, m), m)).toBe(true);
  });

  it("одинаковые по содержанию копии равны, как бы ни были упорядочены ключи", () => {
    const x = state({ srs: { a: w(1), b: w(2) } });
    const y = state({ srs: { b: w(2), a: w(1) } });
    expect(sameState(x, y)).toBe(true);
    expect(sameState(x, state({ srs: { a: w(1), b: w(3) } }))).toBe(false);
  });
});

describe("сброс прогресса (reset): кэш устройства до сброса не возвращает сброшенное", () => {
  const r = { score: 1, total: 1, mins: 1, newN: 1, at: "2026-11-20T09:00:00.000Z" };
  const before = {
    ...changeSetting(emptyState(), "voice", "bf_emma", 1000),
    upd: 9000, // устройство занималось «позже» сервера по часам — всё равно проигрывает сбросу
    srs: { a: { lvl: 2, due: "2026-11-22", intro: "2026-11-20", right: 3, wrong: 0 } },
    days: { "2026-11-20": { morning: r } },
    sent: [{ at: "2026-11-20T10:00:00.000Z", words: ["a"], text: "An a." }],
  };
  const server = resetProgress({ ...before, upd: 2000 }, 5000);

  it("resetProgress: слова, дни и предложения — пусто, настройки остаются, метки растут", () => {
    expect(server).toMatchObject({ reset: 5000, upd: 5000, srs: {}, days: {}, sent: [] });
    expect(server.settings.voice).toBe("bf_emma");
    expect(resetProgress(server, 10).reset).toBe(5001); // часы ушли назад — метка всё равно больше
  });

  it("слияние со старым кэшем: прогресс — с сервера (пустой), настройки — по пунктам, порядок не важен", () => {
    const phone = changeSetting(before, "theme", "dark", 7000);
    const m = mergeStates(phone, server);
    expect(m).toEqual(mergeStates(server, phone));
    expect(m).toMatchObject({ reset: 5000, upd: 9000, srs: {}, days: {}, sent: [] });
    expect(m.settings).toMatchObject({ voice: "bf_emma", theme: "dark" });
    expect(mergeStates(m, phone)).toEqual(m); // повторно — то же
  });

  it("после сброса новое занятие сливается как обычно", () => {
    const after = { ...server, upd: 6000, srs: { b: { lvl: 1, due: "2026-11-23", intro: "2026-11-22", right: 1, wrong: 0 } } };
    expect(mergeStates(after, server).srs).toEqual(after.srs);
    expect(mergeStates(after, before).srs).toEqual(after.srs);
  });

  it("parseState: метка сброса читается, старые данные без неё — 0", () => {
    expect(parseState({ srs: {}, reset: 77 }).reset).toBe(77);
    expect(parseState({ srs: {} }).reset).toBe(0);
  });
});

describe("незаконченная часть урока (run) в прогрессе", () => {
  const run = (i: number, date = "2026-11-20"): SavedRun => ({
    kind: "morning",
    day: date,
    date,
    seed: 42,
    steps: [
      { k: 0, t: "section", pic: "🏒", title: "Новые слова", sub: "" },
      { k: 1, t: "pick", w: "praise" },
      { k: 2, t: "build-listen", en: "I praise you.", ru: "Я хвалю тебя." },
    ],
    i,
    graded: 1,
    right: 1,
    revGraded: 0,
    revRight: 0,
    first: [1],
    newIds: [],
    written: {},
    t0: 1,
  });

  it("слияние: побеждает копия, где часть менялась позже — даже если её upd старше; порядок не важен", () => {
    const phone = state({ upd: 100, run: run(2), runAt: 3000 });
    const laptop = state({ upd: 900, run: run(1), runAt: 2000 });
    const m = mergeStates(phone, laptop);
    expect(m.run!.i).toBe(2);
    expect(m.runAt).toBe(3000);
    expect(mergeStates(laptop, phone)).toEqual(m);
    expect(mergeStates(m, laptop)).toEqual(m); // повторно — то же
  });

  it("слияние: часть закончена (null с более поздней меткой) — старое сохранённое не возвращается", () => {
    const done = state({ upd: 100, run: null, runAt: 4000 });
    const stale = state({ upd: 900, run: run(2), runAt: 3000 });
    expect(mergeStates(done, stale).run).toBeNull();
    expect(mergeStates(stale, done).run).toBeNull();
    // а копия без незаконченной части и без метки (старая версия приложения) сохранённое не стирает
    expect(mergeStates(state({ upd: 999 }), stale).run).toEqual(stale.run);
  });

  it("сброс прогресса убирает незаконченную часть; кэш до сброса её не возвращает", () => {
    const before = state({ upd: 100, run: run(2), runAt: 3000 });
    const server = resetProgress(before, 5000);
    expect(server.run).toBeNull();
    expect(mergeStates(before, server).run).toBeNull();
    expect(mergeStates(server, before).run).toBeNull();
  });

  it("parseState: часть читается; старые данные без неё — null и 0; обрезанная или с незнакомым шагом — null", () => {
    const s = parseState(JSON.stringify(state({ run: run(2), runAt: 3000 })));
    expect(s.run).toEqual(run(2));
    expect(s.runAt).toBe(3000);
    expect(parseState({ srs: {} })).toMatchObject({ run: null, runAt: 0 });
    expect(parseState({ srs: {}, run: { ...run(1), steps: [] } }).run).toBeNull();
    expect(parseState({ srs: {}, run: { ...run(1), kind: "drill" } }).run).toBeNull();
    expect(parseState({ srs: {}, run: { ...run(1), date: "вчера" } }).run).toBeNull();
    expect(parseState({ srs: {}, run: { ...run(1), steps: [{ k: 0, t: "say", w: "praise" }] } }).run).toBeNull();
    // место дальше конца — не дальше конца (restoreSession откроет последний шаг)
    expect(parseState({ srs: {}, run: { ...run(1), i: 99 } }).run!.i).toBe(3);
  });
});

describe("mergeStates: дни, которые решает сервер", () => {
  const r = (at: string, srv?: number) => ({ score: 1, total: 1, mins: 1, newN: 1, at, ...(srv !== undefined && { srv }) });
  const s = (upd: number, days: Record<string, object>, p = {}) => ({ ...emptyState(), upd, days, ...p }) as ReturnType<typeof emptyState>;

  it("одно и то же занятие под разными днями — одно, там, куда положил сервер; порядок не важен", () => {
    const local = s(50, { "2026-11-24": { morning: r("2026-11-24T08:55:00Z"), reread: true } });
    const remote = s(10, { "2026-11-21": { morning: r("2026-11-24T08:55:00Z", 1795251600000) } });
    for (const m of [mergeStates(local, remote), mergeStates(remote, local)]) {
      expect(Object.keys(m.days)).toEqual(["2026-11-21", "2026-11-24"]);
      expect(m.days["2026-11-21"].morning?.srv).toBe(1795251600000);
      expect(m.days["2026-11-24"]).toEqual({ reread: true }); // занятие уехало, «перечитал» осталось
    }
    expect(sameState(mergeStates(local, remote), mergeStates(remote, local))).toBe(true);
  });

  it("опустевший день пропадает", () => {
    const m = mergeStates(s(50, { "2026-11-24": { morning: r("a") } }), s(10, { "2026-11-21": { morning: r("a", 5) } }));
    expect(Object.keys(m.days)).toEqual(["2026-11-21"]);
  });

  it("в одном дне подтверждённое сервером побеждает неподтверждённое, даже более позднее", () => {
    const m = mergeStates(s(50, { d: { evening: r("2026-11-21T20:00:00Z") } }), s(10, { d: { evening: r("2026-11-21T10:00:00Z", 7) } }));
    expect(m.days.d.evening?.srv).toBe(7);
  });

  it("часовой пояс — из копии, где сервер поставил его позже", () => {
    const m = mergeStates(s(50, {}, { tz: "Europe/Moscow", tzAt: 5 }), s(10, {}, { tz: "Asia/Tokyo", tzAt: 9 }));
    expect(m).toMatchObject({ tz: "Asia/Tokyo", tzAt: 9 });
  });

  it("parseState: пояс — только IANA, метка srv — только число", () => {
    const p = parseState({ srs: {}, tz: "Mars/Olympus", tzAt: 5, days: { d1: {}, "2026-11-21": { morning: { ...r("a"), srv: "x" }, evening: r("b", 3) } } });
    expect(p).toMatchObject({ tz: "", tzAt: 0 });
    expect(p.days["2026-11-21"].morning).not.toHaveProperty("srv");
    expect(p.days["2026-11-21"].evening?.srv).toBe(3);
  });
});

describe("withPersonal", () => {
  it("берёт настройки и пояс из другой копии, прогресс оставляет свой", () => {
    const mine = { ...emptyState(), upd: 5, srs: { sacred: { lvl: 2, due: "2026-11-22", intro: "2026-11-20", right: 1, wrong: 0 } } };
    const other = { ...changeSetting(emptyState(), "voice", "bf_emma", 9), tz: "Europe/Berlin", tzAt: 7, upd: 9 };
    const r = withPersonal(mine, other);
    expect(r.settings.voice).toBe("bf_emma");
    expect(r.settingsAt.voice).toBe(9);
    expect([r.tz, r.tzAt]).toEqual(["Europe/Berlin", 7]);
    expect(r.srs).toBe(mine.srs);
    expect(r.upd).toBe(5);
  });
});
