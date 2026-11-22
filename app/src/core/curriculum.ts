import { addDays, dayOfIso } from "./dates.ts";
import { levelGroup } from "./srs.ts";
import type { AppState, DayLog, Deck, SessionResult } from "./types";

/** Сезон — десять уроков, независимо от темпа, слов и полученных карточек. */
export const LESSONS_PER_SEASON = 10;
/** Общая граница переноса для интерфейса и проверки сервером. */
export const CARRY_DAYS = 2;
export const seasonOf = (lesson: number): number => Math.floor((lesson - 1) / LESSONS_PER_SEASON) + 1;
export const inSeason = (lesson: number): number => ((lesson - 1) % LESSONS_PER_SEASON) + 1;
export const seasonRange = (season: number) => ({ start: (season - 1) * LESSONS_PER_SEASON + 1, end: season * LESSONS_PER_SEASON });

export const lessonNo = (days: AppState["days"], day: string): number =>
  Object.keys(days).filter((k) => k < day && days[k]?.morning).length + 1;
export const lessonComplete = (day: DayLog | undefined): boolean => !!day?.morning && !!day?.evening;

export interface LessonIdentity {
  no: number;
  season: number;
  pos: number;
  final: boolean;
}
export const lessonIdentity = (no: number): LessonIdentity => ({ no, season: seasonOf(no), pos: inSeason(no), final: inSeason(no) === LESSONS_PER_SEASON });

/** Старые незавершённые части остаются в истории; перенос доступен только до начала следующего урока. */
export const carriedDay = (days: AppState["days"], today: string): string | null => {
  if (days[today]?.morning) return null;
  const last = Object.keys(days).filter((k) => k < today && days[k]?.morning).sort().pop();
  if (!last || last < addDays(today, -CARRY_DAYS)) return null;
  const e = days[last].evening;
  return !e || dayOfIso(e.at) === today ? last : null;
};

/** Сквозная история по первым частям, включая уроки с пропущенной второй. */
export const lessonEntries = (days: AppState["days"]) => Object.keys(days)
  .filter((day) => days[day]?.morning).sort().map((day, i) => ({
    ...lessonIdentity(i + 1), day, part1: days[day].morning!, part2: days[day].evening ?? null,
    complete: lessonComplete(days[day]),
  }));

export interface LessonRecord extends LessonIdentity {
  day: string;
  part1: SessionResult;
  part2: SessionResult | null;
  part2Status: "done" | "available" | "carried" | "missed";
  complete: boolean;
  /** Первое знакомство закрепляет слова за уроком; повторение связь не меняет. */
  words: string[];
  known: number;
  mastered: number;
}

export const lessonHistory = (state: AppState, deck: Deck, today: string): LessonRecord[] => {
  const carry = carriedDay(state.days, today);
  const byDay = new Map<string, string[]>();
  for (const w of deck.words) {
    const day = state.srs[w.id]?.intro;
    if (day) byDay.set(day, [...(byDay.get(day) ?? []), w.id]);
  }
  return lessonEntries(state.days).map((entry) => {
    const { day, part2 } = entry;
    const words = byDay.get(day) ?? [];
    return {
      ...entry,
      part2Status: part2 ? "done" : day === today ? "available" : day === carry ? "carried" : "missed",
      words,
      known: words.filter((id) => state.srs[id].lvl >= 3).length,
      mastered: words.filter((id) => levelGroup(state.srs[id].lvl) === 3).length,
    };
  });
};

/** Единый текущий урок: перенос, сегодняшний, либо следующий после полностью завершённого сегодня. */
export const lessonCursor = (days: AppState["days"], today: string) => {
  const c = carriedDay(days, today);
  const carry = c && !lessonComplete(days[c]) ? c : null;
  const todayDone = !carry && lessonComplete(days[today]);
  const day = carry ?? (todayDone ? addDays(today, 1) : today);
  return { ...lessonIdentity(lessonNo(days, day)), day, todayDone, carry };
};

export interface SeasonReward {
  season: number;
  lesson: number;
  day: string;
  got: string;
  name: string;
}

/** Бонус за обе части финального урока; пропуски раньше не переносят финал на другой номер. */
export const seasonRewards = (history: readonly LessonRecord[]): SeasonReward[] => history
  .filter((l) => l.final && l.complete)
  .map((l) => ({ season: l.season, lesson: l.no, day: l.day, got: dayOfIso(l.part2!.at) ?? l.day, name: `Финал сезона ${l.season}` }));

/** Десять узлов любого сезона: начатые уроки и будущие места, без предварительного распределения новых слов. */
export const seasonProgress = (history: readonly LessonRecord[], season: number) => {
  const range = seasonRange(season);
  const lessons = Array.from({ length: LESSONS_PER_SEASON }, (_, i) => {
    const no = range.start + i;
    return { ...lessonIdentity(no), record: history.find((l) => l.no === no) ?? null };
  });
  const records = lessons.flatMap((l) => l.record ? [l.record] : []);
  return {
    season, ...range, lessons,
    started: records.length,
    completed: records.filter((l) => l.complete).length,
    introduced: records.reduce((n, l) => n + l.words.length, 0),
    known: records.reduce((n, l) => n + l.known, 0),
    mastered: records.reduce((n, l) => n + l.mastered, 0),
    reward: seasonRewards(records)[0] ?? null,
  };
};
