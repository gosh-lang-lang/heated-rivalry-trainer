import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { carriedDay, hhmm, LATE_HOUR, lessonNo, lessonStatus, PART2_GAP_MIN, part2Advice, resumeLabel, untilText } from "./lesson";
import { eveningPlan } from "./plans";
import { deck, state, TODAY } from "./fixtures";
import type { AppState, DayLog, SavedRun, SessionResult, Step, WordState } from "./types";

/** Местное время дня `day` (тест не зависит от часового пояса машины). */
const at = (day: string, h: number, m = 0) => {
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m);
};
const res = (when: Date): SessionResult => ({ score: 30, total: 38, mins: 14, newN: 6, at: when.toISOString() });
const YDAY = addDays(TODAY, -1);

/** Слова, выученные в день `day` (часть 1 этого дня пройдена). */
const introOn = (day: string, n: number, from = 0): Record<string, WordState> =>
  Object.fromEntries(deck.words.slice(from, from + n).map((w) => [w.id, { lvl: 1, due: addDays(day, 1), intro: day, right: 1, wrong: 0 }]));

const st = (days: Record<string, DayLog>, srs: AppState["srs"] = {}) => state({ days, srs });

describe("урок из двух частей: пауза перед частью 2", () => {
  it(`константы: пауза ${PART2_GAP_MIN} мин, поздно — с ${LATE_HOUR}:00`, () => {
    expect([PART2_GAP_MIN, LATE_HOUR]).toEqual([90, 22]);
  });

  it("часть 1 закончилась в 17:00 → часть 2 лучше после 18:30, кнопка есть", () => {
    const s = st({ [TODAY]: { morning: res(at(TODAY, 17)) } }, introOn(TODAY, 6));
    const ls = lessonStatus(s, deck, at(TODAY, 17, 5));
    expect(ls.cards.map((c) => c.part)).toEqual([1, 2]);
    const p2 = ls.cards[1];
    expect(p2).toMatchObject({ part: 2, n: 1, day: TODAY, can: true, advice: "wait", carried: false });
    expect(hhmm(p2.after!)).toBe("18:30");
    expect(untilText(at(TODAY, 17, 5), p2.after!)).toBe("через 1 ч 25 мин");
    expect(ls.focus).toBe(2);
  });

  it("18:31 → можно начинать", () => {
    const s = st({ [TODAY]: { morning: res(at(TODAY, 17)) } }, introOn(TODAY, 6));
    expect(lessonStatus(s, deck, at(TODAY, 18, 31)).cards[1].advice).toBe("ready");
    expect(lessonStatus(s, deck, at(TODAY, 18, 30)).cards[1].advice).toBe("ready");
    expect(lessonStatus(s, deck, at(TODAY, 18, 29)).cards[1].advice).toBe("wait");
  });

  it("часть 1 закончилась в 21:30 → пауза кончится после 22:00: поздно, лучше завтра", () => {
    const s = st({ [TODAY]: { morning: res(at(TODAY, 21, 30)) } }, introOn(TODAY, 6));
    const ls = lessonStatus(s, deck, at(TODAY, 21, 35));
    expect(ls.cards[1]).toMatchObject({ advice: "late", can: true });
    // поздняя часть 2 не главная: на сегодня всё
    expect(ls.focus).toBeNull();
  });

  it("часть 1 в 19:00, сейчас 22:10 → поздно", () => {
    const s = st({ [TODAY]: { morning: res(at(TODAY, 19)) } }, introOn(TODAY, 6));
    expect(lessonStatus(s, deck, at(TODAY, 22, 10)).cards[1].advice).toBe("late");
    expect(lessonStatus(s, deck, at(TODAY, 21, 59)).cards[1].advice).toBe("ready");
  });

  it("время конца части 1 неизвестно — без паузы", () => {
    expect(part2Advice(TODAY, { ...res(at(TODAY, 9)), at: "x" }, at(TODAY, 9))).toEqual({ advice: "ready", after: null });
    expect(part2Advice(TODAY, { ...res(at(TODAY, 9)), at: "x" }, at(TODAY, 23)).advice).toBe("late");
  });

  it("часть 1 не пройдена — часть 2 начать нельзя, главная — часть 1", () => {
    const ls = lessonStatus(st({}), deck, at(TODAY, 9));
    expect(ls.cards[0]).toMatchObject({ part: 1, n: 1, can: true, done: null });
    expect(ls.cards[1]).toMatchObject({ part: 2, n: 1, can: false, advice: null });
    expect(ls.focus).toBe(1);
  });

  it("обе части пройдены — на сегодня всё", () => {
    const s = st({ [TODAY]: { morning: res(at(TODAY, 9)), evening: res(at(TODAY, 11)) } }, introOn(TODAY, 6));
    const ls = lessonStatus(s, deck, at(TODAY, 12));
    expect(ls.cards.map((c) => !!c.done)).toEqual([true, true]);
    expect(ls.cards[1].advice).toBeNull();
    expect(ls.focus).toBeNull();
  });
});

