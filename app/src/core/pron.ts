/**
 * Оценка произношения (без DOM и Node API — общая для сервера и клиента).
 *
 * Сервер распознаёт звуки речи моделью wav2vec2 (фонемы espeak, IPA), а ожидаемые звуки фразы берёт из
 * espeak (тот же phonemizer, что у озвучки Kokoro). Здесь — сравнение: обе последовательности приводятся к
 * одним «атомам», выравниваются (редакционное расстояние с весами), и каждое слово получает оценку 0–100
 * и список звуков, которые прозвучали не так.
 *
 * Поблажки — акцент не ошибка: американское и британское произношение, редуцированные гласные в служебных
 * словах, «тэп» вместо t/d (better), долгота гласных без смены качества.
 */

/* ---------- атомы звуков ---------- */

/** Звуки английского, на которые делим строку IPA (длинные — раньше коротких). */
const ATOMS = [
  "tʃ", "dʒ", "aɪ", "aʊ", "ɔɪ", "eɪ", "oʊ", "əʊ",
  "iː", "uː", "ɑː", "ɔː", "ɜː", "eː", "oː", "aː",
  "p", "b", "t", "d", "k", "ɡ", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "x", "m", "n", "ŋ", "l", "ɹ", "r", "ʁ", "w", "j",
  "ɾ", "ʔ", "ɫ", "ʋ", "β", "ɣ", "ç",
  "i", "ɪ", "e", "ɛ", "æ", "a", "ɑ", "ɒ", "ɔ", "o", "ʊ", "u", "ʌ", "ə", "ɚ", "ɜ", "ᵻ", "ɐ", "ɨ", "y", "ø", "œ", "ɵ",
];
const ATOMS_BY_LEN = [...ATOMS].sort((a, b) => b.length - a.length);

/** Составные единицы модели → атомы. */
const SPLIT: Record<string, string[]> = {
  "ɑːɹ": ["ɑː", "ɹ"], "ɔːɹ": ["ɔː", "ɹ"], "oːɹ": ["oː", "ɹ"], "ɛɹ": ["ɛ", "ɹ"], "ɪɹ": ["ɪ", "ɹ"], "ʊɹ": ["ʊ", "ɹ"],
  "aɪɚ": ["aɪ", "ɚ"], "aɪə": ["aɪ", "ə"], "əl": ["ə", "l"], "ju": ["j", "u"], "ts": ["t", "s"], "th": ["t"], "kh": ["k"], "ph": ["p"],
  "n̩": ["n"], "l̩": ["l"], "r̩": ["ɹ"], "iə": ["ɪ", "ə"], "eə": ["ɛ", "ə"], "ʊə": ["ʊ", "ə"], "ɪː": ["iː"], "ʊː": ["uː"], "g": ["ɡ"],
};

