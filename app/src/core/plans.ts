import { addDays } from "./dates";
import { shuffle } from "./rng";
import { dueList, learned, unseen } from "./srs";
import { canBuild, plural } from "./text";
import type { AppState, Deck, Rng, Step, Word } from "./types";

/** Шаг без номера: номера проставляются в конце сборки плана. */
type Draft = Step extends infer S ? (S extends Step ? Omit<S, "k"> : never) : never;

const number = (drafts: Draft[]): Step[] => drafts.map((d, k) => ({ ...d, k }) as Step);

export const BLOCK = 6;
/** Повторений в утренней разминке (короткие задания, ~5–6 минут). */
export const MAX_REVIEW = 40;
/** Повторений вечером — то, что не поместилось утром. */
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

/** Точность на повторениях за последние `days` дней (утро, вечер, «ещё 6»). */
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
  /** сколько новых слов дать утром */
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
 * intro ×N → pick ×N → pairs → listen ×⌈N/2⌉ → type с подсказкой ×N → build ×3.
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
  bank.forEach((s) => st.push({ t: "build", en: s.en, ru: s.ru }));
  shuffle(block.filter(canBuild), rng)
    .slice(0, 3 - bank.length)
    .forEach((w) => st.push({ t: "build", en: w.example, ru: w.exampleRu, w: w.id }));
  return st;
};

/**
 * Повторение: чем выше уровень, тем активнее задание.
 * 1–2 — узнать (выбор перевода или на слух), 3 — вписать в пропуск с подсказкой, 4+ — без подсказки.
 * Своё предложение и речь для слов уровня 5+ — вечером (writeGroups).
 */
const reviewStep = (w: Word, l: number, rng: Rng): Draft =>
  l >= 3 ? { t: "type", w: w.id, rev: true, hint: l < 4 } : { t: rng() < 0.5 ? "pick" : "listen", w: w.id, rev: true };

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

/** Слова для вечера: выученные сегодня, иначе 12 последних по дате знакомства. */
export const eveningWords = (deck: Deck, srs: AppState["srs"], today: string): Word[] => {
  const ws = deck.words.filter((w) => srs[w.id]?.intro === today);
  if (ws.length) return ws;
  return deck.words
    .filter((w) => srs[w.id]?.intro)
    .sort((a, b) => (srs[a.id].intro < srs[b.id].intro ? 1 : srs[a.id].intro > srs[b.id].intro ? -1 : 0))
    .slice(0, MAX_EVENING_TYPE);
};

export const MAX_WRITE = 3;
/** С какого уровня редкое слово попадает в «своё предложение» — когда его уже уверенно вспоминают. */
export const RARE_WRITE_LVL = 3;
/** С какого уровня ходовое слово снова идёт в своё предложение и речь — активное применение через недели. */
export const OLD_WRITE_LVL = 5;

/** Когда со словом последний раз писали своё предложение (по state.sent; "" — никогда). */
const lastWritten = (state: AppState) => {
  const m: Record<string, string> = {};
  for (const s of state.sent) for (const en of s.words) if (!m[en] || s.at > m[en]) m[en] = s.at;
  return m;
};

/**
 * Слова для своих предложений, до 3:
 * 1) 1–2 ходовых слова из сегодняшних;
 * 2) одно «старое» ходовое слово уровня 5+ — то, с которым дольше всех не писали (применение через недели);
 * 3) одно редкое слово уровня 3+, если есть, иначе ещё пара сегодняшних ходовых.
 * Редкие слова, выученные сегодня, в предложения не идут.
 */
export const writeGroups = (deck: Deck, state: AppState, ws: Word[], rng: Rng): string[][] => {
  const { srs } = state;
  const lvl = (w: Word) => srs[w.id]?.lvl ?? 0;
  const today = new Set(ws.map((w) => w.id));
  const lw = lastWritten(state);
  const old = shuffle(
    deck.words.filter((w) => !w.rare && !today.has(w.id) && lvl(w) >= OLD_WRITE_LVL),
    rng,
  ).sort((a, b) => ((lw[a.en] ?? "") < (lw[b.en] ?? "") ? -1 : (lw[a.en] ?? "") > (lw[b.en] ?? "") ? 1 : 0))[0];
  const rare = shuffle(
    deck.words.filter((w) => w.rare && !today.has(w.id) && lvl(w) >= RARE_WRITE_LVL),
    rng,
  )[0];
  const pool = shuffle(ws.filter((w) => !w.rare), rng);
  const pair = () => (pool.length ? pool.splice(0, Math.min(2, pool.length)).map((w) => w.id) : null);

  const groups: string[][] = [];
  const add = (g: string[] | null | undefined) => g && groups.length < MAX_WRITE && groups.push(g);
  add(pair());
  add(old && [old.id]);
  add(rare && [rare.id]);
  while (groups.length < MAX_WRITE && pool.length) add(pair());
  return groups;
};

/** Вечер: type без подсказок → write ×3 → speak ×2 → reread. */
export const eveningPlan = (deck: Deck, state: AppState, today: string, rng: Rng = Math.random): Step[] => {
  const ws = eveningWords(deck, state.srs, today);
  if (!ws.length) return [];
  const st: Draft[] = [];
  const due = dueList(deck.words, state.srs, today).slice(0, MAX_EVENING_REVIEW);
  if (due.length) {
    st.push({ t: "section", pic: "🔁", title: "Повторение", sub: `${due.length} ${plural(due.length, "слово", "слова", "слов")} не поместились утром` });
    shuffle(due, rng).forEach((w) => st.push(reviewStep(w, state.srs[w.id].lvl, rng)));
  }
  st.push({ t: "section", pic: "🧠", title: "Проверка без подсказок", sub: "Утренние слова: вспомни и впиши" });
  shuffle(ws, rng)
    .slice(0, MAX_EVENING_TYPE)
    .forEach((w) => st.push({ t: "type", w: w.id, hint: false, eve: true }));

  const writes = writeGroups(deck, state, ws, rng);
  if (writes.length) {
    st.push({ t: "section", pic: "✍️", title: "Своё предложение", sub: "Напиши о своей жизни — я проверю" });
    writes.forEach((g, n) => st.push({ t: "write", ws: g, n }));
  }

  st.push({ t: "section", pic: "🎙️", title: "Скажи вслух", sub: "Послушай и повтори фразу" });
  const sw = (n: number) => writes[n]?.[0] ?? (ws[n] ?? ws[0]).id;
  st.push({ t: "speak", n: 0, w: sw(0) }, { t: "speak", n: 1, w: sw(1) });

  const batches = [...new Set(ws.map((w) => w.batch))];
  st.push({ t: "reread", pages: batches.map((b) => deck.batches.find((x) => x.id === b)?.pages ?? `партия ${b}`) });
  return number(st);
};
