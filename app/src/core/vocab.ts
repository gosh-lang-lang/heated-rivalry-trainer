import { addDays } from "./dates";
import { lessonNo } from "./lesson";
import type { AppState, Deck, Word } from "./types";

/**
 * Словарь по урокам: слово принадлежит уроку, в котором его выучили (`srs[id].intro` — день урока; «ещё 6 новых»
 * в тот же день — тот же урок). Не начатые слова — группа «Впереди» (no = null). Уроки — от нового к старому,
 * «Впереди» — последней; внутри группы — порядок колоды.
 */
export interface LessonGroup {
  /** номер урока; null — «Впереди» */
  no: number | null;
  /** день урока YYYY-MM-DD; null — «Впереди» */
  day: string | null;
  words: Word[];
}

export const wordLessons = (state: AppState, deck: Deck): LessonGroup[] => {
  const byDay = new Map<string, Word[]>();
  const ahead: Word[] = [];
  for (const w of deck.words) {
    const d = state.srs[w.id]?.intro;
    if (!d) ahead.push(w);
    else byDay.set(d, [...(byDay.get(d) ?? []), w]);
  }
  const groups: LessonGroup[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, words]) => ({ no: lessonNo(state.days, day), day, words }));
  if (ahead.length) groups.push({ no: null, day: null, words: ahead });
  return groups;
};

/** Ключ группы для фильтра: номер урока или "ahead". */
export type LessonKey = number | "ahead";
export const groupKey = (g: LessonGroup): LessonKey => g.no ?? "ahead";
export const groupTitle = (g: LessonGroup): string => (g.no === null ? "Впереди" : `Урок ${g.no}`);

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** «2026-11-24» → «24 ноября» (год — только если не текущий у `today`). */
export const dayMonth = (k: string, today: string): string => {
  const [y, m, d] = k.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${String(y) === today.slice(0, 4) ? "" : ` ${y}`}`;
};

/** «вт, 24 ноября» */
export const weekdayDay = (k: string, today: string): string => {
  const [y, m, d] = k.split("-").map(Number);
  return `${WD[new Date(y, m - 1, d).getDay()]}, ${dayMonth(k, today)}`;
};

/** Когда повтор: «—» (не начато), «сегодня» (в том числе просрочено), «завтра», «26 ноября». */
export const dueText = (due: string | undefined, today: string): string =>
  !due ? "—" : due <= today ? "сегодня" : due === addDays(today, 1) ? "завтра" : dayMonth(due, today);