/** Строка IPA одного слова → атомы. Ударения, слоговость и прочие пометки отбрасываются. */
export const ipaAtoms = (ipa: string): string[] => {
  const s = ipa.replace(/[ˈˌ'.\-‿͡]/g, "").normalize("NFC");
  const out: string[] = [];
  for (let i = 0; i < s.length; ) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    const sp = Object.keys(SPLIT).find((k) => s.startsWith(k, i) && !ATOMS_BY_LEN.some((a) => a.length > k.length && s.startsWith(a, i)));
    if (sp) {
      out.push(...SPLIT[sp]);
      i += sp.length;
      continue;
    }
    const a = ATOMS_BY_LEN.find((x) => s.startsWith(x, i));
    if (a) {
      out.push(a);
      i += a.length;
    } else i++; // диакритика и незнакомые знаки
  }
  return out;
};

/** Единица модели → атомы. */
const unitAtoms = (u: string): string[] => SPLIT[u] ?? ipaAtoms(u);

/**
 * Что выдала модель (по одной единице на отрезок после схлопывания CTC) → атомы.
 * Сомнения модели (`alt`) остаются у звука, если и он, и вариант — по одному атому.
 */
export const modelAtoms = (units: readonly (string | { u: string; alt?: string[] })[]): Heard[] =>
  units.flatMap((x) => {
    const { u, alt } = typeof x === "string" ? { u: x, alt: undefined } : x;
    const as = unitAtoms(u);
    if (as.length !== 1 || !alt?.length) return as.map((a) => ({ a }));
    const alts = alt.map(unitAtoms).filter((v) => v.length === 1).map((v) => v[0]);
    return [{ a: as[0], ...(alts.length ? { alt: alts } : {}) }];
  });

/* ---------- насколько звуки различаются ---------- */

const VOWELS = new Set(["iː", "uː", "ɑː", "ɔː", "ɜː", "eː", "oː", "aː", "aɪ", "aʊ", "ɔɪ", "eɪ", "oʊ", "əʊ",
  "i", "ɪ", "e", "ɛ", "æ", "a", "ɑ", "ɒ", "ɔ", "o", "ʊ", "u", "ʌ", "ə", "ɚ", "ɜ", "ᵻ", "ɐ", "ɨ", "y", "ø", "œ", "ɵ"]);
export const isVowel = (a: string) => VOWELS.has(a);

/** Классы — одно и то же для понимания (акцент, редукция, тэп). */
const SAME: string[][] = [
  ["ə", "ɐ", "ᵻ", "ɨ", "ɵ"],
  ["ə", "ɪ", "ᵻ"],
  ["ə", "ʌ", "ɐ"],
  // ʌ — как русское «а»: так и учат, американское и британское звучат по-разному
  ["ʌ", "ɑ", "a", "ɑː"],
  ["ɚ", "ɜː", "ɜ", "ə"],
  ["iː", "i"],
  ["uː", "u", "ʊ"],
  ["ɑː", "ɑ", "ɒ", "ɔ", "ɔː", "a", "aː"],
  ["oʊ", "əʊ", "o", "oː"],
  // score, more: британское /ɔː/ против американского /oː/
  ["oː", "ɔː", "ɔ"],
  ["eɪ", "e", "eː"],
  ["ɛ", "e"],
  ["t", "ɾ", "ʔ"],
  ["d", "ɾ"],
  ["l", "ɫ"],
  ["ɹ", "ʋ"],
];
/** Похоже, но слышно: оглушение на конце, долгий/краткий, r раскатистое. */
const CLOSE: string[][] = [
  ["p", "b"], ["t", "d"], ["k", "ɡ"], ["f", "v"], ["s", "z"], ["ʃ", "ʒ"], ["tʃ", "dʒ"], ["θ", "ð"],
  ["iː", "ɪ"], ["i", "ɪ"], ["æ", "ɛ"], ["æ", "e"], ["æ", "a"], ["æ", "ɑ"], ["ʊ", "uː"], ["ɔ", "oʊ"], ["ɒ", "oʊ"],
  ["ɹ", "r"], ["ɹ", "ʁ"], ["h", "x"], ["n", "ŋ"], ["w", "ʋ"], ["ɛ", "eɪ"], ["aɪ", "a"], ["aʊ", "a"],
];
const pairSet = (groups: string[][]) => {
  const m = new Set<string>();
  for (const g of groups) for (const a of g) for (const b of g) if (a !== b) m.add(a + "|" + b);
  return m;
};
const SAME_P = pairSet(SAME);
const CLOSE_P = pairSet(CLOSE);
/** После s глухие p, t, k без придыхания и на слух — почти b, d, g (sky, stop, spin). */
const AFTER_S: Record<string, string> = { p: "b", t: "d", k: "ɡ" };

/**
 * Услышанный звук: лучший вариант модели и другие, которые она тоже допускала (вероятность заметная).
 * Ожидаемый звук среди «других» — модель сомневалась, засчитываем почти как верный.
 */
export interface Heard {
  a: string;
  alt?: string[];
}
const ALT = 0.25;

/** Цена замены ожидаемого звука `exp` на услышанный `got`: 0 — то же, 0.5 — близко, 1 — другой звук, 1.4 — гласная вместо согласной. */
export const subCost = (exp: string, got: string, prev?: string): number => {
  if (exp === got || SAME_P.has(exp + "|" + got)) return 0;
  if (prev === "s" && AFTER_S[exp] === got) return 0;
  if (CLOSE_P.has(exp + "|" + got)) return 0.5;
  if (isVowel(exp) && isVowel(got)) return 1;
  // гласная вместо согласной (и наоборот) — дороже: выравнивание предпочтёт пропуск и лишний звук, подсказка будет точнее
  return isVowel(exp) !== isVowel(got) ? 1.4 : 1;
};
const heardCost = (exp: string, h: Heard, prev?: string): number => {
  const c = subCost(exp, h.a, prev);
  if (c === 0 || !h.alt?.length) return c;
  return Math.min(c, ...h.alt.map((x) => (subCost(exp, x, prev) === 0 ? ALT : 1)));
};
/** Пропущенный звук. */
export const DEL = 1;
/**
 * Цена пропуска: r после гласной — британское произношение (0), безударный гласный и тэп глотаются в быстрой
 * речи (½), остальное — 1.
 */
export const delCost = (exp: string, prev?: string): number => {
  if (exp === "ɹ" && prev && isVowel(prev)) return 0;
  if (exp === "ə" || exp === "ɾ" || exp === "ʔ" || exp === "ᵻ") return 0.5;
  return DEL;
};
/** Лишний звук внутри слова (на стыке слов и по краям — не считаем: вдох, «э-э»). */
export const INS = 0.5;

/* ---------- выравнивание ---------- */

export type Op =
  | { op: "ok" | "sub"; exp: string; got: string; cost: number }
  | { op: "del"; exp: string; cost: number }
  | { op: "ins"; got: string; cost: number };

const asHeard = (h: string | Heard): Heard => (typeof h === "string" ? { a: h } : h);

/**
 * Выравнивает ожидаемые звуки по словам с услышанной последовательностью.
 * Возвращает операции по словам; лишние звуки между словами и по краям в слова не идут — только в счётчик `extra`.
 */
export const align = (expected: readonly (readonly string[])[], heardIn: readonly (string | Heard)[]): { words: Op[][]; extra: number } => {
  const heard = heardIn.map(asHeard);
  const exp: { a: string; w: number; first: boolean; prev?: string }[] = [];
  expected.forEach((ws, w) => ws.forEach((a, i) => exp.push({ a, w, first: i === 0, prev: ws[i - 1] })));
  const n = exp.length,
    m = heard.length;
  // вставка перед ожидаемым звуком i почти ничего не стоит, если это начало слова (стык) или конец фразы
  const insCost = (i: number) => (i === 0 || i === n || exp[i].first ? 0.05 : INS);
  const sub = (i: number, j: number) => heardCost(exp[i].a, heard[j], exp[i].prev);
  const del = (i: number) => delCost(exp[i].a, exp[i].prev);
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let j = 1; j <= m; j++) D[0][j] = D[0][j - 1] + insCost(0);
  for (let i = 1; i <= n; i++) {
    D[i][0] = D[i - 1][0] + del(i - 1);
    for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j - 1] + sub(i - 1, j - 1), D[i - 1][j] + del(i - 1), D[i][j - 1] + insCost(i));
  }
  const ops: Op[][] = expected.map(() => []);
  let extra = 0;
  const eps = 1e-9;
  for (let i = n, j = m; i > 0 || j > 0; ) {
    if (i > 0 && j > 0 && Math.abs(D[i][j] - (D[i - 1][j - 1] + sub(i - 1, j - 1))) < eps) {
      const c = sub(i - 1, j - 1);
      ops[exp[i - 1].w].unshift({ op: c < 0.5 ? "ok" : "sub", exp: exp[i - 1].a, got: heard[j - 1].a, cost: c });
      i--, j--;
    } else if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + del(i - 1))) < eps) {
      ops[exp[i - 1].w].unshift({ op: "del", exp: exp[i - 1].a, cost: del(i - 1) });
      i--;
    } else {
      // вставка: внутри слова — в это слово, на стыке и по краям — не считаем
      if (i > 0 && i < n && !exp[i].first) ops[exp[i].w].unshift({ op: "ins", got: heard[j - 1].a, cost: INS });
      else extra++;
      j--;
    }
  }
  return { words: ops, extra };
};

