import type { Kit, PlayerKit } from "../core/avatar";

/**
 * Рисунки аватарок (поле 100×100, обрезка кругом — CSS .ava): хоккеист по плечи и свитер с номером.
 * Тот же плоский стиль и та же форма, что у игроков в lib/skaters.ts и на карточках (screens/cards.tsx):
 * Шейн — красный свитер с синей и белой полосой, Илья — чёрный с золотом. Фон — как у карточек героев.
 */

interface PlayerLook {
  bg: [string, string];
  dot: string;
  jersey: string;
  stripe: string;
  stripe2: string;
  helmet: string;
}
const PLAYER: Record<PlayerKit, PlayerLook> = {
  red: { bg: ["#2f6fe0", "#12306b"], dot: "#fff", jersey: "#d3203b", stripe: "#1f3f94", stripe2: "#ffffff", helmet: "#1b2a55" },
  black: { bg: ["#ffd447", "#e08a00"], dot: "#7a3d00", jersey: "#17181c", stripe: "#f6c21b", stripe2: "#f6c21b", helmet: "#17181c" },
};

const backdrop = (u: string, a: string, b: string, dot: string) =>
  `<defs><linearGradient id="g${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>` +
  `<pattern id="h${u}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="3.5" cy="3.5" r="1.2" fill="${dot}" opacity=".2"/></pattern></defs>` +
  `<rect width="100" height="100" fill="url(#g${u})"/><rect width="100" height="100" fill="url(#h${u})"/>`;

/** Хоккеист по плечи, анфас: шлем с визором, свитер с полосами на плечах. u — уникальный id (градиенты). */
export const playerSvg = (kit: PlayerKit, u: string) => {
  const k = PLAYER[kit];
  return (
    backdrop(u, k.bg[0], k.bg[1], k.dot) +
    // плечи и свитер
    `<path d="M6 104c1-20 14-31 30-34l14 9 14-9c16 3 29 14 30 34z" fill="${k.jersey}"/>` +
    `<path d="M10 92c6-10 14-15 24-18M90 92c-6-10-14-15-24-18" stroke="${k.stripe}" stroke-width="7" fill="none"/>` +
    `<path d="M8 99c6-10 15-16 26-19M92 99c-6-10-15-16-26-19" stroke="${k.stripe2}" stroke-width="3" fill="none"/>` +
    // шея и ворот
    `<path d="M43 60h14v12l-7 6-7-6z" fill="#dcae8a"/>` +
    `<path d="M36 70l14 11 14-11" stroke="${k.stripe2}" stroke-width="4" fill="none" stroke-linejoin="round"/>` +
    // лицо
    `<ellipse cx="50" cy="47" rx="13" ry="15.5" fill="#f0c6a2"/>` +
    `<path d="M45 57.5q5 2.5 10 0" stroke="#b9826a" stroke-width="1.8" fill="none" stroke-linecap="round"/>` +
    `<circle cx="45" cy="48.5" r="1.6" fill="#2b2b30"/><circle cx="55" cy="48.5" r="1.6" fill="#2b2b30"/>` +
    // шлем: купол, ушные щитки, ремешок
    `<path d="M34.5 47c-1-14 6-24 15.5-24s16.5 10 15.5 24h-4.5c0-3-1-5-3-6H42c-2 1-3 3-3 6z" fill="${k.helmet}"/>` +
    `<path d="M33.5 43h6.5v11c0 2-1.5 3-3.2 3s-3.3-1-3.3-3zM60 43h6.5v11c0 2-1.6 3-3.3 3S60 56 60 54z" fill="${k.helmet}"/>` +
    `<path d="M37 57q4 7 13 7t13-7" stroke="${k.helmet}" stroke-width="1.8" fill="none"/>` +
    `<path d="M41 29q9-4 18 0" stroke="#fff" stroke-opacity=".28" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
    // визор
    `<path d="M38 42.5h24v6.5c0 1.8-1.4 3-3 3H41c-1.6 0-3-1.2-3-3z" fill="#9fc4e8" opacity=".55"/>` +
    `<path d="M39.5 44.5h21" stroke="#fff" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round"/>`
  );
};

interface JerseyLook {
  bg: [string, string];
  dot: string;
  body: string;
  stripe: string;
  stripe2: string;
  num: string;
  outline: string;
}
const JERSEY: Record<Kit, JerseyLook> = {
  red: { bg: ["#2f6fe0", "#12306b"], dot: "#fff", body: "#d3203b", stripe: "#1f3f94", stripe2: "#ffffff", num: "#ffffff", outline: "#1f3f94" },
  black: { bg: ["#ffd447", "#e08a00"], dot: "#7a3d00", body: "#17181c", stripe: "#f6c21b", stripe2: "#f6c21b", num: "#f6c21b", outline: "#17181c" },
  white: { bg: ["#ff4a5e", "#a8162a"], dot: "#fff", body: "#f4f6fa", stripe: "#d3203b", stripe2: "#1f3f94", num: "#d3203b", outline: "#1f3f94" },
  blue: { bg: ["#e9eef6", "#b7c6da"], dot: "#12306b", body: "#1f5fd1", stripe: "#ffffff", stripe2: "#d3203b", num: "#ffffff", outline: "#12306b" },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Свитер анфас с номером (или буквой имени, если номера нет). */
export const jerseySvg = (kit: Kit, text: string, u: string) => {
  const k = JERSEY[kit];
  const t = esc(text.slice(0, 2));
  const fs = t.length > 1 ? 25 : 29;
  return (
    backdrop(u, k.bg[0], k.bg[1], k.dot) +
    `<path d="M50 88H29V48l-8 5-11-17 20-14 11-4c2 5 5 7 9 7s7-2 9-7l11 4 20 14-11 17-8-5v40z" fill="${k.body}" stroke="rgba(0,0,0,.18)" stroke-width="1.2" stroke-linejoin="round"/>` +
    // полосы на рукавах
    `<path d="M14.5 42.5 25 35M85.5 42.5 75 35" stroke="${k.stripe}" stroke-width="5"/>` +
    `<path d="M17 47 27.5 39.5M83 47 72.5 39.5" stroke="${k.stripe2}" stroke-width="2.2"/>` +
    // полосы внизу
    `<path d="M29 76h42" stroke="${k.stripe}" stroke-width="6"/><path d="M29 82h42" stroke="${k.stripe2}" stroke-width="2.4"/>` +
    // ворот
    `<path d="M41 18c2 5 5 7 9 7s7-2 9-7" stroke="${k.stripe}" stroke-width="4" fill="none"/>` +
    `<path d="M50 25v6" stroke="${k.stripe2}" stroke-width="1.6"/>` +
    // номер
    `<text x="50" y="${50 + fs * 0.36}" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="900" font-size="${fs}" fill="${k.num}" stroke="${k.outline}" stroke-width="2.6" paint-order="stroke" letter-spacing="-1">${t}</text>`
  );
};
