import type { Rng, Word } from "./types";
import { shuffle } from "./rng.ts";

export const norm = (s: string): string =>
  String(s)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const lev = (a: string, b: string): number => {
  const m = a.length,
    n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
};

/** Ответ в «впиши»: после нормализации; для слов длиннее 5 букв прощаем одну опечатку. */
export const checkTyped = (input: string, answer: string): { ok: boolean; typo: boolean } => {
  const a = norm(input),
    b = norm(answer);
  if (a === b) return { ok: true, typo: false };
  if (b.length > 5 && lev(a, b) === 1) return { ok: true, typo: true };
  return { ok: false, typo: false };
};

/** Предложение с пропуском: [до, после]. */
export const gapSentence = (example: string, blank: string): [string, string] => {
  const i = example.indexOf(blank);
  if (i < 0) return [example + " ", ""];
  return [example.slice(0, i), example.slice(i + blank.length)];
};

/** Говорение: доля слов фразы, которые прозвучали. Порог — 80%. */
export const speakScore = (target: string, heard: string) => {
  const tw = norm(target).split(" ").filter(Boolean);
  const gw = new Set(norm(heard).split(" "));
  const miss = tw.filter((x) => !gw.has(x));
  const ratio = tw.length ? 1 - miss.length / tw.length : 0;
  return { ratio, miss, ok: ratio >= 0.8 };
};

/** Токены для «собери фразу». */
export const buildTokens = (en: string): string[] => en.replace(/[.!?]$/, "").split(" ");

/** Пример годится для сборки: без прямой речи и не длиннее 9 слов. */
export const canBuild = (w: Word): boolean => !/["“”]/.test(w.example) && w.example.split(" ").length <= 9;

/** Насколько слова различаются на письме (а значит, и на слух): 0 — одинаковые; разное число слов — дальше. */
export const formDistance = (a: string, b: string): number => {
  const x = norm(a),
    y = norm(b);
  const words = Math.abs(x.split(" ").length - y.split(" ").length);
  return lev(x, y) / Math.max(x.length, y.length, 1) + 0.4 * words;
};

/**
 * Варианты ответа: верное слово + n−1 отвлекающих — с другим переводом и другим написанием.
 * Отвлекающие берём из слов, которые человек уже учит (known: знакомые по прогрессу и слова этого занятия),
 * а из них — похожие на ответ: иначе в «Что ты слышишь?» ответ угадывается без звука — он единственный знакомый
 * (жалоба 21.11.2026). Похожих берём вдвое больше нужного и выбираем из них случайно — чтобы набор не повторялся.
 * Знакомых не хватает (первые занятия) — добираем похожими из остальной колоды. Без known — вся колода «знакома».
 */
export const options = (w: Word, all: readonly Word[], rng: Rng, known?: ReadonlySet<string>, n = 4): string[] => {
  const need = n - 1;
  const cand = all.filter((x) => x.id !== w.id && x.ru !== w.ru && norm(x.en) !== norm(w.en));
  const near = (xs: Word[]) =>
    xs
      .map((x) => ({ x, d: formDistance(x.en, w.en) }))
      .sort((a, b) => a.d - b.d)
      .map((e) => e.x);
  const fam = near(known ? cand.filter((x) => known.has(x.id)) : cand);
  const rest = known ? near(cand.filter((x) => !known.has(x.id))) : [];
  const picked: Word[] = [];
  const take = (xs: Word[]) => {
    for (const x of xs) {
      if (picked.length >= need) return;
      if (!picked.includes(x) && !picked.some((p) => p.ru === x.ru || norm(p.en) === norm(x.en))) picked.push(x);
    }
  };
  take(shuffle(fam.slice(0, 2 * need), rng));
  take(fam);
  take(shuffle(rest.slice(0, 2 * need), rng));
  take(rest);
  return shuffle([w, ...picked], rng).map((x) => x.id);
};

/** «18:30» — местное время. */
export const hhmm = (d: Date): string => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");

/** Месяцы в родительном падеже: «24 ноября». */
export const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"] as const;

export const plural = (n: number, one: string, few: string, many: string): string => {
  n = Math.abs(n) % 100;
  const k = n % 10;
  return n > 10 && n < 20 ? many : k > 1 && k < 5 ? few : k === 1 ? one : many;
};

/** Длина самого длинного куска, который нельзя перенести (по пробелам и после дефиса): по ней заголовок слова ужимается, чтобы влезть в строку. */
export const longestRun = (en: string): number => Math.max(1, ...en.split(/\s+|(?<=-)/).map((s) => s.length));
