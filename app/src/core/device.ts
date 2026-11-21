/**
 * Устройства, на которых выполнен вход (настройки → «Вход»): понятное имя по User-Agent и время «когда был».
 * Чистые функции — их зовут и сервер (server/auth.ts, cli.ts), и интерфейс.
 */
import { hhmm, MONTHS_GEN, plural } from "./text.ts";

export type DeviceKind = "phone" | "tablet" | "computer";

/**
 * Подсказка от самого браузера (POST /api/auth/device). Только флаги — никакого свободного текста:
 *  touch — сенсорный экран (iPadOS Safari притворяется Mac, отличить можно только так);
 *  standalone — открыто как установленное приложение (PWA с экрана «Домой» / из Dock).
 */
export interface DeviceHint {
  touch: boolean;
  standalone: boolean;
}

export interface DeviceInfo {
  kind: DeviceKind;
  /** «iPhone · Safari», «Mac · Chrome», «iPad · приложение» */
  name: string;
}

const platform = (ua: string, touch: boolean): { kind: DeviceKind; os: string; apple: boolean } => {
  if (/iPhone|iPod/.test(ua)) return { kind: "phone", os: "iPhone", apple: true };
  if (/iPad/.test(ua)) return { kind: "tablet", os: "iPad", apple: true };
  // iPadOS 13+ в Safari присылает UA настольного Mac; у Mac нет сенсорного экрана
  if (/Macintosh/.test(ua) && touch) return { kind: "tablet", os: "iPad", apple: true };
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? { kind: "phone", os: "Android", apple: false } : { kind: "tablet", os: "Android-планшет", apple: false };
  if (/CrOS/.test(ua)) return { kind: "computer", os: "Chromebook", apple: false };
  if (/Macintosh|Mac OS X/.test(ua)) return { kind: "computer", os: "Mac", apple: false };
  if (/Windows/.test(ua)) return { kind: "computer", os: "Windows", apple: false };
  if (/Linux|X11/.test(ua)) return { kind: "computer", os: "Linux", apple: false };
  return { kind: "computer", os: "Устройство", apple: false };
};

const browser = (ua: string, mobileApple: boolean, standalone: boolean): string => {
  if (standalone) return "приложение";
  if (/YaBrowser\//.test(ua)) return "Яндекс Браузер";
  if (/EdgiOS\/|EdgA?\/|Edge\//.test(ua)) return "Edge";
  if (/OPR\/|OPiOS\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser\//.test(ua)) return "Samsung Internet";
  if (/FxiOS\/|Firefox\//.test(ua)) return "Firefox";
  if (/CriOS\/|Chrome\/|Chromium\//.test(ua)) return "Chrome";
  // на iPhone/iPad у веб-приложения с экрана «Домой» в UA нет «Safari/…»
  if (mobileApple && /AppleWebKit\//.test(ua) && !/Safari\//.test(ua)) return "приложение";
  if (/Safari\//.test(ua)) return "Safari";
  return "браузер";
};

/** Имя устройства по User-Agent и подсказке браузера. Пустой UA — «Устройство · браузер». */
export const describeDevice = (ua: string | null | undefined, hint?: Partial<DeviceHint> | null): DeviceInfo => {
  const s = String(ua ?? "");
  const p = platform(s, hint?.touch === true);
  const mobileApple = p.apple && p.kind !== "computer";
  return { kind: p.kind, name: `${p.os} · ${browser(s, mobileApple, hint?.standalone === true)}` };
};

/* ---------- «когда был» ---------- */

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Активность сервер отмечает не чаще раза в 5 минут — точнее «сейчас» сказать нельзя. */
export const SEEN_PRECISION_MS = 5 * 60 * 1000;

/**
 * Когда устройство было в сети, по-русски, в местном времени:
 * «сейчас», «12 мин назад», «сегодня в 14:05», «вчера в 21:40», «3 дня назад», «2 ноября», «2 ноября 2025».
 */
export const seenAgo = (t: number, now: number): string => {
  const diff = now - t;
  if (diff < SEEN_PRECISION_MS) return "сейчас";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} мин назад`;
  const d = new Date(t),
    n = new Date(now);
  const days = Math.round((dayStart(n) - dayStart(d)) / 86_400_000);
  if (days <= 0) return `сегодня в ${hhmm(d)}`;
  if (days === 1) return `вчера в ${hhmm(d)}`;
  if (days < 7) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${d.getFullYear() === n.getFullYear() ? "" : ` ${d.getFullYear()}`}`;
};
