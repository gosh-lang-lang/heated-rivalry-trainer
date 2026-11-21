import type { LessonCard } from "./cards";

/**
 * Аватарка — личная настройка (settings.avatar), общая для всех устройств. Строка:
 *  ""                      — первая буква имени (по умолчанию);
 *  "player:red|black"      — хоккеист: Шейн (красная форма) или Илья (чёрно-жёлтая);
 *  "jersey:<кит>:<номер>"  — свитер команды с номером 0–99; без номера — с буквой имени;
 *  "card:<рисунок>"        — сюжет карточки коллекции; открывается, когда такая карточка получена.
 * Набранный номер хранится ещё и отдельно (settings.avatarNum): при выборе игрока, буквы или карточки он не теряется,
 * и свитер, выбранный потом, — снова с ним.
 */

export const KITS = ["red", "black", "white", "blue"] as const;
export type Kit = (typeof KITS)[number];
export const KIT_NAME: Record<Kit, string> = { red: "Красный", black: "Чёрный", white: "Белый", blue: "Синий" };

export const PLAYERS = [
  { kit: "red", name: "Шейн Холландер" },
  { kit: "black", name: "Илья Розанов" },
] as const;
export type PlayerKit = (typeof PLAYERS)[number]["kit"];

/**
 * Сюжеты коллекции для аватарки — карточки сезона 1 (core/cards.ts SEASON1), кроме героев: они — в «Игроках».
 * Списком здесь, а не из cards.ts: state.ts (и сервер, который запускает .ts напрямую) зависит от этого файла.
 */
export const CARD_AVATARS = [
  { art: "room", name: "Раздевалка", pos: 3 },
  { art: "team", name: "«Вояжёры»", pos: 4 },
  { art: "faceoff", name: "Вбрасывание", pos: 5 },
  { art: "raiders", name: "«Рейдерс»", pos: 6 },
  { art: "arena", name: "Арена", pos: 7 },
  { art: "press", name: "Пресс-конференция", pos: 8 },
  { art: "cottage", name: "Коттедж у озера", pos: 9 },
  { art: "cup", name: "Финал сезона", pos: 10 },
] as const;
const CARD_ARTS = new Set<string>(CARD_AVATARS.map((c) => c.art));

export type Avatar =
  | { kind: "letter" }
  | { kind: "player"; kit: PlayerKit }
  | { kind: "jersey"; kit: Kit; num: string }
  | { kind: "card"; art: string };

const NUM = /^(\d{1,2})?$/;

/** Строка настройки → аватарка; что угодно непонятное — буква. */
export const parseAvatar = (v: unknown): Avatar => {
  if (typeof v !== "string" || !v) return { kind: "letter" };
  const [kind, a = "", b = ""] = v.split(":");
  if (kind === "player" && PLAYERS.some((p) => p.kit === a)) return { kind: "player", kit: a as PlayerKit };
  if (kind === "jersey" && KITS.includes(a as Kit) && NUM.test(b)) return { kind: "jersey", kit: a as Kit, num: b ? String(Number(b)) : "" };
  if (kind === "card" && CARD_ARTS.has(a)) return { kind: "card", art: a };
  return { kind: "letter" };
};

/** Аватарка → строка настройки (обратно к parseAvatar). */
export const avatarId = (a: Avatar): string =>
  a.kind === "letter" ? "" : a.kind === "player" ? `player:${a.kit}` : a.kind === "jersey" ? `jersey:${a.kit}:${a.num}` : `card:${a.art}`;

/** Допустимая ли строка (для parseState: иначе — по умолчанию). */
export const isAvatar = (v: unknown): v is string => typeof v === "string" && avatarId(parseAvatar(v)) === v;

/** Номер на свитере из поля ввода: только цифры, не больше двух, без ведущих нулей («07» → «7»). */
export const cleanNumber = (s: string): string => {
  const d = s.replace(/\D/g, "").slice(0, 2);
  return d ? String(Number(d)) : "";
};

/** Допустимый ли номер для settings.avatarNum: "" или 0–99 без ведущих нулей. */
export const isAvatarNum = (v: unknown): v is string => typeof v === "string" && cleanNumber(v) === v;

/**
 * Номер на свитере из сохранённых настроек. Копия, сохранённая до settings.avatarNum, — номер из выбранного свитера.
 */
export const savedNumber = (avatarNum: unknown, avatar: unknown): string => {
  if (isAvatarNum(avatarNum)) return avatarNum;
  const a = parseAvatar(avatar);
  return a.kind === "jersey" ? a.num : "";
};

/** Рисунки карточек, которые уже открыты для аватарки: есть хоть одна полученная карточка с этим сюжетом. */
export const unlockedArts = (cards: LessonCard[]): Set<string> => new Set(cards.map((c) => c.art).filter((a) => CARD_ARTS.has(a)));
