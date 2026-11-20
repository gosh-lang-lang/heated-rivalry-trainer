import wordsFile from "../../../words.json";
import { makeDeck } from "./deck";
import { emptyState } from "./state";
import type { AppState, WordsFile } from "./types";

export const deck = makeDeck(wordsFile as WordsFile);
export const TODAY = "2026-11-20";
export const state = (patch: Partial<AppState> = {}): AppState => ({ ...emptyState(), ...patch });
