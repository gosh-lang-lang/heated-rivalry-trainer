import { addDays } from "./dates";
import { shuffle } from "./rng";
import { dueList, learned, unseen } from "./srs";
import { canBuild, plural } from "./text";
import type { AppState, Deck, Rng, Step, Word } from "./types";

/** Шаг без номера: номера проставляются в конце сборки плана. */
type Draft = Step extends infer S ? (S extends Step ? Omit<S, "k"> : never) : never;

const number = (drafts: Draft[]): Step[] => drafts.map((d, k) => ({ ...d, k }) as Step);

export const BLOCK = 6;
/** Повторений в разминке части 1 (короткие задания, ~5–6 минут). */
export const MAX_REVIEW = 40;
/** Повторений в части 2 — то, что не поместилось в часть 1. */
export const MAX_EVENING_REVIEW = 20;
export const MAX_EVENING_TYPE = 12;

/* ---------- темп новых слов ---------- */

/** Больше стольких повторений на сегодня — новых слов нет: сначала разбираем очередь. */
export const QUEUE_STOP = MAX_REVIEW + MAX_EVENING_REVIEW;
/** Больше стольких — только один блок новых. */
export const QUEUE_SLOW = 20;
/** Окно и минимум данных для точности на повторениях. */
export const ACC_DAYS = 7;
export const ACC_MIN = 20;
/** Цель — 85–90% верно на повторениях. Ниже 80% — слишком быстро, выше 95% — можно быстрее. */
export const ACC_LOW = 0.8;
export const ACC_HIGH = 0.95;
export const MAX_NEW = 24;

/** Точность на повторениях за последние `days` дней (часть 1, часть 2, «ещё 6»). */
export const reviewAccuracy = (state: AppState, today: string, days = ACC_DAYS) => {
  let right = 0,
    total = 0;
  for (let i = 0; i < days; i++) {
    const d = state.days[addDays(today, -i)];
    if (!d) continue;
    for (const r of [d.morning, d.evening, ...(d.extra ?? [])]) {
      if (!r?.revTotal) continue;
      right += r.revScore ?? 0;
      total += r.revTotal;
    }
  }
  return { right, total, pct: total ? right / total : null };
};

export interface NewToday {
  /** сколько новых слов дать в части 1 */
  n: number;
  /** почему меньше или больше настройки — для главной; пусто, если по настройке */
  why: string;
  /** повторений на сегодня */
  due: number;
}

/**
 * Сколько новых слов сегодня. Учитель решает сам:
 * - очередь повторений больше QUEUE_STOP — новых нет; больше QUEUE_SLOW — не больше одного блока;
 * - точность на повторениях за неделю ниже 80% — один блок; выше 95% — на блок больше настройки.
 */
export const newToday = (deck: Deck, state: AppState, today: string): NewToday => {
  const due = dueList(deck.words, state.srs, today).length;
  const left = unseen(deck.words, state.srs).length;
  const set = state.settings.newPerDay;
  let n = set,
    why = "";
  const acc = reviewAccuracy(state, today);
  if (acc.pct !== null && acc.total >= ACC_MIN) {
    const p = Math.round(acc.pct * 100);
    if (acc.pct < ACC_LOW && set > BLOCK) [n, why] = [BLOCK, `на повторениях ${p}% верно — сбавим темп`];
    else if (acc.pct >= ACC_HIGH && set < MAX_NEW) [n, why] = [set + BLOCK, `на повторениях ${p}% верно — можно больше`];
  }
  if (due > QUEUE_STOP) [n, why] = [0, `сначала разберём повторения`];
  else if (due > QUEUE_SLOW && n > BLOCK) [n, why] = [BLOCK, `много повторений — сегодня только ${BLOCK} новых`];
  return { n: Math.min(n, left), why: n > left ? "" : why, due };
};

