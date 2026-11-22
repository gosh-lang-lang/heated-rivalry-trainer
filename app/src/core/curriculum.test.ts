import { describe, expect, it } from "vitest";
import { carriedDay, inSeason, lessonCursor, lessonHistory, lessonIdentity, lessonNo, seasonOf, seasonProgress, seasonRange, seasonRewards } from "./curriculum";
import { cardSubject, earnedCards, seasonView } from "./cards";
import { achievements } from "./achievements";
import { addDays } from "./dates";
import { deck, state, TODAY } from "./fixtures";
import { morningPlan, newToday, QUEUE_STOP } from "./plans";
import { finishSession, startSession } from "./session";
import { acceptState } from "./serverday";
import { changeSetting, mergeStates, parseState } from "./state";
import { wordLessons } from "./vocab";
import type { AppState, SessionResult } from "./types";

const D = (i: number) => addDays(TODAY, i);
const result = (day: string, evening = false): SessionResult => ({ score: 1, total: 2, mins: 3, newN: 0, at: `${day}T${evening ? "15" : "06"}:00:00Z` });
const historyState = (n: number, missed: number[] = []): AppState => state({
  days: Object.fromEntries(Array.from({ length: n }, (_, i) => {
    const day = D(i - n);
    return [day, { morning: result(day), ...(!missed.includes(i + 1) ? { evening: result(day, true) } : {}) }];
  })),
});

it("сквозные номера и десять мест для любого сезона, без верхней границы", () => {
  for (const n of [1, 10, 11, 20, 21, 10001]) {
    const l = lessonIdentity(n);
    expect(l).toEqual({ no: n, season: seasonOf(n), pos: inSeason(n), final: n % 10 === 0 });
    const p = seasonProgress([], l.season);
    expect(p.lessons).toHaveLength(10);
    expect(p.lessons[l.pos - 1]).toMatchObject({ no: n, record: null });
    expect(seasonRange(l.season)).toEqual({ start: p.start, end: p.end });
  }
  expect(cardSubject(10001)).toMatchObject({ name: "Сезон 1001 · карточка №01", art: "shane" });
  expect(cardSubject(10010)).toMatchObject({ name: "Финал сезона 1001", art: "cup" });
});

it.each([10, 20])("переход %i → следующий сезон не зависит от числа наград", (n) => {
  const s = historyState(n, [2, 5]);
  const before = JSON.stringify(s);
  const v = seasonView(s, deck, TODAY);
  expect(v).toMatchObject({ season: n / 10 + 1, next: 1, nextLesson: n + 1 });
  expect(v.cards).toHaveLength(n - 2);
  const h = lessonHistory(s, deck, TODAY);
  expect(h[1]).toMatchObject({ no: 2, part2: null, part2Status: "missed", complete: false });
  const p = seasonProgress(h, 1);
  expect(p).toMatchObject({ started: 10, completed: 8, introduced: 0, known: 0, mastered: 0 });
  expect(p.lessons[9].record?.no).toBe(10);
  expect(seasonRewards(h)[0]).toMatchObject({ season: 1, lesson: 10 });
  expect(JSON.stringify(s)).toBe(before);
});

it.each([10, 20])("перенесённая часть 2 урока %i остаётся в прежнем сезоне до завершения", (n) => {
  const s = historyState(n, [n]);
  const day = D(-1);
  expect(carriedDay(s.days, TODAY)).toBe(day);
  expect(lessonCursor(s.days, TODAY)).toMatchObject({ no: n, season: n / 10, pos: 10, day });
  expect(lessonHistory(s, deck, TODAY).at(-1)).toMatchObject({ part2Status: "carried" });
  const sess = startSession("evening", [{ k: 0, t: "reread", pages: [] }])!;
  const fin = finishSession(sess, s, day, new Date(`${TODAY}T06:00:00Z`));
  expect(fin.state.days[day].evening).toMatchObject({ cardSubject: n });
  expect(earnedCards(fin.state, deck).at(-1)).toMatchObject({ lesson: n, final: true, gold: true, got: TODAY });
  expect(lessonCursor(fin.state.days, TODAY)).toMatchObject({ no: n + 1, season: n / 10 + 1 });
  // Начало нового урока также закрывает перенос; пропуск не исчезает из истории.
  const next = { ...s, days: { ...s.days, [TODAY]: { morning: result(TODAY) } } };
  expect(carriedDay(next.days, TODAY)).toBeNull();
  expect(lessonHistory(next, deck, TODAY).at(-2)?.part2Status).toBe("missed");
  expect(seasonView(next, deck, TODAY).season).toBe(n / 10 + 1);
});

it("пропущенный финал не переезжает на десятую карточку", () => {
  const s = historyState(11, [10]);
  expect(lessonCursor(s.days, D(3))).toMatchObject({ no: 12, season: 2 });
  expect(seasonRewards(lessonHistory(s, deck, D(3)))).toEqual([]);
  expect(earnedCards(s, deck).at(-1)).toMatchObject({ no: 10, lesson: 11, season: 2, pos: 1 });
});

