import { clockNow, nowDate } from "./dates";
import { applyGrade, introduce } from "./srs";
import type { AppState, SavedRun, SentenceRecord, SessionKind, SessionResult, Step } from "./types";

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

export const startSession = (kind: SessionKind, steps: Step[], now = clockNow()): Session | null =>
  steps.length ? { kind, steps, i: 0, graded: 0, right: 0, revGraded: 0, revRight: 0, first: [], newIds: [], written: {}, t0: now } : null;

export const currentStep = (s: Session): Step | undefined => s.steps[s.i];

export const progress = (s: Session) => Math.min(s.i / s.steps.length, 1);

/* ---------- незаконченная часть урока: сохранить, продолжить, начать заново ---------- */

/** Какие занятия сохраняются для «Продолжить»: части 1 и 2 урока (не «ещё 6 новых» и не тренировка). */
export const savable = (kind: SessionKind): kind is SavedRun["kind"] => kind === "morning" || kind === "evening";

/**
 * Сохранить занятие в прогресс (state.run). `at` — с какого шага продолжить: после ответа — следующий,
 * ответ уже засчитан (srs, счёт); иначе — текущий. `now` — метка для слияния (runAt), строго растёт.
 */
export const saveRun = (
  state: AppState,
  sess: Session,
  o: { day: string; date: string; seed: number; at?: number },
  now = clockNow(),
): AppState => {
  if (!savable(sess.kind)) return state;
  const run: SavedRun = {
    kind: sess.kind,
    day: o.day,
    date: o.date,
    seed: o.seed,
    steps: sess.steps,
    i: Math.min(o.at ?? sess.i, sess.steps.length),
    graded: sess.graded,
    right: sess.right,
    revGraded: sess.revGraded,
    revRight: sess.revRight,
    first: sess.first,
    newIds: sess.newIds,
    written: sess.written,
    t0: sess.t0,
  };
  return { ...state, run, runAt: Math.max(now, state.runAt + 1) };
};

/** Занятие закончено — сохранённого больше нет (метка нужна, чтобы «закончено» победило при слиянии). */
export const clearRun = (state: AppState, now = clockNow()): AppState =>
  state.run ? { ...state, run: null, runAt: Math.max(now, state.runAt + 1) } : state;

/**
 * Сохранённая часть, которую можно продолжить: того же вида и дня урока, начатая сегодня (`today`) и ещё не пройденная.
 * С прошлого дня — нет: на новый день часть начинается заново (план строится по сегодняшним повторениям).
 */
export const resumable = (state: AppState, kind: SessionKind, day: string, today: string): SavedRun | null => {
  const r = state.run;
  if (!r || r.kind !== kind || r.day !== day || r.date !== today) return null;
  if (state.days[day]?.[r.kind]) return null; // уже пройдена (например, на другом устройстве)
  return r;
};

/** Где остановились: «12 из 38» — номер шага, с которого продолжим, и всего шагов. */
export const runPosition = (r: SavedRun) => ({ n: Math.min(r.i + 1, r.steps.length), of: r.steps.length });

/**
 * Занятие из сохранённого. restart — «Начать заново»: те же шаги с первого (без добавленных повторов);
 * счёт и отметки «уже отвечал» (first) остаются — второй проход ответы не засчитывает (srs и счёт меняет только первая попытка).
 * savedAt — когда часть сохранили последний раз (state.runAt): перерыв между уходом и «Продолжить» в минуты занятия
 * не идёт — t0 сдвигается так, чтобы до сохранения прошло столько же, сколько прошло на самом деле.
 */
export const restoreSession = (r: SavedRun, restart = false, savedAt?: number, now = clockNow()): Session => {
  const steps = restart ? r.steps.filter((s) => !s.retry) : r.steps;
  // ответ на последний шаг сохранён, а «Дальше» не нажали — откроем последний шаг снова (повторно он не засчитается)
  const i = restart ? 0 : Math.min(r.i, steps.length - 1);
  return {
    kind: r.kind,
    steps,
    i,
    graded: r.graded,
    right: r.right,
    revGraded: r.revGraded,
    revRight: r.revRight,
    first: r.first,
    newIds: r.newIds,
    written: r.written,
    t0: savedAt ? now - Math.max(0, savedAt - r.t0) : r.t0,
  };
};

/** Свой «случай» для шага: варианты ответа, пары и плитки — те же при продолжении. Повтор шага — другой. */
export const stepSeed = (seed: number, step: Pick<Step, "k" | "retry">) => (seed ^ Math.imul(step.k + 1, 0x9e3779b1) ^ (step.retry ? 0x5bd1e995 : 0)) >>> 0;

const NO_RETRY = new Set<Step["t"]>(["write", "speak", "pairs", "section", "intro", "reread"]);

/**
 * Ответ на текущий шаг.
 * Счёт — по первой попытке: повтор того же шага (retry) в счёт не идёт.
 * SRS слова меняется только на первой попытке (и никогда — в тренировке drill).
 * Ошибка → копия шага в конец занятия (один раз; не для write/speak/pairs).
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

/**
 * Итог занятия → state.days[today]. Для части 2, перенесённой со вчера, `today` — день урока.
 * День здесь предварительный: сервер проверит его по своим часам и, если надо, переложит (core/serverday.ts).
 * `now` — часы устройства, поправленные на сервер.
 */
export const finishSession = (sess: Session, state: AppState, today: string, now = nowDate()): Finished => {
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

/**
 * Слова, которые человек уже учит: знакомые по прогрессу и все слова этого занятия.
 * Из них — отвлекающие варианты в «Выбери перевод» и «Что ты слышишь?» (core/text.ts options).
 */
export const studiedIds = (state: Pick<AppState, "srs">, steps: readonly Step[]): Set<string> => {
  const ids = new Set(Object.keys(state.srs));
  for (const s of steps) {
    if ("w" in s && s.w) ids.add(s.w);
    if ("ws" in s) s.ws.forEach((id) => ids.add(id));
  }
  return ids;
};
