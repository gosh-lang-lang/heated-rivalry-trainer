import { clockTz, dayIn, hourIn, nowDate, todayKey } from "./dates";
import { eveningWords, newToday } from "./plans";
import { carriedDay, lessonNo } from "./curriculum";
export { CARRY_DAYS, carriedDay, lessonNo } from "./curriculum";
import { resumable, runPosition } from "./session";
import type { AppState, Deck, SessionResult } from "./types";

/*
 * Урок дня — две части по ~15 минут: часть 1 — учим (данные: days[d].morning, занятие "morning"),
 * часть 2 — применяем (days[d].evening, занятие "evening"). Ключи данных остались от «утра и вечера».
 * Часов для части 1 нет; часть 2 — после паузы от реального конца части 1 (совет, не запрет).
 */

/** Пауза между частями, минуты: часть 2 лучше начинать не раньше, чем через столько после конца части 1. */
export const PART2_GAP_MIN = 90;
/** С этого часа (местное время) часть 2 лучше отложить на завтра. */
export const LATE_HOUR = 22;

/**
 * Совет для части 2:
 * ready — можно начинать; wait — лучше после `after` (кнопка всё равно есть);
 * late — сегодня уже поздно, лучше завтра первым делом (кнопка «Всё равно сейчас»).
 */
export type Advice = "ready" | "wait" | "late";

export interface LessonPart {
  part: 1 | 2;
  /** номер урока */
  n: number;
  /** день урока — ключ в state.days */
  day: string;
  /** итог, если часть пройдена */
  done: SessionResult | null;
  /**
   * Можно начать: часть 1 — не пройдена и есть повторения или новые слова;
   * часть 2 — не пройдена, часть 1 этого урока пройдена и есть слова урока.
   */
  can: boolean;
  /** только часть 2, когда её можно начать */
  advice: Advice | null;
  /** когда лучше начинать часть 2 (конец части 1 + пауза); null — время неизвестно */
  after: Date | null;
  /** часть 2 перенесена со дня урока на сегодня */
  carried: boolean;
  /** второстепенная: часть 1 следующего урока, пока не пройдена перенесённая часть 2 (начать можно) */
  secondary: boolean;
  /** часть начата сегодня и не закончена: «Продолжить · n из of» и «Начать заново»; null — нет */
  resume: { n: number; of: number } | null;
}

export interface LessonStatus {
  today: string;
  /** карточки на главной сверху вниз: обычно [часть 1, часть 2]; при переносе — [часть 2 прошлого урока, часть 1 нового] */
  cards: [LessonPart, LessonPart];
  /** день урока, чья часть 2 перенесена на сегодня; null — переноса нет */
  carry: string | null;
  /** какая часть сейчас главная (её карточку выделяем); null — на сегодня всё (в том числе поздняя часть 2) */
  focus: 1 | 2 | null;
}

/** Когда лучше начинать часть 2: конец части 1 + PART2_GAP_MIN; null — время конца неизвестно. */
export const part2After = (part1?: SessionResult | null): Date | null => {
  const t = part1 ? Date.parse(part1.at) : NaN;
  return Number.isNaN(t) ? null : new Date(t + PART2_GAP_MIN * 60_000);
};

/**
 * Совет для части 2 урока дня `day` (часть 1 пройдена):
 * - уже LATE_HOUR или позже — late;
 * - урок сегодня, а рекомендованное время позже LATE_HOUR — late (лучше завтра первым делом);
 * - рекомендованное время ещё не наступило — wait;
 * - иначе — ready.
 */
export const part2Advice = (day: string, part1: SessionResult | null | undefined, now: Date): { advice: Advice; after: Date | null } => {
  const today = todayKey(now);
  const after = part2After(part1);
  // LATE_HOUR сегодняшнего дня или позже — в поясе уроков
  const late = (d: Date) => {
    const k = dayIn(d.getTime(), clockTz());
    return k > today || (k === today && hourIn(d.getTime(), clockTz()) >= LATE_HOUR);
  };
  if (late(now)) return { advice: "late", after };
  if (after && day === today && late(after)) return { advice: "late", after };
  if (after && now < after) return { advice: "wait", after };
  return { advice: "ready", after };
};

/** Что показать на главной: какие части, номера уроков, совет для части 2, перенос со вчера. */
export const lessonStatus = (state: AppState, deck: Deck, now: Date = nowDate()): LessonStatus => {
  const today = todayKey(now);
  const { days } = state;
  const carry = carriedDay(days, today);

  const nt = newToday(deck, state, today);
  const m = days[today]?.morning ?? null;
  const r1 = resumable(state, "morning", today, today);
  const part1: LessonPart = {
    part: 1,
    n: lessonNo(days, today),
    day: today,
    done: m,
    can: !m && (!!r1 || nt.due > 0 || nt.n > 0),
    advice: null,
    after: null,
    carried: false,
    secondary: false,
    resume: r1 && runPosition(r1),
  };

  const day2 = carry ?? today;
  const m2 = days[day2]?.morning ?? null;
  const e2 = days[day2]?.evening ?? null;
  const r2 = resumable(state, "evening", day2, today);
  const can2 = !e2 && !!m2 && (!!r2 || eveningWords(deck, state.srs, day2).length > 0);
  const adv = can2 ? part2Advice(day2, m2, now) : null;
  const part2: LessonPart = {
    part: 2,
    n: lessonNo(days, day2),
    day: day2,
    done: e2,
    can: can2,
    advice: adv?.advice ?? null,
    after: adv?.after ?? null,
    carried: !!carry,
    secondary: false,
    resume: r2 && runPosition(r2),
  };

  // поздняя часть 2 не главная: её совет — завтра
  const p2 = part2.can && part2.advice !== "late";
  if (carry) {
    part1.secondary = !e2;
    return { today, cards: [part2, part1], carry, focus: p2 ? 2 : part1.can ? 1 : null };
  }
  return { today, cards: [part1, part2], carry: null, focus: part1.can ? 1 : p2 ? 2 : null };
};


/** «через 1 ч 12 мин», «через 45 мин», «через 2 ч» — сколько осталось до `to` (минуты округляются вверх). */
export const untilText = (now: Date, to: Date): string => {
  const mins = Math.max(1, Math.ceil((to.getTime() - now.getTime()) / 60_000));
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return "через " + [h ? `${h} ч` : "", m ? `${m} мин` : ""].filter(Boolean).join(" ");
};

/** Кнопка незаконченной части: «Продолжить · 12 из 38». */
export const resumeLabel = (r: { n: number; of: number }): string => `Продолжить · ${r.n} из ${r.of}`;
