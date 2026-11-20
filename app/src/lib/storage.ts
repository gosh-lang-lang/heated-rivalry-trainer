import { emptyState, parseState } from "../core/state";
import type { AppState } from "../core/types";

/**
 * Кэш прогресса на устройстве. Главная копия — на сервере (sync.ts); кэш нужен, чтобы приложение
 * открывалось мгновенно и работало без сети. У каждого пользователя свой ключ: на общем устройстве
 * чужой прогресс не попадёт на сервер под другим именем.
 */
const LEGACY = "hr2_state";
const LAST_USER = "hr2_user";
const LAST_NAME = "hr2_user_name";

export const cacheKey = (user: string | null) => (user ? `${LEGACY}:${user}` : LEGACY);

const read = (key: string): AppState | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parseState(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Прогресс из кэша. Прогресс времён, когда всё жило только в браузере (ключ hr2_state),
 * забирает себе первый вошедший на этом устройстве — дальше он уходит на сервер.
 */
export const loadState = (user: string | null): AppState => {
  const own = read(cacheKey(user));
  if (own || !user) return own ?? emptyState();
  const legacy = read(LEGACY);
  if (!legacy) return emptyState();
  saveState(user, legacy);
  try {
    localStorage.removeItem(LEGACY);
  } catch {
    /* не страшно */
  }
  return legacy;
};

export const saveState = (user: string | null, s: AppState) => {
  try {
    localStorage.setItem(cacheKey(user), JSON.stringify(s));
  } catch {
    /* приватный режим или переполнение — работаем в памяти */
  }
};

/** Кто входил последним — чтобы без сети открыть его кэш. */
export const lastUser = (): string | null => {
  try {
    return localStorage.getItem(LAST_USER);
  } catch {
    return null;
  }
};
/** Как зовут последнего вошедшего (для приветствия без сети). */
export const lastUserName = (): string | null => {
  try {
    return localStorage.getItem(LAST_NAME);
  } catch {
    return null;
  }
};
export const rememberUser = (user: string, displayName?: string) => {
  try {
    localStorage.setItem(LAST_USER, user);
    if (displayName) localStorage.setItem(LAST_NAME, displayName);
  } catch {
    /* не страшно */
  }
};

/** Настройки из кэша, без побочных эффектов (до первой отрисовки — чтобы сразу показать своё оформление). */
export const peekSettings = (user: string | null) => (read(cacheKey(user)) ?? read(LEGACY) ?? emptyState()).settings;
