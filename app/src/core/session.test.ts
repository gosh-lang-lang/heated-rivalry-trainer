import { describe, expect, it } from "vitest";
import {
  advance,
  bumpWrong,
  clearRun,
  finishSession,
  gradeCurrent,
  introduceCurrent,
  markSeen,
  restoreSession,
  resumable,
  runPosition,
  saveRun,
  startSession,
  stepSeed,
  studiedIds,
} from "./session";
import { blankState } from "./srs";
import { state, TODAY } from "./fixtures";
import type { Step } from "./types";

const steps: Step[] = [
  { k: 0, t: "intro", w: "praise" },
  { k: 1, t: "pick", w: "praise" },
  { k: 2, t: "type", w: "praise", hint: true },
  { k: 3, t: "speak", w: "praise" },
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

  it("speak не повторяется после ошибки", () => {
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

describe("studiedIds", () => {
  it("знакомые по прогрессу и все слова занятия (w и ws)", () => {
    const st = state({ srs: { novel: blankState() } });
    const ids = studiedIds(st, [
      { k: 0, t: "section", pic: "", title: "", sub: "" },
      { k: 1, t: "listen", w: "praise" },
      { k: 2, t: "pairs", ws: ["sacred", "mix"] },
    ]);
    expect([...ids].sort()).toEqual(["mix", "novel", "praise", "sacred"]);
  });
});

describe("незаконченная часть урока: сохранить, продолжить, начать заново", () => {
  const plan: Step[] = [
    { k: 0, t: "section", pic: "🏒", title: "Новые слова", sub: "" },
    { k: 1, t: "intro", w: "praise" },
    { k: 2, t: "pick", w: "praise" },
    { k: 3, t: "build-listen", en: "I praise my team.", ru: "Я хвалю свою команду.", w: "praise" },
    { k: 4, t: "type", w: "praise", hint: true },
  ];
  const o = { day: TODAY, date: TODAY, seed: 777 };
  /** Пройти: «Поехали», знакомство, ответить на «Выбери перевод» (ok) — и выйти, не нажав «Дальше». */
  const partway = (ok = true) => {
    let s = advance(startSession("morning", plan, 1000)!);
    let st = state();
    ({ sess: s, state: st } = introduceCurrent(s, st, TODAY));
    s = advance(s);
    ({ sess: s, state: st } = gradeCurrent(s, st, ok, "praise", TODAY));
    return { s, st: saveRun(st, s, { ...o, at: s.i + 1 }, 5000) };
  };

  it("сохраняется всё для продолжения: шаги, место, счёт, засчитанные шаги, зерно; метка растёт", () => {
    const { st } = partway();
    expect(st.run).toMatchObject({ kind: "morning", day: TODAY, date: TODAY, seed: 777, i: 3, graded: 1, right: 1, first: [2], newIds: ["praise"], t0: 1000 });
    expect(st.run!.steps).toHaveLength(5);
    expect(st.runAt).toBe(5000);
    // часы ушли назад — метка всё равно растёт
    expect(saveRun(st, restoreSession(st.run!), o, 10).runAt).toBe(5001);
  });

  it("продолжить — с того же задания, счёт и прогресс не теряются", () => {
    const { st } = partway();
    const r = resumable(st, "morning", TODAY, TODAY)!;
    expect(runPosition(r)).toEqual({ n: 4, of: 5 });
    const s = restoreSession(r);
    expect(s.steps[s.i]).toMatchObject({ t: "build-listen" });
    expect([s.graded, s.right, s.first, s.newIds, s.t0]).toEqual([1, 1, [2], ["praise"], 1000]);
  });

  it("перерыв между уходом и «Продолжить» не идёт в минуты занятия", () => {
    const { st } = partway(); // начали в 1000, сохранили в 5000 (4 с занятия)
    const back = 5000 + 11 * 3600_000; // вернулись через 11 часов
    const s = restoreSession(st.run!, false, st.runAt, back);
    expect(s.t0).toBe(back - 4000);
    const fin = finishSession(s, st, TODAY, new Date(back + 5 * 60_000));
    expect(fin.result.mins).toBe(5);
  });

  it("ответ на последний шаг сохранён, «Дальше» не нажат — откроется последний шаг (не пустое занятие)", () => {
    const st = saveRun(state(), { ...startSession("morning", plan, 0)!, i: 4, first: [4] }, { ...o, at: 5 });
    const s = restoreSession(resumable(st, "morning", TODAY, TODAY)!);
    expect(s.i).toBe(4);
  });

  it("«Начать заново»: те же шаги с первого, без повторов после ошибок; ответы второй раз не засчитываются", () => {
    const { st } = partway(false); // ошибка — повтор «Выбери перевод» добавлен в конец
    expect(st.run!.steps).toHaveLength(6);
    const srsBefore = st.srs.praise;
    let s = restoreSession(resumable(st, "morning", TODAY, TODAY)!, true);
    expect(s.i).toBe(0);
    expect(s.steps).toHaveLength(5);
    expect(s.steps.some((x) => x.retry)).toBe(false);
    // заново: знакомство и тот же «Выбери перевод», теперь верно
    let st2 = st;
    s = advance(s);
    ({ sess: s, state: st2 } = introduceCurrent(s, st2, TODAY));
    s = advance(s);
    ({ sess: s, state: st2 } = gradeCurrent(s, st2, true, "praise", TODAY));
    expect(st2.srs.praise).toEqual(srsBefore); // ни уровень, ни счётчики ответов не изменились
    expect([s.graded, s.right]).toEqual([1, 0]); // счёт — по первой попытке до «заново»
    expect(s.newIds).toEqual(["praise"]);
    // ошибка при втором проходе снова вернёт шаг в конец — но не засчитается
    const w = gradeCurrent(s, st2, false, "praise", TODAY);
    expect(w.state.srs.praise).toEqual(srsBefore);
  });

  it("устаревание: начатая вчера часть не продолжается; другой вид, день урока или уже пройдена — тоже нет", () => {
    const { st } = partway();
    expect(resumable(st, "morning", TODAY, TODAY)).not.toBeNull();
    expect(resumable(st, "morning", "2026-11-21", "2026-11-21")).toBeNull(); // новый день — заново
    expect(resumable({ ...st, run: { ...st.run!, date: "2026-11-19" } }, "morning", TODAY, TODAY)).toBeNull();
    expect(resumable(st, "evening", TODAY, TODAY)).toBeNull();
    expect(resumable(st, "morning", "2026-11-19", TODAY)).toBeNull();
    const done = { ...st, days: { [TODAY]: { morning: { score: 1, total: 1, mins: 1, newN: 1, at: "" } } } };
    expect(resumable(done, "morning", TODAY, TODAY)).toBeNull();
  });

  it("часть 2, перенесённая со вчера: день урока — вчера, начата сегодня — продолжается сегодня", () => {
    const ev = startSession("evening", [{ k: 0, t: "type", w: "praise", hint: false, eve: true }], 0)!;
    const st = saveRun(state(), ev, { day: "2026-11-19", date: TODAY, seed: 1 });
    expect(resumable(st, "evening", "2026-11-19", TODAY)).not.toBeNull();
    expect(resumable(st, "evening", TODAY, TODAY)).toBeNull();
  });

  it("тренировка и «ещё 6 новых» не сохраняются; конец занятия убирает сохранённое", () => {
    const st = state();
    expect(saveRun(st, startSession("drill", plan, 0)!, o)).toBe(st);
    expect(saveRun(st, startSession("extra", plan, 0)!, o)).toBe(st);
    const { st: saved } = partway();
    const cleared = clearRun(saved, 9000);
    expect(cleared.run).toBeNull();
    expect(cleared.runAt).toBe(9000);
    expect(clearRun(cleared)).toBe(cleared);
  });

  it("зерно шага: то же для того же шага, другое — для другого шага и для повтора", () => {
    expect(stepSeed(5, { k: 3 })).toBe(stepSeed(5, { k: 3 }));
    expect(stepSeed(5, { k: 3 })).not.toBe(stepSeed(5, { k: 4 }));
    expect(stepSeed(5, { k: 3 })).not.toBe(stepSeed(5, { k: 3, retry: true }));
    expect(stepSeed(5, { k: 3 })).not.toBe(stepSeed(6, { k: 3 }));
  });
});