/**
 * Сказано заметно больше, чем нужно (целая фраза вместо слова): лишние звуки на стыках и по краях сверх запаса
 * (3 звука или половина ожидаемых — вдох, «э-э», артикль) снижают оценку пропорционально.
 */
export const extraFactor = (expected: number, extra: number): number => {
  const over = extra - Math.max(3, expected / 2);
  return over > 0 ? expected / (expected + over) : 1;
};

/* ---------- оценка ---------- */

/** Слово выше этого — зелёное, ниже PRON_WEAK — красное. */
export const PRON_GOOD = 85;
export const PRON_WEAK = 50;
/** Порог задания: оценка фразы (или слова) не ниже. */
export const PRON_PASS = 70;

export interface PronIssue {
  /** ожидаемый звук (ошибки слова — от самой заметной) */
  exp: string;
  /** что прозвучало; "" — звука не было */
  got: string;
  /** звук — последний в слове (для подсказки про оглушение) */
  end?: boolean;
}
export interface PronWord {
  /** слово как в тексте */
  w: string;
  score: number;
  /** good ≥ PRON_GOOD, weak < PRON_WEAK, иначе so */
  mark: "good" | "so" | "weak";
  /** ожидаемые звуки слова (IPA без ударений) */
  ipa: string;
  issues: PronIssue[];
}
export interface PronResult {
  /** 0–100 */
  score: number;
  ok: boolean;
  words: PronWord[];
  /** ничего не услышали (тишина или шум) */
  silent: boolean;
}

