import type { Rng, Word } from "./types";
import { shuffle } from "./rng";

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

/** Токены для «собери фразу». */
export const buildTokens = (en: string): string[] => en.replace(/[.!?]$/, "").split(" ");

/** Пример годится для сборки: без прямой речи и не длиннее 9 слов. */
export const canBuild = (w: Word): boolean => !/["“”]/.test(w.example) && w.example.split(" ").length <= 9;

/** Варианты ответа: верное слово + n−1 других с другим переводом. */
export const options = (w: Word, all: readonly Word[], rng: Rng, n = 4): string[] =>
  shuffle([w, ...shuffle(all.filter((x) => x !== w && x.ru !== w.ru), rng).slice(0, n - 1)], rng).map((x) => x.id);

export const plural = (n: number, one: string, few: string, many: string): string => {
  n = Math.abs(n) % 100;
  const k = n % 10;
  return n > 10 && n < 20 ? many : k > 1 && k < 5 ? few : k === 1 ? one : many;
};

/** Длина самого длинного куска, который нельзя перенести (по пробелам и после дефиса): по ней заголовок слова ужимается, чтобы влезть в строку. */
export const longestRun = (en: string): number => Math.max(1, ...en.split(/\s+|(?<=-)/).map((s) => s.length));
