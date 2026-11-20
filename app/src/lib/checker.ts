import { parseVerdict, type Verdict } from "../core/check";
import type { Word } from "../core/types";

/**
 * Проверка своего предложения.
 * Фаза 3: серверная функция (VITE_CHECK_URL) строит промпт через core/check.ts и ходит в Anthropic API —
 * ключ только на сервере. Клиент шлёт только { words, text }.
 * Пока адреса нет, возвращаем null, и предложение сохраняется как «на проверке».
 */
const URL_ = import.meta.env.VITE_CHECK_URL as string | undefined;

export const checkerAvailable = !!URL_;

export const checkSentence = async (words: Word[], text: string): Promise<Verdict | null> => {
  if (!URL_) return null;
  try {
    const r = await fetch(URL_, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ words: words.map((w) => ({ en: w.en, ru: w.ru })), text }),
    });
    if (!r.ok) return null;
    return parseVerdict(await r.json(), text);
  } catch {
    return null;
  }
};
