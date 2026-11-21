/**
 * Даты-ключи YYYY-MM-DD. День — в часовом поясе пользователя (IANA, например Europe/Moscow), а не в поясе устройства.
 *
 * Какой день сейчас, решает сервер (core/serverday.ts): он хранит пояс пользователя (state.tz) и сам раскладывает
 * пройденные части урока по дням. Приложение только показывает: «сейчас» — часы устройства, поправленные на разницу
 * с часами сервера (setClock — после каждого ответа сервера), пояс — state.tz (пока его нет — пояс устройства).
 * Поэтому переведённые часы устройства не сдвигают «сегодня» ни на экране, ни в сохранённом прогрессе.
 */

const fmt = new Map<string, Intl.DateTimeFormat>();
const formatter = (tz: string) => {
  let f = fmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    fmt.set(tz, f);
  }
  return f;
};
const parts = (ms: number, tz: string) => {
  const p: Record<string, string> = {};
  for (const x of formatter(tz).formatToParts(ms)) p[x.type] = x.value;
  return p;
};

/** Пояс устройства (IANA); если браузер не знает — UTC. */
export const deviceTz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** Это пояс IANA, который знает Intl (Europe/Moscow, America/New_York, UTC). */
export const isTimeZone = (tz: unknown): tz is string => {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
};

/** День момента `ms` (UTC) в поясе `tz` — с учётом перехода на летнее время. */
export const dayIn = (ms: number, tz: string): string => {
  const p = parts(ms, tz);
  return `${p.year}-${p.month}-${p.day}`;
};

/** Час (0–23) момента `ms` в поясе `tz`. */
export const hourIn = (ms: number, tz: string): number => Number(parts(ms, tz).hour) % 24;

/* ---------- часы приложения: поправка на сервер и пояс пользователя ---------- */

let offset = 0;
let zone = deviceTz();

/**
 * Часы приложения: offset — на сколько мс часы сервера впереди часов устройства (из ответа сервера), tz — пояс
 * пользователя с сервера (пустой — пояс устройства). Только в браузере: сервер берёт время и пояс явно.
 */
export const setClock = (c: { offset?: number; tz?: string }) => {
  if (c.offset !== undefined && Number.isFinite(c.offset)) offset = c.offset;
  if (c.tz !== undefined) zone = isTimeZone(c.tz) ? c.tz : deviceTz();
};
/** Пояс, по которому приложение считает дни. */
export const clockTz = () => zone;
/** Поправка на часы сервера, мс. */
export const clockOffset = () => offset;
/** «Сейчас» по часам сервера (UTC ms). */
export const clockNow = () => Date.now() + offset;
/** «Сейчас» по часам сервера. */
export const nowDate = () => new Date(clockNow());

/** День момента `d` в поясе приложения. */
export const dkey = (d: Date): string => dayIn(d.getTime(), zone);

/** Сегодня — по часам сервера в поясе пользователя (или день момента `now`). */
export const todayKey = (now: Date = nowDate()): string => dkey(now);

/** День ISO-времени в поясе приложения; null — время не разобрать. */
export const dayOfIso = (iso: string): string | null => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : dayIn(t, zone);
};

/** Календарная арифметика: k ± n дней (без поясов и летнего времени). */
export const addDays = (k: string, n: number): string => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Сколько дней от a до b (b − a). */
export const daysBetween = (a: string, b: string): number => {
  const ms = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(b) - ms(a)) / 864e5);
};

/** «2026-11-20» → «20.11.2026» */
export const ruDate = (k: string): string => k.split("-").reverse().join(".");

/**
 * Приветствие по часам устройства: утро 5–11, день 12–16, вечер 17–22, ночь 23–4.
 * Время — местное время устройства (где человек сейчас), а не пояс уроков.
 */
export const greeting = (now: Date): string => {
  const h = now.getHours();
  if (h < 5 || h >= 23) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 17) return "Добрый день";
  return "Добрый вечер";
};
