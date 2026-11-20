import { addDays } from "./dates";
import type { AppState, DayLog, Word, WordState } from "./types";

/** Интервалы по уровню, дни. */
export const IV = [0, 1, 3, 7, 14, 30, 60] as const;
export const MAX_LVL = 6;

export const blankState = (): WordState => ({ lvl: 0, due: "", intro: "", right: 0, wrong: 0 });

/** Знакомство: lvl=1, due=завтра, intro=сегодня. Повторное знакомство ничего не меняет. */
export const introduce = (ws: WordState | undefined, today: string): WordState => {
  const s = ws ?? blankState();
  if (s.intro) return s;
  return { ...s, lvl: 1, due: addDays(today, 1), intro: today };
};

export interface GradeContext {
  /** шаг повторения (утренняя разминка) */
  rev?: boolean;
  /** вечерняя проверка */
  eve?: boolean;
}

/**
 * Оценка первой попытки по слову.
 * - повторение, верно: lvl+1 (до 6), due = сегодня + IV[lvl]
 * - повторение или вечер, ошибка: lvl=1, due=завтра
 * - иначе меняются только счётчики right/wrong
 */
export const applyGrade = (ws: WordState | undefined, ok: boolean, ctx: GradeContext, today: string): WordState => {
  const s = { ...(ws ?? blankState()) };
  if (ctx.rev) {
    if (ok) {
      s.lvl = Math.min(s.lvl + 1, MAX_LVL);
      s.due = addDays(today, IV[s.lvl]);
    } else {
      s.lvl = 1;
      s.due = addDays(today, 1);
    }
  }
  if (ctx.eve && !ok) {
    s.lvl = 1;
    s.due = addDays(today, 1);
  }
  if (ok) s.right++;
  else s.wrong++;
  return s;
};

/** Группы для UI: 0 новые, 1 учу (1–2), 2 знакомо (3–4), 3 выучено (5–6). */
export const levelGroup = (lvl: number): 0 | 1 | 2 | 3 => (lvl === 0 ? 0 : lvl <= 2 ? 1 : lvl <= 4 ? 2 : 3);

export const groups = (words: readonly Word[], srs: AppState["srs"]): [number, number, number, number] => {
  const g: [number, number, number, number] = [0, 0, 0, 0];
  for (const w of words) g[levelGroup(srs[w.id]?.lvl ?? 0)]++;
  return g;
};

export const learned = (words: readonly Word[], srs: AppState["srs"]) => words.filter((w) => (srs[w.id]?.lvl ?? 0) >= 1);

export const unseen = (words: readonly Word[], srs: AppState["srs"]) => words.filter((w) => !srs[w.id]?.intro);

/** Слова, которым пора на повторение (до `until` включительно), старые первыми. */
export const dueList = (words: readonly Word[], srs: AppState["srs"], until: string) =>
  words
    .filter((w) => {
      const s = srs[w.id];
      return !!s && s.lvl >= 1 && !!s.due && s.due <= until;
    })
    .sort((a, b) => (srs[a.id].due < srs[b.id].due ? -1 : srs[a.id].due > srs[b.id].due ? 1 : 0));

const active = (d: DayLog | undefined) => !!d && !!(d.morning || d.evening);

/** Серия дней: сегодня считается, если занятие было; иначе считаем со вчера. */
export const streak = (days: AppState["days"], today: string): number => {
  let n = 0,
    k = today;
  if (!active(days[k])) k = addDays(k, -1);
  while (active(days[k])) {
    n++;
    k = addDays(k, -1);
  }
  return n;
};
