/**
 * Прогрев озвучки: заранее озвучить всю колоду голосом пользователя, чтобы слово звучало сразу по нажатию,
 * а не ждало генерации на сервере. Каждый голос прогревается один раз за запуск; уже готовые файлы не трогаются.
 * Порядок: сначала сами слова (словарь, знакомство), потом примеры и фразы.
 */
import { isTtsVoice } from "../src/core/tts.ts";
import type { TtsEngine } from "./tts.ts";

interface DeckFile {
  words: { en: string; example: string }[];
  sentences: { en: string }[];
}

export const deckTexts = (deck: DeckFile): string[] => [
  ...new Set([...deck.words.map((w) => w.en), ...deck.words.map((w) => w.example), ...deck.sentences.map((s) => s.en)]),
];

export const createWarmer = (engine: TtsEngine, texts: string[], log: (msg: string) => void = console.log) => {
  const started = new Set<string>();
  /** Прогреть голос (повторный вызов для того же голоса ничего не делает). Возвращает промис окончания. */
  return (voice: string): Promise<void> | null => {
    if (!isTtsVoice(voice) || started.has(voice)) return null;
    started.add(voice);
    const todo = texts.filter((t) => !engine.has(t, voice));
    if (!todo.length) return Promise.resolve();
    const t0 = Date.now();
    return Promise.allSettled(todo.map((t) => engine.ensure(t, voice, "lo"))).then((r) => {
      const failed = r.filter((x) => x.status === "rejected").length;
      log(`прогрев ${voice}: ${todo.length} фраз за ${Math.round((Date.now() - t0) / 1000)} с${failed ? `, ошибок: ${failed}` : ""}`);
    });
  };
};
