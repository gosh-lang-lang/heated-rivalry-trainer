import { applyGrade, introduce } from "./srs";
import type { AppState, SentenceRecord, SessionKind, SessionResult, Step } from "./types";

export interface Session {
  kind: SessionKind;
  steps: Step[];
  i: number;
  /** заданий, оценённых по первой попытке */
  graded: number;
  right: number;
  /** то же только по шагам повторения (rev) */
  revGraded: number;
  revRight: number;
  /** k шагов, у которых уже была первая попытка */
  first: number[];
  newIds: string[];
  /** своё предложение по номеру write-шага — для говорения */
  written: Record<number, SentenceRecord>;
  t0: number;
}

export interface Graded {
  sess: Session;
  state: AppState;
}

export const startSession = (kind: SessionKind, steps: Step[], now = Date.now()): Session | null =>
  steps.length ? { kind, steps, i: 0, graded: 0, right: 0, revGraded: 0, revRight: 0, first: [], newIds: [], written: {}, t0: now } : null;

export const currentStep = (s: Session): Step | undefined => s.steps[s.i];

export const progress = (s: Session) => Math.min(s.i / s.steps.length, 1);

const NO_RETRY = new Set<Step["t"]>(["write", "speak", "say", "pairs", "section", "intro", "reread"]);

/** Шаг с говорением (и заголовок раздела говорения). */
export const isSpeech = (s: Step) => s.t === "speak" || s.t === "say" || (s.t === "section" && !!s.speech);

/**
 * Ответ на текущий шаг.
 * Счёт — по первой попытке: повтор того же шага (retry) в счёт не идёт.
 * SRS слова меняется только на первой попытке (и никогда — в тренировке drill).
 * Ошибка → копия шага в конец занятия (один раз; не для write/speak/say/pairs).
 */
export const gradeCurrent = (
  sess: Session,
  state: AppState,
  ok: boolean,
  wordId: string | null,
  today: string,
  rare?: boolean,
): Graded => {
  const step = sess.steps[sess.i];
  let s = sess,
    st = state;
  if (!sess.first.includes(step.k)) {
    s = { ...s, first: [...s.first, step.k], graded: s.graded + 1, right: s.right + (ok ? 1 : 0) };
    if ("rev" in step && step.rev) s = { ...s, revGraded: s.revGraded + 1, revRight: s.revRight + (ok ? 1 : 0) };
    if (wordId && sess.kind !== "drill") {
      const ctx = { rev: "rev" in step && !!step.rev, eve: "eve" in step && !!step.eve, rare };
      st = { ...st, srs: { ...st.srs, [wordId]: applyGrade(st.srs[wordId], ok, ctx, today) } };
    }
  }
  if (!ok && !step.retry && !NO_RETRY.has(step.t)) s = { ...s, steps: [...s.steps, { ...step, retry: true }] };
  return { sess: s, state: st };
};

/** Отметить шаг пройденным без оценки (например, предложение ушло на отложенную проверку). */
export const markSeen = (sess: Session): Session => {
  const k = sess.steps[sess.i].k;
  return sess.first.includes(k) ? sess : { ...sess, first: [...sess.first, k] };
};

/** Шаг «знакомство»: слово становится lvl=1, due=завтра (редкое — послезавтра). */
export const introduceCurrent = (sess: Session, state: AppState, today: string, rare?: boolean): Graded => {
  const step = sess.steps[sess.i];
  if (step.t !== "intro" || state.srs[step.w]?.intro) return { sess, state };
  return {
    sess: sess.newIds.includes(step.w) ? sess : { ...sess, newIds: [...sess.newIds, step.w] },
    state: { ...state, srs: { ...state.srs, [step.w]: introduce(state.srs[step.w], today, rare) } },
  };
};

/** Ошибка в «найди пары» — минус обоим словам. */
export const bumpWrong = (state: AppState, ids: string[]): AppState => {
  const srs = { ...state.srs };
  for (const id of ids) if (srs[id]) srs[id] = { ...srs[id], wrong: srs[id].wrong + 1 };
  return { ...state, srs };
};

export const advance = (sess: Session): Session => ({ ...sess, i: sess.i + 1 });

/**
 * «Не могу сейчас говорить» (или нет микрофона): все задания с говорением до конца занятия — прочь,
 * включая текущее. Пройденные шаги не трогаем; дальше — следующий шаг без говорения.
 */
export const skipSpeech = (sess: Session): Session => ({
  ...sess,
  steps: [...sess.steps.slice(0, sess.i), ...sess.steps.slice(sess.i).filter((s) => !isSpeech(s))],
});

export const isDone = (sess: Session) => sess.i >= sess.steps.length;

export const pct = (r: { score: number; total: number }) => (r.total ? Math.round((r.score / r.total) * 100) : 100);

export interface Finished {
  state: AppState;
  result: SessionResult;
  /** результат прошлого такого же занятия */
  prev: SessionResult | null;
  kind: SessionKind;
  /** день, в который записан итог (для перенесённой части 2 — день урока) */
  day: string;
}

/** Итог занятия → state.days[today]. Для части 2, перенесённой со вчера, `today` — день урока. */
export const finishSession = (sess: Session, state: AppState, today: string, now = new Date()): Finished => {
  const kind = sess.kind;
  const result: SessionResult = {
    score: sess.right,
    total: sess.graded,
    mins: Math.max(1, Math.round((now.getTime() - sess.t0) / 60000)),
    newN: sess.newIds.length,
    at: now.toISOString(),
    ...(sess.revGraded ? { revScore: sess.revRight, revTotal: sess.revGraded } : {}),
  };
  // тренировка «Пройти все слова» — только счёт: дни, серия и статистика не меняются
  if (kind === "drill") return { state, result, prev: null, kind, day: today };
  let prev: SessionResult | null = null;
  for (const k of Object.keys(state.days).filter((k) => k < today).sort()) {
    const d = state.days[k];
    if (kind === "extra") {
      if (d.extra?.length) prev = d.extra[d.extra.length - 1];
    } else if (d[kind]) prev = d[kind]!;
  }
  const d = { ...(state.days[today] ?? {}) };
  if (kind === "extra") d.extra = [...(d.extra ?? []), result];
  else d[kind] = result;
  return { state: { ...state, days: { ...state.days, [today]: d } }, result, prev, kind, day: today };
};
