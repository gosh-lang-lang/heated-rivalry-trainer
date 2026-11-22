import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { deck, state, TODAY } from "./fixtures";
import type { DayLog, WordState } from "./types";
import { dayMonth, dueText, groupKey, groupTitle, hardWords, knownCount, weekdayDay, wordLessons } from "./vocab";

const D = (i: number) => addDays(TODAY, i);
const part1: DayLog = { morning: { score: 30, total: 40, mins: 15, newN: 6, at: "x" } };
const intro = (day: string, from: number, n: number): Record<string, WordState> =>
  Object.fromEntries(deck.words.slice(from, from + n).map((w) => [w.id, { lvl: 1, due: addDays(day, 1), intro: day, right: 1, wrong: 0 }]));

describe("словарь по урокам", () => {
  it("слово — в уроке дня знакомства; уроки от нового к старому, «Впереди» — последней", () => {
    const s = state({ days: { [D(-2)]: part1, [D(-1)]: part1, [D(0)]: part1 }, srs: { ...intro(D(-2), 0, 3), ...intro(D(0), 3, 2) } });
    const g = wordLessons(s, deck);
    expect(g.map((x) => [x.no, x.day, x.words.length])).toEqual([
      [3, D(0), 2],
      [2, D(-1), 0],
      [1, D(-2), 3],
      [null, null, deck.words.length - 5],
    ]);
    expect(g[2].words.map((w) => w.id)).toEqual(deck.words.slice(0, 3).map((w) => w.id));
    expect(g.map(groupKey)).toEqual([3, 2, 1, "ahead"]);
    expect(g.map(groupTitle)).toEqual(["Урок 3", "Урок 2", "Урок 1", "Впереди"]);
  });

  it("все слова начаты — группы «Впереди» нет; ничего не начато — только она", () => {
    const all = Object.assign({}, ...deck.words.map((_, i) => intro(D(0), i, 1)));
    expect(wordLessons(state({ days: { [D(0)]: part1 }, srs: all }), deck).map((x) => x.no)).toEqual([1]);
    expect(wordLessons(state(), deck).map((x) => x.no)).toEqual([null]);
  });

  it("слово, у которого есть уровень, но нет дня знакомства, — «Впереди»", () => {
    const w = deck.words[0];
    const g = wordLessons(state({ srs: { [w.id]: { lvl: 0, due: "", intro: "", right: 0, wrong: 0 } } }), deck);
    expect(g).toHaveLength(1);
    expect(g[0].words[0].id).toBe(w.id);
  });
});

describe("знакомые и трудные", () => {
  it("знакомо — уровень 3 и выше", () => {
    const [a, b, c] = deck.words;
    const srs = { [a.id]: { lvl: 2, due: "", intro: D(0), right: 0, wrong: 0 }, [b.id]: { lvl: 3, due: "", intro: D(0), right: 0, wrong: 0 }, [c.id]: { lvl: 6, due: "", intro: D(0), right: 0, wrong: 0 } };
    expect(knownCount([a, b, c], srs)).toBe(2);
    expect(knownCount(deck.words, {})).toBe(0);
  });

  it("трудные — 4+ ошибок, больше ошибок — выше", () => {
    const [a, b, c] = deck.words;
    const st = (wrong: number): WordState => ({ lvl: 1, due: "", intro: D(0), right: 0, wrong });
    const s = state({ srs: { [a.id]: st(4), [b.id]: st(3), [c.id]: st(7) } });
    expect(hardWords(s, deck).map((w) => w.id)).toEqual([c.id, a.id]);
  });
});

describe("даты словаря", () => {
  it("повтор: не начато, сегодня (и просрочено), завтра, дата", () => {
    expect(dueText(undefined, "2026-11-20")).toBe("—");
    expect(dueText("", "2026-11-20")).toBe("—");
    expect(dueText("2026-11-18", "2026-11-20")).toBe("сегодня");
    expect(dueText("2026-11-20", "2026-11-20")).toBe("сегодня");
    expect(dueText("2026-11-21", "2026-11-20")).toBe("завтра");
    expect(dueText("2026-11-26", "2026-11-20")).toBe("26 ноября");
    expect(dueText("2027-01-03", "2026-12-30")).toBe("3 января 2027");
  });

  it("день недели и дата урока", () => {
    expect(weekdayDay("2026-11-24", "2026-11-24")).toBe("вт, 24 ноября");
    expect(dayMonth("2026-12-01", "2026-11-20")).toBe("1 декабря");
  });
});
