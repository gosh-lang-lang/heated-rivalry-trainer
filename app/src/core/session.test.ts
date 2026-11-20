import { describe, expect, it } from "vitest";
import { advance, bumpWrong, finishSession, gradeCurrent, introduceCurrent, markSeen, startSession } from "./session";
import { blankState } from "./srs";
import { state, TODAY } from "./fixtures";
import type { Step } from "./types";

const steps: Step[] = [
  { k: 0, t: "intro", w: "praise" },
  { k: 1, t: "pick", w: "praise" },
  { k: 2, t: "type", w: "praise", hint: true },
  { k: 3, t: "write", ws: ["praise"], n: 0 },
];

describe("движок занятия", () => {
  it("знакомство ставит lvl=1 и считает новое слово один раз", () => {
    let s = startSession("morning", steps, 0)!;
    let st = state();
    ({ sess: s, state: st } = introduceCurrent(s, st, TODAY));
    ({ sess: s, state: st } = introduceCurrent(s, st, TODAY));
    expect(s.newIds).toEqual(["praise"]);
    expect(st.srs.praise).toMatchObject({ lvl: 1, intro: TODAY, due: "2026-11-21" });
  });

  it("ошибка возвращает шаг в конец; счёт — по первой попытке", () => {
    let s = advance(startSession("morning", steps, 0)!);
    let st = state({ srs: { praise: { ...blankState(), lvl: 1, intro: TODAY } } });
    ({ sess: s, state: st } = gradeCurrent(s, st, false, "praise", TODAY));
    expect(s.steps.length).toBe(5);
    expect(s.steps[4]).toMatchObject({ t: "pick", k: 1, retry: true });
    expect([s.graded, s.right]).toEqual([1, 0]);
    expect(st.srs.praise.wrong).toBe(1);

    s = { ...s, i: 4 };
    ({ sess: s, state: st } = gradeCurrent(s, st, true, "praise", TODAY));
    expect([s.graded, s.right]).toEqual([1, 0]);
    expect(st.srs.praise.right).toBe(0);
    expect(s.steps.length).toBe(5);
  });

  it("повтор после второй ошибки не добавляется", () => {
    let s = { ...startSession("morning", steps, 0)!, i: 1 };
    let st = state();
    ({ sess: s, state: st } = gradeCurrent(s, st, false, "praise", TODAY));
    s = { ...s, i: s.steps.length - 1 };
    ({ sess: s } = gradeCurrent(s, st, false, "praise", TODAY));
    expect(s.steps.length).toBe(5);
  });

  it("write и speak не повторяются после ошибки", () => {
    const s = { ...startSession("evening", steps, 0)!, i: 3 };
    expect(gradeCurrent(s, state(), false, null, TODAY).sess.steps.length).toBe(4);
  });

  it("markSeen не влияет на счёт", () => {
    const s = markSeen({ ...startSession("evening", steps, 0)!, i: 3 });
    expect([s.graded, s.right, s.first]).toEqual([0, 0, [3]]);
  });

  it("ошибка в парах — минус обоим словам", () => {
    const st = bumpWrong(state({ srs: { praise: blankState(), novel: blankState() } }), ["praise", "novel"]);
    expect([st.srs.praise.wrong, st.srs.novel.wrong]).toEqual([1, 1]);
  });

  it("итог: результат дня и сравнение с прошлым разом", () => {
    const prev = { score: 8, total: 10, mins: 12, newN: 6, at: "" };
    const st = state({ days: { "2026-11-18": { morning: prev }, "2026-11-19": { evening: prev } } });
    const s = { ...startSession("morning", steps, Date.parse("2026-11-20T08:00:00Z"))!, graded: 10, right: 9, newIds: ["praise"] };
    const f = finishSession(s, st, TODAY, new Date("2026-11-20T08:14:20Z"));
    expect(f.result).toMatchObject({ score: 9, total: 10, mins: 14, newN: 1 });
    expect(f.prev).toBe(prev);
    expect(f.state.days[TODAY].morning).toBe(f.result);
  });

  it("«ещё 6» копятся списком", () => {
    let st = state();
    const s = startSession("extra", steps, 0)!;
    st = finishSession(s, st, TODAY, new Date(60000)).state;
    st = finishSession(s, st, TODAY, new Date(60000)).state;
    expect(st.days[TODAY].extra?.length).toBe(2);
  });
});
