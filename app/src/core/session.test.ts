import { describe, expect, it } from "vitest";
import { advance, bumpWrong, finishSession, gradeCurrent, introduceCurrent, markSeen, skipSpeech, startSession } from "./session";
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
    expect([s.revGraded, s.revRight]).toEqual([0, 0]); // шаг блока новых — не повторение
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

  it("«Скажи слово» не повторяется после ошибки и не меняет уровень слова", () => {
    const say: Step[] = [{ k: 0, t: "say", w: "praise" }];
    const st = state({ srs: { praise: { ...blankState(), lvl: 1, intro: TODAY } } });
    const r = gradeCurrent(startSession("morning", say, 0)!, st, false, null, TODAY);
    expect(r.sess.steps).toHaveLength(1);
    expect([r.sess.graded, r.sess.right]).toEqual([1, 0]);
    expect(r.state.srs.praise).toEqual(st.srs.praise);
  });

  it("«Не могу сейчас говорить»: говорение до конца занятия убирается, пройденное — нет", () => {
    const plan: Step[] = [
      { k: 0, t: "say", w: "praise" },
      { k: 1, t: "listen", w: "praise" },
      { k: 2, t: "say", w: "praise" },
      { k: 3, t: "type", w: "praise", hint: true },
      { k: 4, t: "say", w: "praise", ex: true },
      { k: 5, t: "section", pic: "🎙️", title: "Скажи вслух", sub: "", speech: true },
      { k: 6, t: "speak", n: 0, w: "praise" },
      { k: 7, t: "reread", pages: ["1"] },
    ];
    const s = skipSpeech({ ...startSession("morning", plan, 0)!, i: 2 });
    expect(s.i).toBe(2);
    expect(s.steps.map((x) => x.k)).toEqual([0, 1, 3, 7]);
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

  it("часть 2, перенесённая со вчера, записывается в день урока", () => {
    const y = "2026-11-19";
    const st = state({ days: { [y]: { morning: { score: 1, total: 1, mins: 1, newN: 1, at: "" } } } });
    const s = { ...startSession("evening", steps, 0)!, graded: 2, right: 2 };
    const f = finishSession(s, st, y, new Date("2026-11-20T06:00:00Z"));
    expect(f.day).toBe(y);
    expect(f.state.days[y].evening).toMatchObject({ score: 2, total: 2, at: "2026-11-20T06:00:00.000Z" });
    expect(f.state.days[TODAY]).toBeUndefined();
  });

  it("«ещё 6» копятся списком", () => {
    let st = state();
    const s = startSession("extra", steps, 0)!;
    st = finishSession(s, st, TODAY, new Date(60000)).state;
    st = finishSession(s, st, TODAY, new Date(60000)).state;
    expect(st.days[TODAY].extra?.length).toBe(2);
  });

  it("итог: точность только по повторениям — revScore/revTotal", () => {
    const rs: Step[] = [
      { k: 0, t: "pick", w: "praise", rev: true },
      { k: 1, t: "type", w: "novel", hint: false, rev: true },
      { k: 2, t: "pick", w: "sacred" },
    ];
    let s = startSession("morning", rs, 0)!;
    let st = state();
    ({ sess: s, state: st } = gradeCurrent(s, st, true, "praise", TODAY));
    s = advance(s);
    ({ sess: s, state: st } = gradeCurrent(s, st, false, "novel", TODAY));
    s = advance(s);
    ({ sess: s, state: st } = gradeCurrent(s, st, true, "sacred", TODAY));
    const r = finishSession(s, st, TODAY, new Date(60000)).result;
    expect([r.score, r.total, r.revScore, r.revTotal]).toEqual([2, 3, 1, 2]);
  });
});

describe("тренировка «Пройти все слова» (drill)", () => {
  const drill: Step[] = [
    { k: 0, t: "pick", w: "praise", rev: true },
    { k: 1, t: "type", w: "praise", rev: true, hint: true },
  ];
  it("ответы считаются, но уровень и дата повтора не меняются; ошибка — в конец", () => {
    const ws = { ...blankState(), lvl: 2, intro: TODAY, due: "2026-11-25" };
    let s = startSession("drill", drill, 0)!;
    let st = state({ srs: { praise: ws } });
    ({ sess: s, state: st } = gradeCurrent(s, st, true, "praise", TODAY));
    expect(st.srs.praise).toEqual(ws);
    s = advance(s);
    ({ sess: s, state: st } = gradeCurrent(s, st, false, "praise", TODAY));
    expect(st.srs.praise).toEqual(ws);
    expect([s.graded, s.right, s.steps.length]).toEqual([2, 1, 3]);
  });

  it("итог не пишется в дни: серия, статистика и уроки не меняются", () => {
    const st = state();
    const fin = finishSession(advance(advance(startSession("drill", drill, 0)!)), st, TODAY, new Date(60000));
    expect(fin.state).toBe(st);
    expect(fin.prev).toBeNull();
    expect(fin.kind).toBe("drill");
  });
});
