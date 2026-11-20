import { describe, expect, it } from "vitest";
import { changeSetting, emptyState, mergeStates, parseState, sameState } from "./state";
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
    expect(m.settings).toEqual({ newPerDay: 24, voice: "bf_emma", look: "ice", theme: "system" });
    expect(m.settingsAt).toEqual({ newPerDay: 3000, voice: 3000, look: 0, theme: 0 });
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
    expect(parseState({ srs: {}, settings: { look: "neon", theme: "sepia" } }).settings).toMatchObject({ look: "ice", theme: "system" });
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
    expect(s.settings).toEqual({ newPerDay: 18, voice: "af_heart", look: "ice", theme: "system" });
    expect(s.settingsAt).toEqual({ newPerDay: 0, voice: 0, look: 0, theme: 0 });
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