describe("урок из двух частей: перенос части 2 на следующий день", () => {
  const yday = (evening?: SessionResult) =>
    st({ [YDAY]: { morning: res(at(YDAY, 21, 30)), ...(evening ? { evening } : {}) } }, introOn(YDAY, 6));

  it("вчера часть 2 не успели → сегодня сначала часть 2 вчерашнего урока, потом часть 1 следующего", () => {
    const ls = lessonStatus(yday(), deck, at(TODAY, 8));
    expect(ls.carry).toBe(YDAY);
    expect(ls.cards[0]).toMatchObject({ part: 2, n: 1, day: YDAY, carried: true, can: true, advice: "ready" });
    expect(ls.cards[1]).toMatchObject({ part: 1, n: 2, day: TODAY, secondary: true, can: true });
    expect(ls.focus).toBe(2);
  });

  it("перенесённую часть 2 прошли сегодня → её карточка готова, часть 1 главная", () => {
    const ls = lessonStatus(yday(res(at(TODAY, 8, 20))), deck, at(TODAY, 9));
    expect(ls.carry).toBe(YDAY);
    expect(ls.cards[0].done).not.toBeNull();
    expect(ls.cards[1]).toMatchObject({ part: 1, n: 2, secondary: false });
    expect(ls.focus).toBe(1);
  });

  it("часть 2 вчерашнего урока пройдена вчера — переноса нет", () => {
    expect(lessonStatus(yday(res(at(YDAY, 23))), deck, at(TODAY, 9)).carry).toBeNull();
  });

  it("сегодня уже прошли часть 1 — урок новый, перенос заканчивается", () => {
    const s = st({ [YDAY]: { morning: res(at(YDAY, 21)) }, [TODAY]: { morning: res(at(TODAY, 8)) } }, { ...introOn(YDAY, 6), ...introOn(TODAY, 6, 6) });
    const ls = lessonStatus(s, deck, at(TODAY, 9));
    expect(ls.carry).toBeNull();
    expect(ls.cards.map((c) => [c.part, c.n])).toEqual([[1, 2], [2, 2]]);
  });

  it("позавчера — ещё переносим, 3 дня назад — уже нет", () => {
    const d2 = addDays(TODAY, -2),
      d3 = addDays(TODAY, -3);
    expect(carriedDay({ [d2]: { morning: res(at(d2, 10)) } }, TODAY)).toBe(d2);
    expect(carriedDay({ [d3]: { morning: res(at(d3, 10)) } }, TODAY)).toBeNull();
    const ls = lessonStatus(st({ [d3]: { morning: res(at(d3, 10)) } }, introOn(d3, 6)), deck, at(TODAY, 9));
    expect(ls.carry).toBeNull();
    expect(ls.cards[0]).toMatchObject({ part: 1, n: 2, can: true });
    expect(ls.cards[1]).toMatchObject({ part: 2, n: 2, can: false });
  });

  it("переносится только последний урок; более старые непройденные части 2 пропадают", () => {
    const d2 = addDays(TODAY, -2);
    const days = { [d2]: { morning: res(at(d2, 10)) }, [YDAY]: { morning: res(at(YDAY, 10)), evening: res(at(YDAY, 12)) } };
    expect(carriedDay(days, TODAY)).toBeNull();
  });

  it("часть 2 вчерашнего урока поздно вечером сегодня — тоже «поздно»", () => {
    expect(lessonStatus(yday(), deck, at(TODAY, 22, 30)).cards[0].advice).toBe("late");
  });

  it("часть 2 перенесённого урока — слова того дня, повторения — на сегодня", () => {
    // вчерашние слова: срок повторения — сегодня; в части 2 их проверит «впиши», в разминку они не идут
    const s = yday();
    const plan = eveningPlan(deck, s, TODAY, Math.random, YDAY);
    const typed = plan.filter((x) => x.t === "type" && x.eve).map((x) => ("w" in x ? x.w : ""));
    expect(new Set(typed)).toEqual(new Set(deck.words.slice(0, 6).map((w) => w.id)));
    expect(plan.some((x) => "rev" in x && x.rev)).toBe(false);
  });
});

