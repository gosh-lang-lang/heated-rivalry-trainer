/** Даты-ключи YYYY-MM-DD в локальном часовом поясе. */

export const dkey = (d: Date): string =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

export const todayKey = (now: Date = new Date()): string => dkey(now);

export const addDays = (k: string, n: number): string => {
  const [y, m, d] = k.split("-").map(Number);
  return dkey(new Date(y, m - 1, d + n));
};

/** «2026-11-20» → «20.11.2026» */
export const ruDate = (k: string): string => k.split("-").reverse().join(".");

/**
 * Приветствие по часам устройства: утро 5–11, день 12–16, вечер 17–22, ночь 23–4.
 * Время — местное (как у todayKey), то есть часы пользователя, а не сервера.
 */
export const greeting = (now: Date): string => {
  const h = now.getHours();
  if (h < 5 || h >= 23) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 17) return "Добрый день";
  return "Добрый вечер";
};
