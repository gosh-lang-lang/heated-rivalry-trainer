/**
 * Два хоккеиста для темы «Матч» — свой рисунок (плоские силуэты), соперники в цветах книги:
 * красно-сине-белая форма и чёрно-жёлтая. Игрок смотрит вправо; разворот — через CSS (scaleX(-1)).
 * Строкой — чтобы один и тот же рисунок шёл и в фон страницы (DOM), и в превью в настройках.
 */

interface Kit {
  jersey: string;
  stripe: string;
  stripe2: string;
  pants: string;
  socks: string;
  sockStripe: string;
  helmet: string;
  glove: string;
}

const RED: Kit = { jersey: "#d3203b", stripe: "#1f3f94", stripe2: "#ffffff", pants: "#1b2a55", socks: "#d3203b", sockStripe: "#ffffff", helmet: "#1b2a55", glove: "#e9e2d6" };
const BLACK: Kit = { jersey: "#17181c", stripe: "#f6c21b", stripe2: "#f6c21b", pants: "#17181c", socks: "#f6c21b", sockStripe: "#17181c", helmet: "#17181c", glove: "#2c2d33" };

/** Рисунок игрока без обёртки <svg> (поле 240×200) — чтобы вставлять в другие рисунки (карточки-награды). */
const skaterBody = (k: Kit) =>
  // клюшка
  `<path d="M140 86 213 182" stroke="#2b2b30" stroke-width="5" stroke-linecap="round"/>` +
  `<path d="M209 183 236 187" stroke="#2b2b30" stroke-width="7" stroke-linecap="round"/>` +
  // задняя нога (толчок): бедро в шортах, гетра, конёк
  `<path d="M100 118 72 146 44 164" stroke="${k.socks}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
  `<path d="M58 156 66 151" stroke="${k.sockStripe}" stroke-width="17"/>` +
  `<path d="M100 118 76 142" stroke="${k.pants}" stroke-width="23" stroke-linecap="round"/>` +
  `<path d="M28 162c6-6 18-9 26-5l4 8-28 3z" fill="#222"/><path d="M24 172 60 168" stroke="#c9d3de" stroke-width="3" stroke-linecap="round"/>` +
  // передняя нога
  `<path d="M112 120 140 146 128 176" stroke="${k.socks}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
  `<path d="M134 158 132 166" stroke="${k.sockStripe}" stroke-width="17"/>` +
  `<path d="M112 120 136 142" stroke="${k.pants}" stroke-width="24" stroke-linecap="round"/>` +
  `<path d="M116 176c4-4 16-4 22 0l6 9h-30z" fill="#222"/><path d="M110 190 150 190" stroke="#c9d3de" stroke-width="3" stroke-linecap="round"/>` +
  // шорты
  `<path d="M82 112c0 16 12 24 30 22 12-2 16-10 12-20z" fill="${k.pants}"/>` +
  // свитер с полосами
  `<path d="M82 120c-6-26 12-50 46-56 20-3 34 8 32 24-2 16-20 28-44 34z" fill="${k.jersey}"/>` +
  `<path d="M86 106c22-4 46-10 70-20" stroke="${k.stripe}" stroke-width="8" fill="none"/>` +
  `<path d="M87 115c22-4 44-9 64-17" stroke="${k.stripe2}" stroke-width="4" fill="none"/>` +
  // руки и краги на клюшке
  `<path d="M134 72 152 86 152 102" stroke="${k.jersey}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
  `<path d="M150 80 172 104 177 132" stroke="${k.jersey}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
  `<path d="M171 112 176 122" stroke="${k.stripe}" stroke-width="14"/>` +
  `<circle cx="152" cy="104" r="8" fill="${k.glove}"/><circle cx="178" cy="135" r="9" fill="${k.glove}"/>` +
  // голова: шлем, лицо, визор
  `<circle cx="164" cy="54" r="16" fill="${k.helmet}"/>` +
  `<path d="M168 52c8 0 14 6 13 13-1 6-7 9-13 7z" fill="#f0c6a2"/>` +
  `<path d="M166 50h17" stroke="#9fc4e8" stroke-width="4" stroke-linecap="round" opacity=".9"/>`;

const skater = (k: Kit) => `<svg viewBox="0 0 240 200" aria-hidden="true" focusable="false">${skaterBody(k)}</svg>`;

/** Игрок внутри другого svg: x, y — левый верхний угол, w — ширина, flip — смотрит влево. */
export const skaterAt = (kit: "red" | "black", x: number, y: number, w: number, flip = false) => {
  const s = w / 240;
  const tf = flip ? `translate(${x + w} ${y}) scale(${-s} ${s})` : `translate(${x} ${y}) scale(${s})`;
  return `<g transform="${tf}">${skaterBody(kit === "red" ? RED : BLACK)}</g>`;
};

export const SKATER_RED = skater(RED);
export const SKATER_BLACK = skater(BLACK);