describe("номер урока", () => {
  it("урок N — сколько дней пройдена часть 1 до него, плюс один; пройденный урок сохраняет номер", () => {
    const days: AppState["days"] = {
      "2026-11-10": { morning: res(at("2026-11-10", 9)) },
      "2026-11-12": { evening: res(at("2026-11-12", 9)) }, // только часть 2 — урок не считается
      "2026-11-15": { morning: res(at("2026-11-15", 9)), evening: res(at("2026-11-15", 12)) },
    };
    expect(lessonNo(days, "2026-11-10")).toBe(1);
    expect(lessonNo(days, "2026-11-15")).toBe(2);
    expect(lessonNo(days, TODAY)).toBe(3);
    expect(lessonNo({ ...days, [TODAY]: { morning: res(at(TODAY, 9)) } }, TODAY)).toBe(3);
  });
});

describe("тексты времени", () => {
  it("«через …»", () => {
    const t0 = at(TODAY, 9);
    expect(untilText(t0, at(TODAY, 10, 12))).toBe("через 1 ч 12 мин");
    expect(untilText(t0, at(TODAY, 9, 45))).toBe("через 45 мин");
    expect(untilText(t0, at(TODAY, 11))).toBe("через 2 ч");
    expect(untilText(t0, new Date(t0.getTime() + 20_000))).toBe("через 1 мин");
  });
  it("часы и минуты с нулями", () => expect(hhmm(at(TODAY, 8, 5))).toBe("08:05"));
});

describe("незаконченная часть: «Продолжить · n из N» на главной и в «Пути»", () => {
  const runOf = (kind: "morning" | "evening", day: string, date: string, i = 11, n = 38): SavedRun => ({
    kind,
    day,
    date,
    seed: 1,
    steps: Array.from({ length: n }, (_, k) => ({ k, t: "intro", w: deck.words[0].id }) as Step),
    i,
    graded: 0,
    right: 0,
    revGraded: 0,
    revRight: 0,
    first: [],
    newIds: [],
    written: {},
    t0: 0,
  });

  it("часть 1 начата сегодня — продолжить с 12-го из 38; можно, даже если учить по плану уже нечего", () => {
    const all = Object.fromEntries(deck.words.map((w) => [w.id, { lvl: 3, due: addDays(TODAY, 5), intro: TODAY, right: 1, wrong: 0 }]));
    const s = state({ srs: all, run: runOf("morning", TODAY, TODAY), runAt: 1 });
    const p1 = lessonStatus(s, deck, at(TODAY, 12)).cards[0];
    expect(p1).toMatchObject({ part: 1, can: true, resume: { n: 12, of: 38 } });
    expect(resumeLabel(p1.resume!)).toBe("Продолжить · 12 из 38");
  });

  it("начата вчера — сегодня часть начинается заново", () => {
    const s = state({ run: runOf("morning", YDAY, YDAY), runAt: 1 });
    expect(lessonStatus(s, deck, at(TODAY, 12)).cards[0].resume).toBeNull();
  });

  it("перенесённая часть 2 начата сегодня — продолжить её; часть 1 нового урока — начать", () => {
    const s = state({
      days: { [YDAY]: { morning: res(at(YDAY, 21, 30)) } },
      srs: introOn(YDAY, 6),
      run: runOf("evening", YDAY, TODAY, 3, 20),
      runAt: 1,
    });
    const ls = lessonStatus(s, deck, at(TODAY, 9));
    expect(ls.cards[0]).toMatchObject({ part: 2, carried: true, resume: { n: 4, of: 20 } });
    expect(ls.cards[1]).toMatchObject({ part: 1, resume: null });
  });
});