it("освоение слов отдельно от прохождения и не ограничено текущим сезоном", () => {
  const s = historyState(11);
  const day = D(-11);
  s.srs = Object.fromEntries(deck.words.slice(0, 3).map((w, i) => [w.id, { lvl: [1, 3, 5][i], intro: day, due: TODAY, right: 1, wrong: 0 }]));
  const p = seasonProgress(lessonHistory(s, deck, TODAY), 1);
  expect(p).toMatchObject({ completed: 10, introduced: 3, known: 2, mastered: 1 });
  expect(newToday(deck, s, TODAY).due).toBe(3);
  const groups = wordLessons(s, deck);
  expect(groups.find((g) => g.no === 1)).toMatchObject({ season: 1, pos: 1, words: deck.words.slice(0, 3) });
  expect(groups.find((g) => g.no === 11)?.words).toEqual([]);
});

it.each([6, 12, 18, 24])("темп %i — верхняя граница, меняются только будущие занятия", (pace) => {
  const s = historyState(10);
  s.days[D(-1)].morning = { ...result(D(-1)), revScore: 30, revTotal: 30 };
  const prev = earnedCards(s, deck);
  const changed = changeSetting(s, "newPerDay", pace);
  expect(newToday(deck, changed, TODAY).n).toBe(pace);
  expect(earnedCards(changed, deck)).toEqual(prev);
  expect(changed.days).toBe(s.days);
  expect(changed.srs).toBe(s.srs);
  const rest = { ...deck, words: deck.words.slice(0, 3) };
  expect(newToday(rest, changed, TODAY).n).toBe(3);
  changed.srs = Object.fromEntries(deck.words.map((w) => [w.id, { lvl: 1, due: TODAY, intro: D(-2), right: 1, wrong: 0 }]));
  expect(newToday(deck, changed, TODAY)).toMatchObject({ n: 0, due: deck.words.length });
  expect(morningPlan(deck, changed, TODAY).some((s) => s.t === "intro")).toBe(false);
  const fresh = { ...changed, srs: Object.fromEntries(Object.entries(changed.srs).slice(0, QUEUE_STOP + 1)) };
  expect(newToday(deck, fresh, TODAY).n).toBe(0); // есть новые, но очередь останавливает знакомство
});

it("после исчерпания очереди новые слова из добавленной партии доступны без смены сезонов", () => {
  const s = historyState(20);
  s.srs = Object.fromEntries(deck.words.map((w) => [w.id, { lvl: 5, due: D(5), intro: D(-1), right: 1, wrong: 0 }]));
  expect(newToday(deck, s, TODAY)).toMatchObject({ n: 0, due: 0 });
  const w = { ...deck.words[0], id: "added-later", batch: 99 };
  const grown = { ...deck, words: [...deck.words, w], byId: { ...deck.byId, [w.id]: w } };
  expect(newToday(grown, s, TODAY).n).toBe(1);
  expect(lessonNo(s.days, TODAY)).toBe(21);
});

describe("совместимость прежних наград", () => {
  it("импорт замораживает сюжеты, результаты, слова, даты и золотую старую награду", () => {
    const raw = historyState(11, [2]);
    const old = earnedCards(raw, deck);
    const loaded = parseState(raw);
    expect(earnedCards(loaded, deck)).toMatchObject(old);
    expect(loaded.srs).toEqual(raw.srs);
    for (const day of Object.keys(raw.days)) {
      expect(loaded.days[day].morning).toEqual(raw.days[day].morning);
      if (raw.days[day].evening) expect(loaded.days[day].evening).toEqual({ ...raw.days[day].evening, cardSubject: old.find((c) => c.day === day)!.no });
    }
    expect(parseState(loaded)).toEqual(loaded);
    expect(earnedCards(loaded, deck).at(-1)).toMatchObject({ no: 10, lesson: 11, artSeason: 1, artPos: 10, gold: true, art: "cup", season: 2, pos: 1 });
    // Прежнее достижение и новый бонус за финальный урок сохраняются независимо.
    expect(achievements(loaded, earnedCards(loaded, deck), TODAY).find((a) => a.id === "season-1")?.got).toBe(D(-1));
  });

  it("новая награда привязана к уроку, а сохранённые сюжеты переживают загрузку, слияние и сервер", () => {
    const s = parseState(historyState(9, [2]));
    const sess = startSession("morning", [{ k: 0, t: "reread", pages: [] }])!;
    const morning = finishSession(sess, s, TODAY, new Date(`${TODAY}T06:00:00Z`)).state;
    const fin = finishSession({ ...sess, kind: "evening" }, morning, TODAY, new Date(`${TODAY}T08:00:00Z`)).state;
    const cards = earnedCards(fin, deck);
    expect(cards.at(-1)).toMatchObject({ no: 9, lesson: 10, subjectNo: 10, gold: true, final: true });
    const loaded = parseState(fin);
    const merged = mergeStates(loaded, s);
    expect(earnedCards(merged, deck)).toEqual(cards);
    const accepted = acceptState(s, loaded, { now: Date.parse(`${TODAY}T09:00:00Z`), tz: "UTC" });
    expect(earnedCards(accepted, deck).map((c) => [c.lesson, c.subjectNo])).toEqual(cards.map((c) => [c.lesson, c.subjectNo]));
    expect(lessonCursor(fin.days, TODAY)).toMatchObject({ no: 11, season: 2, todayDone: true, day: D(1) });
  });
});
