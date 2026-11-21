import { SEASON, type LessonCard } from "./cards";
import { streak, streakRuns } from "./srs";
import type { AppState } from "./types";

/*
 * Достижения («Я»): серия дней, слова, уроки и особые. Всё выводится из прогресса (дни, слова,
 * карточки) — отдельно не хранится, поэтому синхронизируется вместе с прогрессом.
 * Получено — с датой, когда порог впервые достигнут; не получено — прогресс «есть из нужно».
 */

export type AchievementGroup = "streak" | "words" | "lessons" | "special";

export interface Achievement {
  id: string;
  group: AchievementGroup;
  /** сколько нужно */
  goal: number;
  /** сколько есть сейчас (для прогресса; у полученного может быть меньше goal — например, серия прервалась) */
  have: number;
  /** когда получено, YYYY-MM-DD; null — ещё нет */
  got: string | null;
}

export const STREAK_GOALS = [7, 30, 100] as const;
/** «Слова» — слова, с которыми познакомились на уроках (есть дата знакомства intro). */
export const WORD_GOALS = [50, 100, 500] as const;
/** «Уроки» — пройденные целиком (обе части), то есть полученные карточки. */
export const LESSON_GOALS = [1, 10, 50] as const;

/** День, когда серия дней подряд впервые достигла n; null — ещё не было. */
export const streakReached = (days: AppState["days"], n: number): string | null => {
  for (const [k, run] of streakRuns(days)) if (run >= n) return k;
  return null;
};

/** Дни знакомства со словами по порядку (по одному на слово). */
const introDays = (srs: AppState["srs"]) =>
  Object.values(srs)
    .map((w) => w.intro)
    .filter(Boolean)
    .sort();

/** Все 11 достижений в порядке экрана: серия, слова, уроки, особые. */
export const achievements = (state: AppState, cards: LessonCard[], today: string): Achievement[] => {
  const sk = streak(state.days, today);
  const intro = introDays(state.srs);
  const s1 = cards.filter((c) => c.season === 1);

  return [
    ...STREAK_GOALS.map((n): Achievement => ({ id: `streak-${n}`, group: "streak", goal: n, have: sk, got: streakReached(state.days, n) })),
    ...WORD_GOALS.map((n): Achievement => ({ id: `words-${n}`, group: "words", goal: n, have: intro.length, got: intro[n - 1] ?? null })),
    ...LESSON_GOALS.map((n): Achievement => ({ id: `lessons-${n}`, group: "lessons", goal: n, have: cards.length, got: cards[n - 1]?.got ?? null })),
    { id: "first-card", group: "special", goal: 1, have: Math.min(cards.length, 1), got: cards[0]?.got ?? null },
    { id: "season-1", group: "special", goal: SEASON, have: s1.length, got: s1.length >= SEASON ? s1[SEASON - 1].got : null },
  ];
};
