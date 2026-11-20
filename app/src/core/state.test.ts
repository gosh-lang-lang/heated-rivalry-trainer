import { describe, expect, it } from "vitest";
import { exportState, parseState, pickNewer } from "./state";
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
  it("круговой экспорт → импорт", () => {
    const s = parseState(prototypeExport);
    expect(parseState(exportState(s))).toEqual(s);
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
      b = state({ upd: 7 });
    expect(pickNewer(a, b)).toBe(b);
    expect(pickNewer(b, a)).toBe(b);
  });
});
