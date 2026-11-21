import { addDays } from "./dates";
import type { AppState, DayLog, Word, WordState } from "./types";

/** Интервалы по уровню, дни: ходовые слова. */
export const IV = [0, 1, 3, 7, 14, 30, 60] as const;
/** Интервалы для редких слов — вдвое длиннее. */
export const IV_RARE = [0, 2, 6, 14, 30, 60, 120] as const;
export const MAX_LVL = 6;
/**
 * Насколько падает уровень при ошибке. Забытое слово не забыто начисто — восстанавливается быстро,
 * поэтому не сбрасываем до 1, а снижаем на 2 и проверяем скоро.
 */
export const DROP = 2;
/** «Трудное» слово: столько ошибок всего (на любых шагах). */
export const HARD_WRONG = 4;

export const interval = (lvl: number, rare?: boolean) => (rare ? IV_RARE : IV)[lvl];

export const isHard = (ws: WordState | undefined) => (ws?.wrong ?? 0) >= HARD_WRONG;

export const blankState = (): WordState => ({ lvl: 0, due: "", intro: "", right: 0, wrong: 0 });

/** Знакомство: lvl=1, due=завтра (редкое — послезавтра), intro=сегодня. Повторное знакомство ничего не меняет. */
export const introduce = (ws: WordState | undefined, today: string, rare?: boolean): WordState => {
  const s = ws ?? blankState();
  if (s.intro) return s;
  return { ...s, lvl: 1, due: addDays(today, interval(1, rare)), intro: today };
};

export interface GradeContext {
  /** шаг повторения (утренняя разминка) */
  rev?: boolean;
  /** вечерняя проверка */
  eve?: boolean;
  /** редкое слово */
  rare?: boolean;
}

/**
 * Оценка первой попытки по слову.
 * - повторение, верно: lvl+1 (до 6), due = сегодня + интервал нового уровня
 * - повторение или вечер, ошибка: lvl−2 (не ниже 1), проверка скоро — завтра (редкое — послезавтра)
 * - иначе меняются только счётчики right/wrong
 */
export const applyGrade = (ws: WordState | undefined, ok: boolean, ctx: GradeContext, today: string): WordState => {
  const s = { ...(ws ?? blankState()) };
  if (ctx.rev && ok) {
    s.lvl = Math.min(s.lvl + 1, MAX_LVL);
    s.due = addDays(today, interval(s.lvl, ctx.rare));
  }
  if ((ctx.rev || ctx.eve) && !ok) {
    s.lvl = Math.max(1, s.lvl - DROP);
    s.due = addDays(today, interval(1, ctx.rare));
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

/**
 * Слова, которым пора на повторение (до `until` включительно).
 * Порядок: сначала просроченные (самые старые первыми), затем срок `until` — от низкого уровня к высокому:
 * если всё не поместится, первыми повторяются самые непрочные.
 */
export const dueList = (words: readonly Word[], srs: AppState["srs"], until: string) =>
  words
    .filter((w) => {
      const s = srs[w.id];
      return !!s && s.lvl >= 1 && !!s.due && s.due <= until;
    })
    .sort((a, b) => {
      const x = srs[a.id],
        y = srs[b.id];
      if (x.due !== y.due && (x.due < until || y.due < until)) return x.due < y.due ? -1 : 1;
      return x.lvl - y.lvl;
    });

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

/** Самая длинная серия дней подряд за всё время (рекорд). */
export const bestStreak = (days: AppState["days"]): number => {
  let best = 0,
    run = 0,
    prev = "";
  for (const k of Object.keys(days).sort()) {
    if (!active(days[k])) continue;
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    prev = k;
    best = Math.max(best, run);
  }
  return best;
};

/** Был ли в день k урок (часть 1 или часть 2) — для серии. */
export const activeDay = (days: AppState["days"], k: string): boolean => active(days[k]);

/** Сколько частей урока пройдено в день k: 0 — ни одной, 1 — одна (день в серии засчитан), 2 — обе (урок закрыт). */
export const dayParts = (days: AppState["days"], k: string): 0 | 1 | 2 => {
  const d = days[k];
  return ((d?.morning ? 1 : 0) + (d?.evening ? 1 : 0)) as 0 | 1 | 2;
};
