import wordsFile from "../../words.json";
import { makeDeck } from "./core/deck";
import type { WordsFile } from "./core/types";

/** Слова — из words.json в корне репозитория. */
export const DECK = makeDeck(wordsFile as WordsFile);
