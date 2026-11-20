import { describe, expect, it } from "vitest";
import { changeSetting, emptyState, mergeStates, parseState } from "./state";
import { state } from "./fixtures";

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
    expect(m.settings).toEqual({ newPerDay: 24, voice: "bf_emma" });
    expect(m.settingsAt).toEqual({ newPerDay: 3000, voice: 3000 });
  });

  it("порядок не важен, повторное слияние ничего не меняет", () => {
    expect(mergeStates(phone, laptop)).toEqual(mergeStates(laptop, phone));
    const m = mergeStates(laptop, phone);
    expect(mergeStates(m, phone)).toEqual(m);
    expect(mergeStates(m, laptop)).toEqual(m);
    const tie = { ...phone, upd: laptop.upd };
    expect(mergeStates(tie, laptop)).toEqual(mergeStates(laptop, tie));
  });

  it("изменение пункта: новое значение и метка, даже если часы ушли назад", () => {
    const s = changeSetting(changeSetting(emptyState(), "voice", "bf_emma", 5000), "voice", "am_adam", 4000);
    expect(s.settings.voice).toBe("am_adam");
    expect(s.settingsAt.voice).toBe(5001);
    expect(s.settingsAt.newPerDay).toBe(0);
  });

  it("старые копии без меток и голоса читаются: голос по умолчанию, метки — 0; неизвестный голос отбрасывается", () => {
    const s = parseState({ upd: 1, settings: { newPerDay: 18 }, srs: {} });
    expect(s.settings).toEqual({ newPerDay: 18, voice: "af_heart" });
    expect(s.settingsAt).toEqual({ newPerDay: 0, voice: 0 });
    expect(parseState({ srs: {}, settings: { voice: "robot" } }).settings.voice).toBe("af_heart");
    expect(parseState({ srs: {}, settings: { voice: "bm_george" }, settingsAt: { voice: 7 } })).toMatchObject({ settings: { voice: "bm_george" }, settingsAt: { voice: 7 } });
  });
});