/**
 * Лестница для блока новых слов:
 * intro ×N → pick ×N → pairs → listen ×⌈N/2⌉ → type с подсказкой ×N → build-listen ×3.
 * Фразы при первой встрече собирают на слух (перевод — после ответа): звук и порядок слов запоминаются лучше.
 * Собрать по переводу (вспомнить без звука) — позже, на повторении (reviewStep).
 */
export const blockSteps = (block: Word[], known: Word[], deck: Deck, rng: Rng): Draft[] => {
  const st: Draft[] = [];
  block.forEach((w) => st.push({ t: "intro", w: w.id }));
  shuffle(block, rng).forEach((w) => st.push({ t: "pick", w: w.id }));
  if (block.length >= 3) st.push({ t: "pairs", ws: block.map((w) => w.id) });
  shuffle(block, rng)
    .slice(0, Math.ceil(block.length / 2))
    .forEach((w) => st.push({ t: "listen", w: w.id }));
  shuffle(block, rng).forEach((w) => st.push({ t: "type", w: w.id, hint: true }));

  // фразы из банка: все слова уже известны, хотя бы одно — из этого блока
  const inBlock = new Set(block.map((w) => w.id));
  const ok = new Set([...known.map((w) => w.id), ...inBlock]);
  const bank = shuffle(
    deck.sentences.filter((s) => s.words.every((id) => ok.has(id)) && s.words.some((id) => inBlock.has(id))),
    rng,
  ).slice(0, 2);
  bank.forEach((s) => st.push({ t: "build-listen", en: s.en, ru: s.ru }));
  shuffle(block.filter(canBuild), rng)
    .slice(0, 3 - bank.length)
    .forEach((w) => st.push({ t: "build-listen", en: w.example, ru: w.exampleRu, w: w.id }));
  return st;
};

/** На уровне 2 такая доля слов (с подходящим примером) — «Собери фразу» по переводу, остальные — узнать. */
export const REVIEW_BUILD_SHARE = 0.5;

/**
 * Повторение: чем выше уровень, тем активнее задание.
 * 1 — узнать (выбор перевода или на слух); 2 — узнать или собрать пример по переводу (вспомнить порядок слов без звука —
 * следующая ступень после сборки на слух при знакомстве); 3 — вписать в пропуск с подсказкой, 4+ — без подсказки.
 */
const reviewStep = (w: Word, l: number, rng: Rng): Draft => {
  if (l >= 3) return { t: "type", w: w.id, rev: true, hint: l < 4 };
  if (l === 2 && canBuild(w) && rng() < REVIEW_BUILD_SHARE) return { t: "build", en: w.example, ru: w.exampleRu, w: w.id, rev: true };
  return { t: rng() < 0.5 ? "pick" : "listen", w: w.id, rev: true };
};

export interface MorningOptions {
  /** «Ещё 6 новых» — только блок новых слов, без повторения */
  extra?: boolean;
  rng?: Rng;
}

export const morningPlan = (deck: Deck, state: AppState, today: string, opts: MorningOptions = {}): Step[] => {
  const rng = opts.rng ?? Math.random;
  const { srs } = state;
  const due = opts.extra ? [] : dueList(deck.words, srs, today).slice(0, MAX_REVIEW);
  const fresh = unseen(deck.words, srs).slice(0, opts.extra ? BLOCK : newToday(deck, state, today).n);
  const st: Draft[] = [];

  if (due.length) {
    st.push({
      t: "section",
      pic: "🔁",
      title: "Разминка: повторение",
      sub: `${due.length} ${plural(due.length, "слово", "слова", "слов")} пора освежить`,
    });
    shuffle(due, rng).forEach((w) => st.push(reviewStep(w, srs[w.id].lvl, rng)));
  }

  const known = learned(deck.words, srs);
  for (let i = 0; i < fresh.length; i += BLOCK) {
    const block = fresh.slice(i, i + BLOCK);
    st.push({
      t: "section",
      pic: "🏒",
      title: fresh.length > BLOCK ? `Новые слова · блок ${i / BLOCK + 1}` : "Новые слова",
      sub: block.map((w) => w.en).join(" · "),
    });
    st.push(...blockSteps(block, known.concat(fresh.slice(0, i)), deck, rng));
  }
  return number(st);
};

