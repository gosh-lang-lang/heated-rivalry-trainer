import type { Deck, WordsFile } from "./types";

export const makeDeck = (f: WordsFile): Deck => ({
  batches: f.batches,
  words: f.words,
  sentences: f.sentences,
  byId: Object.fromEntries(f.words.map((w) => [w.id, w])),
});

/** Цвет плашки картинки — по позиции слова, как в прототипе (p0…p5). */
export const picClass = (deck: Deck, id: string) => "p" + (deck.words.findIndex((w) => w.id === id) % 6);

/** Проверки целостности words.json (используются в тестах и при добавлении партий). */
export const validateDeck = (d: Deck): string[] => {
  const errs: string[] = [];
  const ids = new Set<string>();
  const batchIds = new Set(d.batches.map((b) => b.id));
  for (const w of d.words) {
    if (ids.has(w.id)) errs.push(`повтор id: ${w.id}`);
    ids.add(w.id);
    if (!batchIds.has(w.batch)) errs.push(`${w.id}: нет партии ${w.batch}`);
    if (!w.example.includes(w.blank)) errs.push(`${w.id}: blank «${w.blank}» не найден в примере`);
  }
  d.sentences.forEach((s, i) => s.words.forEach((id) => !ids.has(id) && errs.push(`фраза ${i}: нет слова ${id}`)));
  return errs;
};
