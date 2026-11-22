import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { cardForDay, cardSubject, currentSeason, earnedCards, inSeason, isGold, SEASON, SEASON1, seasonOf, seasonView } from "./cards";
import { mergeStates } from "./state";
import { deck, state, TODAY } from "./fixtures";
import type { DayLog, SessionResult, WordState } from "./types";

const at = (day: string, h: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, h).toISOString();
};
const r = (day: string, h: number, score = 30, total = 40, mins = 15): SessionResult => ({ score, total, mins, newN: 6, at: at(day, h) });
/** Урок дня day: часть 1 в 9:00, часть 2 (если есть) в 19:00 того же дня или в другой день. */
const lesson = (day: string, part2: string | null = day): DayLog => ({ morning: r(day, 9), ...(part2 ? { evening: r(part2, part2 === day ? 19 : 8, 10, 10, 12) } : {}) });
const D = (i: number) => addDays(TODAY, i);
const introOn = (day: string, from: number, n: number): Record<string, WordState> =>
  Object.fromEntries(deck.words.slice(from, from + n).map((w) => [w.id, { lvl: 1, due: addDays(day, 1), intro: day, right: 1, wrong: 0 }]));

describe("карточки-награды", () => {
  it("карточка N — N-й пройденный урок, по дням урока", () => {
    const s = state({ days: { [D(0)]: lesson(D(0)), [D(1)]: lesson(D(1)), [D(2)]: lesson(D(2)) } });
    const cards = earnedCards(s, deck);
    expect(cards.map((c) => [c.no, c.day, c.lesson])).toEqual([
      [1, D(0), 1],
      [2, D(1), 2],
      [3, D(2), 3],
    ]);
    expect(cards[0]).toMatchObject({ name: "Шейн Холландер", cat: "Герой", season: 1, pos: 1, gold: false, got: D(0) });
    expect(cards[1].name).toBe("Илья Розанов");
  });

  it("точность и минуты — за обе части, слова — выученные в день урока", () => {
    const s = state({ days: { [D(0)]: lesson(D(0)) }, srs: { ...introOn(D(0), 0, 6), ...introOn(D(-1), 6, 3) } });
    const [c] = earnedCards(s, deck);
    expect(c.pct).toBe(80); // (30 + 10) / (40 + 10)
    expect(c.mins).toBe(27);
    expect(c.words).toEqual(deck.words.slice(0, 6).map((w) => w.id));
  });

  it("урок без части 2 карточки не даёт, но номер урока занимает", () => {
    const s = state({ days: { [D(0)]: lesson(D(0), null), [D(3)]: lesson(D(3)) } });
    const cards = earnedCards(s, deck);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ no: 1, day: D(3), lesson: 2 });
    expect(cardForDay(cards, D(0))).toBeNull();
  });

  it("перенесённая часть 2 (итог в дне урока, сделана назавтра) завершает урок позже", () => {
    const before = state({ days: { [D(0)]: lesson(D(0), null) } });
    expect(earnedCards(before, deck)).toHaveLength(0);
    // назавтра сделали перенесённую часть 2: итог пишется в день урока, at — сейчас
    const after = state({ days: { [D(0)]: lesson(D(0), D(1)) } });
    const [c] = earnedCards(after, deck);
    expect(c).toMatchObject({ no: 1, day: D(0), lesson: 1, got: D(1) });
  });

  it("часть 2 без части 1 (чужие данные) — не урок", () => {
    const s = state({ days: { [D(0)]: { evening: r(D(0), 19) } } });
    expect(earnedCards(s, deck)).toEqual([]);
  });

  it("сезон — 10 карточек, 10-я золотая «Финал сезона», 11-я — сезон 2", () => {
    const days = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [D(i), lesson(D(i))]));
    const cards = earnedCards(state({ days }), deck);
    expect(cards).toHaveLength(12);
    expect(cards[9]).toMatchObject({ no: 10, season: 1, pos: 10, gold: true, name: "Финал сезона", cat: "Финал" });
    expect(cards[10]).toMatchObject({ no: 11, season: 2, pos: 1, gold: false });
    expect(cards.filter((c) => c.gold)).toHaveLength(1);
    expect(currentSeason(days, D(12))).toBe(2);
    expect(currentSeason(Object.fromEntries(Object.entries(days).slice(0, 9)), D(9))).toBe(1);
    expect(currentSeason(Object.fromEntries(Object.entries(days).slice(0, 10)), D(10))).toBe(2);
  });

  it("номера: сезон, место в сезоне, золото", () => {
    expect([seasonOf(1), seasonOf(10), seasonOf(11), seasonOf(20), seasonOf(21)]).toEqual([1, 1, 2, 2, 3]);
    expect([inSeason(1), inSeason(10), inSeason(11), inSeason(20)]).toEqual([1, 10, 1, 10]);
    expect([isGold(10), isGold(20), isGold(9), isGold(11)]).toEqual([true, true, false, false]);
  });

  it("сюжеты: 10 на сезон 1, дальше — общие, финал каждого сезона золотой", () => {
    expect(SEASON1).toHaveLength(SEASON);
    expect(SEASON1.slice(0, 4).map((c) => c.name)).toEqual(["Шейн Холландер", "Илья Розанов", "Раздевалка", "«Вояжёры»"]);
    expect(cardSubject(10)).toMatchObject({ cat: "Финал", name: "Финал сезона", art: "cup" });
    expect(cardSubject(12)).toMatchObject({ name: "Сезон 2 · карточка №02" });
    expect(cardSubject(20)).toMatchObject({ cat: "Финал", name: "Финал сезона 2" });
    expect(cardSubject(37).cat).not.toBe("Финал");
  });

  it("карточки выводятся из прогресса — слияние копий с двух устройств даёт обе", () => {
    const a = state({ upd: 1, days: { [D(0)]: lesson(D(0), null) } });
    const b = state({ upd: 2, days: { [D(0)]: { evening: r(D(0), 19, 10, 10, 12) } } });
    expect(earnedCards(mergeStates(a, b), deck)).toHaveLength(1);
  });
});

describe("сезон на пути", () => {
  it("урок сегодня не начат — следующая карточка за него", () => {
    const s = state({ days: { [D(-2)]: lesson(D(-2)), [D(-1)]: lesson(D(-1)) } });
    expect(seasonView(s, deck, TODAY)).toMatchObject({ season: 1, next: 3, nextLesson: 3, todayDone: false, day: TODAY });
  });

  it("часть 2 перенесена со вчера — текущий урок вчерашний", () => {
    const s = state({ days: { [D(-1)]: lesson(D(-1), null) } });
    expect(seasonView(s, deck, TODAY)).toMatchObject({ next: 1, nextLesson: 1, day: D(-1), todayDone: false });
  });

  it("перенесённую часть 2 сделали сегодня — текущий урок сегодняшний", () => {
    const s = state({ days: { [D(-1)]: lesson(D(-1), TODAY) } });
    expect(seasonView(s, deck, TODAY)).toMatchObject({ next: 2, nextLesson: 2, day: TODAY, todayDone: false });
  });

  it("сегодня урок пройден — следующий завтра; после 10-й карточки — сезон 2", () => {
    const days = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [D(i - 9), lesson(D(i - 9))]));
    const v = seasonView(state({ days }), deck, TODAY);
    expect(v).toMatchObject({ season: 2, next: 1, nextLesson: 11, todayDone: true });
    expect(v.got).toEqual([]);
    expect(v.cards).toHaveLength(10);
  });
});
