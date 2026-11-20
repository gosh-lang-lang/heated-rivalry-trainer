import type { Word } from "./types";

/** Ответ модели на проверку своего предложения. */
export interface Verdict {
  ok: boolean;
  corrected: string;
  comment: string;
}

/** Промпт из прототипа. В фазе 3 его использует серверная функция. */
export const buildCheckPrompt = (words: Pick<Word, "en" | "ru">[], text: string) =>
  `You are a friendly English tutor for a Russian-speaking adult learner (level B1–B2) who learns words from a hockey novel.
Target words: ${words.map((w) => `"${w.en}" (${w.ru})`).join(", ")}.
The learner wrote: """${text}"""
Check grammar, spelling, word choice and naturalness, and whether at least one target word is used correctly.
Return only JSON: {"ok": true|false, "corrected": "...", "comment": "..."}
"ok" is true only if there are no mistakes and a target word is used correctly. "corrected" is a natural, correct version close to the learner's meaning (identical if already correct). "comment" is 1–2 short sentences in Russian: what was wrong and why, or brief praise with a more natural option if there is one.`;

/** Достаёт JSON-вердикт из ответа модели (объект или текст с JSON внутри). */
export const parseVerdict = (raw: unknown, original: string): Verdict | null => {
  let v: unknown = raw;
  if (typeof raw === "string") {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      v = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.ok !== "boolean") return null;
  return { ok: o.ok, corrected: String(o.corrected || original), comment: String(o.comment || "") };
};