/** Вес гласной в оценке слова (согласная — 1). */
export const VOWEL_W = 2;

/** Служебные слова: в речи редуцируются, весят вдвое меньше. */
const FUNCTION = new Set(
  "a an the to of and or but in on at for from with by as is are was were be been am do does did have has had i you he she it we they me him her us them my your his its our their this that than then so not no if into up out off over".split(" "),
);

/** Слова фразы для оценки: как в тексте, без пунктуации по краям. */
export const textWords = (text: string): string[] =>
  text
    .replace(/[“”"«»]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ""))
    .filter((w) => /[\p{L}\p{N}]/u.test(w));

const mark = (s: number): PronWord["mark"] => (s >= PRON_GOOD ? "good" : s < PRON_WEAK ? "weak" : "so");

/**
 * Итог: `words` — слова фразы (textWords), `expected` — их звуки (атомы), `heard` — что распознала модель (атомы).
 * Оценка слова — 100 × (1 − цена ошибок / число звуков), гласные — с весом VOWEL_W, не ниже 0; фразы — среднее по словам с весами
 * (служебные — ½, длинные слова весят чуть больше коротких).
 */
export const scorePron = (words: readonly string[], expected: readonly (readonly string[])[], heard: readonly (string | Heard)[]): PronResult => {
  if (!heard.length) return { score: 0, ok: false, silent: true, words: words.map((w, k) => ({ w, score: 0, mark: "weak", ipa: (expected[k] ?? []).join(""), issues: [] })) };
  const { words: ops, extra } = align(expected, heard);
  let sum = 0,
    wsum = 0;
  const out = words.map((w, k): PronWord => {
    const ex = expected[k] ?? [];
    // гласные весят вдвое: на них держится слово (mix — max), а согласные чаще съедает распознавание
    const cost = ops[k].reduce((c, o) => c + o.cost * (o.op !== "ins" && isVowel(o.exp) ? VOWEL_W : 1), 0);
    const size = ex.reduce((n, a) => n + (isVowel(a) ? VOWEL_W : 1), 0);
    const score = size ? Math.max(0, Math.round(100 * (1 - cost / size))) : 100;
    const weight = (FUNCTION.has(w.toLowerCase()) ? 0.5 : 1) * Math.sqrt(Math.max(1, ex.length));
    sum += score * weight;
    wsum += weight;
    const found: (PronIssue & { cost: number })[] = [];
    let at = 0; // номер ожидаемого звука
    for (const o of ops[k]) {
      if (o.op === "ins") continue;
      const end = at === ex.length - 1 || undefined;
      if (o.op === "sub" && o.cost >= 0.5) found.push({ exp: o.exp, got: o.got, end, cost: o.cost });
      else if (o.op === "del" && o.cost >= 0.5) found.push({ exp: o.exp, got: "", end, cost: o.cost });
      at++;
    }
    // сначала самые заметные ошибки (подсказка показывает первые)
    const issues = found.sort((a, b) => b.cost - a.cost).map(({ cost: _, ...x }) => x);
    return { w, score, mark: mark(score), ipa: ex.join(""), issues: dedupe(issues) };
  });
  const factor = extraFactor(expected.reduce((n, e) => n + e.length, 0), extra);
  if (factor < 1) for (const w of out) (w.score = Math.round(w.score * factor)), (w.mark = mark(w.score));
  const score = wsum ? Math.round((sum / wsum) * factor) : 0;
  return { score, ok: score >= PRON_PASS, silent: false, words: out };
};

const dedupe = (xs: PronIssue[]) => xs.filter((x, i) => xs.findIndex((y) => y.exp === x.exp && y.got === x.got) === i);

/* ---------- подсказки по-русски ---------- */

/** Как произносится звук — коротко, для русскоговорящего. */
const HOW: Record<string, string> = {
  θ: "кончик языка между зубами, выдох — не «с» и не «ф»",
  ð: "кончик языка между зубами, с голосом — не «з» и не «д»",
  w: "губы трубочкой, как в начале «уа» — не «в»",
  ŋ: "задняя часть языка к нёбу, через нос — без «г» в конце",
  h: "лёгкий выдох, без хрипа — не «х»",
  ɹ: "язык не касается нёба, кончик чуть загнут назад — не раскатистое «р»",
  æ: "рот широко, между «а» и «э»",
  ɪ: "короткое, ближе к «ы» — не долгое «и»",
  iː: "долгое «ии», губы в улыбке",
  ʌ: "короткое «а», рот почти не открывается",
  ɛ: "«э», рот приоткрыт чуть шире русского",
  e: "«э», рот приоткрыт чуть шире русского",
  ɔː: "долгое «о», губы округлены",
  ɔ: "«о», губы округлены",
  ɒ: "короткое «о», рот открыт широко",
  i: "«и», губы в улыбке",
  u: "«у», губы округлены",
  m: "«м»",
  n: "«н», кончик языка на бугорках за зубами",
  s: "«с», кончик языка за зубами",
  f: "«ф» — нижняя губа к верхним зубам",
  j: "«й»",
  ɑː: "долгое глубокое «а»",
  ʊ: "короткое «у», губы расслаблены",
  uː: "долгое «уу»",
  ɜː: "среднее между «ё» и «э», губы не округлять",
  ɚ: "безударное с загнутым языком, как «ə» + лёгкое r",
  ə: "безударный неясный звук — не проговаривай гласную полностью",
  eɪ: "«эй», с переходом",
  oʊ: "«оу», с переходом",
  aɪ: "«ай»",
  aʊ: "«ау»",
  ɔɪ: "«ой»",
  l: "твёрдое «л», кончик языка к бугоркам за зубами",
  tʃ: "«ч», твёрже русского",
  dʒ: "звонкое «дж», одним звуком",
  ʒ: "мягкое звонкое «ж»",
  ʃ: "мягкое «ш», губы чуть вперёд",
  v: "звонкое «в» — нижняя губа к верхним зубам",
  z: "звонкое «з» — не оглушай",
  d: "звонкое «д», кончик языка за зубами на бугорках — не оглушай",
  b: "звонкое «б» — не оглушай",
  ɡ: "звонкое «г» — не оглушай",
  t: "«т», кончик языка на бугорках за зубами, с придыханием",
  p: "«п» с придыханием",
  k: "«к» с придыханием",
};

const VOICED: Record<string, string> = { b: "p", d: "t", ɡ: "k", v: "f", z: "s", ʒ: "ʃ", dʒ: "tʃ", ð: "θ" };

/** Подсказка к ошибке: что не так и как сказать. */
export const issueHint = (x: PronIssue): string => {
  const how = HOW[x.exp] ?? "";
  if (!x.got) return `пропущен звук /${x.exp}/` + (how ? ` — ${how}` : "");
  if (VOICED[x.exp] === x.got && x.end) return `/${x.exp}/ на конце оглушился в /${x.got}/ — в английском звонкий звук на конце звонкий`;
  return `/${x.exp}/ прозвучал как /${x.got}/` + (how ? ` — ${how}` : "");
};

/* ---------- ожидаемые звуки ---------- */

/**
 * Звуки по словам из того, что выдал espeak для всей фразы (массив кусков между знаками препинания).
 * null — число слов не совпало (например, espeak слил слова), тогда звуки берут по одному слову.
 */
export const expectedFromIpa = (words: readonly string[], ipaParts: readonly string[]): string[][] | null => {
  const toks = ipaParts.flatMap((p) => p.split(/\s+/)).filter(Boolean);
  return toks.length === words.length ? toks.map(ipaAtoms) : null;
};

/** Текст для оценки: не пустой и не длиннее этого (самый длинный пример в колоде — около 120 символов). */
export const MAX_PRON_CHARS = 300;
/** Запись — не длиннее (секунд). */
export const MAX_PRON_SECONDS = 20;
export const PRON_RATE = 16000;

export const pronTextError = (text: unknown): string | null => {
  if (typeof text !== "string" || !textWords(text).length) return "нужен текст фразы";
  if (text.length > MAX_PRON_CHARS) return `текст длиннее ${MAX_PRON_CHARS} символов`;
  return null;
};
