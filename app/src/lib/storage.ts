import { emptyState, parseState } from "../core/state";
import type { AppState } from "../core/types";

/** Тот же ключ, что у прототипа: открытая на том же адресе версия подхватит прогресс. */
const KEY = "hr2_state";

export const loadState = (): AppState => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseState(raw) : emptyState();
  } catch {
    return emptyState();
  }
};

export const saveState = (s: AppState) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* приватный режим или переполнение — работаем в памяти */
  }
};
