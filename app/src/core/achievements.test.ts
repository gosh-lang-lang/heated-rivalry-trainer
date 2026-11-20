import { describe, expect, it } from "vitest";
import { achievements, streakReached } from "./achievements";
import { earnedCards } from "./cards";
import { addDays } from "./dates";
import { deck, state, TODAY } from "./fixtures";
import type { AppState, DayLog, SessionResult, WordState } from "./types";

const at = (day: string, h: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, h).toISOString();
};
const r = (day: string, h: number): SessionResult => ({ score: 9, total: 10, mins: 15, newN: 6, at: at(day, h) });
const full = (day: string): DayLog => ({ morning: r(day, 9), evening: r(day, 19) });
const D = (i: number) => addDays(TODAY, i);
const words = (n: number, day: (i: number) => string): AppState["srs"] =>
  Object.fromEntries(deck.words.slice(0, n).map((w, i): [string, WordState] => [w.id, { lvl: 1, due: day(i), intro: day(i), right: 0, wrong: 0 }]));

const get = (s: AppState, id: string, today = TODAY) => achievements(s, earnedCards(s, deck), today).find((a) => a.id === id)!;

describe("достижения", () => {
  it("12 штук в порядке экрана: серия, слова, уроки, особые", () => {
    const list = achievements(state(), [], TODAY);
    expect(list.map((a) => a.id)).toEqual([
      "streak-7", "streak-30", "streak-100",
      "words-50", "words-100", "words-500",
      "lessons-1", "lessons-10", "lessons-50",
      "first-card", "first-sentence", "season-1",
    ]);
    expect(list.every((a) => a.got === null && a.have === 0)).toBe(true);
  });

  it("серия 7: дата — седьмой день подряд; разрыв начинает счёт заново", () => {
    const days: AppState["days"] = {};
    for (const i of [0, 1, 2]) days[D(i)] = { morning: r(D(i), 9) };
    // пропуск D(3)
    for (let i = 4; i <= 11; i++) days[D(i)] = { morning: r(D(i), 9) };
    expect(streakReached(days, 7)).toBe(D(10));
    expect(streakReached(days, 9)).toBe(null);
    const s = state({ days });
    expect(get(s, "streak-7", D(11))).toMatchObject({ got: D(10), have: 8, goal: 7 });
    expect(get(s, "streak-30", D(11))).toMatchObject({ got: null, have: 8, goal: 30 });
  });

  it("серия прервалась — полученное остаётся с датой, прогресс — по текущей серии", () => {
    const days = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [D(i), { evening: r(D(i), 19) }]));
    const a = get(state({ days }), "streak-7", D(20));
    expect(a).toMatchObject({ got: D(6), have: 0 });
  });

  it("слова — встреченные на уроках (с датой знакомства); дата — день 50-го слова", () => {
    // по 10 слов в день, 6 дней → 60 слов; 50-е — в пятый день
    const s = state({ srs: { ...words(60, (i) => D(Math.floor(i / 10))), [deck.words[61].id]: { lvl: 0, due: "", intro: "", right: 0, wrong: 0 } } });
    expect(get(s, "words-50")).toMatchObject({ got: D(4), have: 60 });
    expect(get(s, "words-100")).toMatchObject({ got: null, have: 60, goal: 100 });
  });

  it("уроки — пройденные целиком; дата — когда пройден урок с нужным номером", () => {
    const days: AppState["days"] = { [D(0)]: full(D(0)), [D(1)]: { morning: r(D(1), 9) }, [D(2)]: full(D(2)) };
    const s = state({ days });
    expect(get(s, "lessons-1")).toMatchObject({ got: D(0), have: 2 });
    expect(get(s, "lessons-10")).toMatchObject({ got: null, have: 2, goal: 10 });
    expect(get(s, "first-card")).toMatchObject({ got: D(0), have: 1, goal: 1 });
    expect(get(s, "season-1")).toMatchObject({ got: null, have: 2, goal: 10 });
  });

  it("весь сезон 1 — дата 10-й карточки", () => {
    const days = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [D(i), full(D(i))]));
    expect(get(state({ days }), "season-1")).toMatchObject({ got: D(9), have: 10 });
    expect(get(state({ days }), "lessons-10")).toMatchObject({ got: D(9), have: 11 });
  });

  it("первое своё предложение — по самому раннему, даже если ждёт проверки", () => {
    const s = state({
      sent: [
        { at: at(D(3), 20), words: ["novel"], text: "B", ok: true },
        { at: at(D(1), 20), words: ["endure"], text: "A", pending: true },
      ],
    });
    expect(get(s, "first-sentence")).toMatchObject({ got: D(1), have: 1 });
    expect(get(state(), "first-sentence")).toMatchObject({ got: null, have: 0 });
  });
});
