import { shuffle } from "./rng";
import { dueList, learned, unseen } from "./srs";
import { canBuild, plural } from "./text";
import type { AppState, Deck, Rng, Step, Word } from "./types";

/** Шаг без номера: номера проставляются в конце сборки плана. */
type Draft = Step extends infer S ? (S extends Step ? Omit<S, "k"> : never) : never;

const number = (drafts: Draft[]): Step[] => drafts.map((d, k) => ({ ...d, k }) as Step);

export const BLOCK = 6;
export const MAX_REVIEW = 20;
export const MAX_EVENING_TYPE = 12;

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

export interface MorningOptions {
  /** «Ещё 6 новых» — только блок новых слов, без повторения */
  extra?: boolean;
  rng?: Rng;
}

export const morningPlan = (deck: Deck, state: AppState, today: string, opts: MorningOptions = {}): Step[] => {
  const rng = opts.rng ?? Math.random;
  const { srs } = state;
  const due = opts.extra ? [] : dueList(deck.words, srs, today).slice(0, MAX_REVIEW);
  const fresh = unseen(deck.words, srs).slice(0, opts.extra ? BLOCK : state.settings.newPerDay);
  const st: Draft[] = [];

  if (due.length) {
    st.push({
      t: "section",
      pic: "🔁",
      title: "Разминка: повторение",
      sub: `${due.length} ${plural(due.length, "слово", "слова", "слов")} пора освежить`,
    });
    shuffle(due, rng).forEach((w) => {
      const l = srs[w.id].lvl;
      if (l >= 3) st.push({ t: "type", w: w.id, rev: true, hint: l < 4 });
      else st.push({ t: rng() < 0.5 ? "pick" : "listen", w: w.id, rev: true });
    });
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

/**
 * Слова для своих предложений: до 3 предложений по 1–2 ходовых слова из сегодняшних
 * и не больше одного — с редким словом, которое уже на уровне 3+ (любое из колоды).
 * Редкие слова, выученные сегодня, в предложения не идут.
 */
export const writeGroups = (deck: Deck, srs: AppState["srs"], ws: Word[], rng: Rng): string[][] => {
  const rare = shuffle(
    deck.words.filter((w) => w.rare && (srs[w.id]?.lvl ?? 0) >= RARE_WRITE_LVL),
    rng,
  )[0];
  const pool = shuffle(ws.filter((w) => !w.rare), rng);
  const groups: string[][] = [];
  for (let n = 0; n < MAX_WRITE - (rare ? 1 : 0) && pool.length; n++) groups.push(pool.splice(0, Math.min(2, pool.length)).map((w) => w.id));
  if (rare) groups.push([rare.id]);
  return groups;
};

/** Вечер: type без подсказок → write ×3 → speak ×2 → reread. */
export const eveningPlan = (deck: Deck, state: AppState, today: string, rng: Rng = Math.random): Step[] => {
  const ws = eveningWords(deck, state.srs, today);
  if (!ws.length) return [];
  const st: Draft[] = [{ t: "section", pic: "🧠", title: "Проверка без подсказок", sub: "Утренние слова: вспомни и впиши" }];
  shuffle(ws, rng)
    .slice(0, MAX_EVENING_TYPE)
    .forEach((w) => st.push({ t: "type", w: w.id, hint: false, eve: true }));

  const writes = writeGroups(deck, state.srs, ws, rng);
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