/**
 * «Пройти все слова» (урок или «Трудные» в словаре): по одному заданию на слово — как на повторении,
 * по уровню слова (не начатое — как уровень 1); ошибка вернёт задание в конец. Уровни не меняются (drill).
 */
export const drillPlan = (deck: Deck, state: AppState, ids: readonly string[], title: string, rng: Rng = Math.random): Step[] => {
  const ws = ids.map((id) => deck.byId[id]).filter((w): w is Word => !!w);
  if (!ws.length) return [];
  const st: Draft[] = [{ t: "section", pic: "🏒", title, sub: `${ws.length} ${plural(ws.length, "слово", "слова", "слов")} подряд — тренировка: уровни и даты повтора не меняются` }];
  shuffle(ws, rng).forEach((w) => st.push(reviewStep(w, Math.max(1, state.srs[w.id]?.lvl ?? 1), rng)));
  return number(st);
};

/** Слова урока дня `day`: те, с которыми познакомились в этот день (в порядке колоды). */
export const lessonWords = (deck: Deck, srs: AppState["srs"], day: string): Word[] => deck.words.filter((w) => srs[w.id]?.intro === day);

/** Слова для части 2 урока дня `day`: выученные в этот день, иначе 12 последних по дате знакомства. */
export const eveningWords = (deck: Deck, srs: AppState["srs"], day: string): Word[] => {
  const ws = lessonWords(deck, srs, day);
  if (ws.length) return ws;
  return deck.words
    .filter((w) => srs[w.id]?.intro)
    .sort((a, b) => (srs[a.id].intro < srs[b.id].intro ? 1 : srs[a.id].intro > srs[b.id].intro ? -1 : 0))
    .slice(0, MAX_EVENING_TYPE);
};

/**
 * Часть 2 урока (данные — «evening»): повторения, не поместившиеся в часть 1 → type без подсказок → speak ×2 → reread.
 * `day` — день урока: слова урока — выученные в этот день (часть 2, перенесённая со вчера, — вчерашние);
 * повторения — на сегодня (`today`), без слов самого урока: их проверит «впиши».
 */
export const eveningPlan = (deck: Deck, state: AppState, today: string, rng: Rng = Math.random, day: string = today): Step[] => {
  const ws = eveningWords(deck, state.srs, day);
  if (!ws.length) return [];
  const st: Draft[] = [];
  const inLesson = new Set(ws.map((w) => w.id));
  const due = dueList(deck.words, state.srs, today)
    .filter((w) => !inLesson.has(w.id))
    .slice(0, MAX_EVENING_REVIEW);
  if (due.length) {
    st.push({ t: "section", pic: "🔁", title: "Повторение", sub: `${due.length} ${plural(due.length, "слово", "слова", "слов")} ещё ждут повторения` });
    shuffle(due, rng).forEach((w) => st.push(reviewStep(w, state.srs[w.id].lvl, rng)));
  }
  st.push({ t: "section", pic: "🧠", title: "Проверка без подсказок", sub: "Слова из части 1: вспомни и впиши" });
  shuffle(ws, rng)
    .slice(0, MAX_EVENING_TYPE)
    .forEach((w) => st.push({ t: "type", w: w.id, hint: false, eve: true }));

  st.push({ t: "section", pic: "🎙️", title: "Скажи вслух", sub: "Послушай и повтори фразу" });
  st.push({ t: "speak", w: ws[0].id }, { t: "speak", w: (ws[1] ?? ws[0]).id });

  const batches = [...new Set(ws.map((w) => w.batch))];
  st.push({ t: "reread", pages: batches.map((b) => deck.batches.find((x) => x.id === b)?.pages ?? `партия ${b}`) });
  return number(st);
};
