/**
 * Фоны тем по мотивам книги (свой рисунок, без спойлеров — только то, что видно с первых страниц):
 *   «Два города» — силуэты двух городов-соперников: слева Монреаль (гора с крестом, башни собора,
 *                  наклонная башня стадиона, дома с уличными лестницами), справа Бостон (вантовый мост,
 *                  таможенная башня с часами, стеклянные небоскрёбы, кирпичные дома с эркерами);
 *   «Выезд»      — карта выездов сезона: города лиги, пунктир рейсов, самолёт летит из Монреаля в Бостон.
 * Цвета — классами, их задаёт glass.css (день / ночь, сторона). Строкой — чтобы один рисунок шёл и в фон, и в превью.
 */

/** Детерминированный «случайный» 0..1 — окна горят одинаково при каждой загрузке. */
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

let seed = 0;
/** Окна дома: сетка 4×6, часть не горит (ночью это заметно). */
const windows = (x: number, y: number, w: number, h: number, side: "l" | "r") => {
  let s = "";
  for (let yy = y + 10; yy + 8 < y + h - 6; yy += 14)
    for (let xx = x + 7; xx + 5 < x + w - 4; xx += 11) {
      const on = rnd(++seed) > 0.42;
      s += `<rect class="z-w${side}${on ? "" : " z-off"}" x="${xx}" y="${yy}" width="5" height="7" rx="1"/>`;
    }
  return s;
};

const block = (cls: string, x: number, y: number, w: number, side: "l" | "r", lit = true) =>
  `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${300 - y}"/>` + (lit ? windows(x, y, w, 300 - y, side) : "");

/* ---------- Монреаль (x 0–580) ---------- */
const montreal = () => {
  seed = 0;
  return (
    // гора с крестом
    `<path class="z-cl-b" d="M0 300V222C60 196 130 160 220 146 300 134 390 158 460 200 510 230 548 256 580 268V300Z"/>` +
    `<path class="z-cross" d="M286 96h7v42h-7zM276 107h27v7h-27z"/>` +
    // стадион с наклонной башней
    `<path class="z-cl-m" d="M18 300c24-42 132-56 176-20v20Z"/>` +
    `<path class="z-cl-m" d="M70 290 128 150l13 6-49 134Z"/>` +
    // передний план: дома, собор с двумя башнями, дома-«плексы» с уличными лестницами
    block("z-cl-f", 0, 224, 52, "l") +
    block("z-cl-f", 52, 198, 44, "l") +
    block("z-cl-f", 96, 238, 58, "l") +
    `<path class="z-cl-f" d="M168 300V172l12-32 12 32v128ZM226 300V172l12-32 12 32v128ZM192 300V202l17-16 17 16v98Z"/>` +
    `<circle class="z-wl" cx="209" cy="214" r="6"/>` +
    windows(168, 180, 24, 120, "l") +
    windows(226, 180, 24, 120, "l") +
    block("z-cl-f", 256, 214, 40, "l") +
    block("z-cl-f", 296, 246, 46, "l") +
    [350, 418, 486].map((x) =>
      `<rect class="z-cl-f" x="${x}" y="244" width="64" height="56"/><rect class="z-cl-f" x="${x - 3}" y="240" width="70" height="6"/>` +
      windows(x, 244, 64, 56, "l") +
      `<path class="z-stair" d="M${x + 6} 298l16-24h10M${x + 32} 274l14-22"/>`,
    ).join("")
  );
};

/* ---------- Бостон (x 600–1200) ---------- */
const boston = () => {
  seed = 100;
  const fan = (tx: number, from: number, to: number) => {
    let s = "";
    for (let i = 0; i <= 6; i++) s += `M${tx} ${176 + i * 3}L${from + ((to - from) * i) / 6} 282`;
    return s;
  };
  return (
    // дальний план: стеклянные башни
    `<rect class="z-cr-b" x="900" y="64" width="44" height="236"/><path class="z-cr-b" d="M900 64l44-10v10z"/>` +
    `<rect class="z-cr-b" x="986" y="98" width="52" height="202"/><rect class="z-cr-b" x="1010" y="58" width="4" height="40"/>` +
    `<rect class="z-cr-b" x="1066" y="140" width="40" height="160"/>` +
    `<rect class="z-cr-b" x="852" y="152" width="36" height="148"/>` +
    // вантовый мост: две башни, веера тросов, полотно
    `<path class="z-cable" d="${fan(684, 610, 684)}${fan(684, 760, 684)}${fan(792, 720, 792)}${fan(792, 868, 792)}"/>` +
    `<path class="z-tower" d="M672 286 684 204 696 286M684 204V166M780 286 792 204 804 286M792 204V166M598 283H884"/>` +
    // передний план: таможенная башня с часами, дома, кирпичные дома с эркерами
    `<path class="z-cr-f" d="M888 300V150h34v150ZM892 150l13-32 13 32Z"/>` +
    `<circle class="z-wr" cx="905" cy="164" r="6"/>` +
    windows(888, 170, 34, 130, "r") +
    block("z-cr-f", 926, 232, 48, "r") +
    block("z-cr-f", 974, 208, 32, "r") +
    [1008, 1056, 1104, 1152].map((x) =>
      `<path class="z-cr-f" d="M${x} 300V250h48v50Z"/><path class="z-cr-f" d="M${x + 6} 300V244h16v56Z"/>` + windows(x, 252, 48, 48, "r"),
    ).join("")
  );
};

export const CITIES_SVG =
  `<svg class="sc-cities" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">` +
  montreal() +
  boston() +
  `</svg>`;

/* ---------- «Выезд»: карта ---------- */
const PLACES: [string, number, number, "l" | "r"][] = [
  ["МОНРЕАЛЬ", 610, 300, "r"],
  ["ОТТАВА", 480, 270, "l"],
  ["ТОРОНТО", 370, 420, "l"],
  ["БОСТОН", 660, 470, "r"],
  ["НЬЮ-ЙОРК", 560, 600, "r"],
  ["ФИЛАДЕЛЬФИЯ", 470, 680, "l"],
  ["ВАШИНГТОН", 420, 790, "r"],
  ["ДЕТРОЙТ", 280, 480, "l"],
  ["ЧИКАГО", 140, 520, "r"],
  ["КВЕБЕК", 720, 210, "r"],
];
const at = (name: string) => PLACES.find((p) => p[0] === name)!;
const arc = (a: string, b: string, bend = 0.22) => {
  const [, x1, y1] = at(a);
  const [, x2, y2] = at(b);
  const mx = (x1 + x2) / 2 - (y2 - y1) * bend;
  const my = (y1 + y2) / 2 + (x2 - x1) * bend;
  return `M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`;
};
const ROUTES = [
  arc("ОТТАВА", "МОНРЕАЛЬ"),
  arc("ТОРОНТО", "ОТТАВА"),
  arc("ДЕТРОЙТ", "ТОРОНТО"),
  arc("ЧИКАГО", "ДЕТРОЙТ"),
  arc("БОСТОН", "НЬЮ-ЙОРК"),
  arc("НЬЮ-ЙОРК", "ФИЛАДЕЛЬФИЯ"),
  arc("ФИЛАДЕЛЬФИЯ", "ВАШИНГТОН"),
  arc("МОНРЕАЛЬ", "КВЕБЕК"),
  arc("ТОРОНТО", "НЬЮ-ЙОРК", 0.12),
];
const FLIGHT = arc("МОНРЕАЛЬ", "БОСТОН", -0.35);
const PLANE = "M10 0 6-1.6H-1L-5-9h-2.5L-4-1.6h-4L-10-4.5h-1.5l1 4.5-1 4.5H-10l2-2.9h4L-7.5 9H-5l4-7.4h7Z";

export const awaySvg = (still: boolean) => {
  let s = `<svg class="sc-away" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">`;
  // сетка меридианов и параллелей
  for (let i = 0; i < 9; i++) s += `<path class="z-grat" d="M-60 ${110 * i + 40}Q500 ${110 * i - 30} 1060 ${110 * i + 40}"/>`;
  for (let i = 0; i < 9; i++) s += `<path class="z-grat" d="M${125 * i} -40Q${125 * i + (i - 4) * 18} 500 ${125 * i + (i - 4) * 40} 1040"/>`;
  s += `<path class="z-route" d="${ROUTES.join("")}"/>`;
  s += `<path class="z-flight" d="${FLIGHT}"/>`;
  for (const [name, x, y, side] of PLACES)
    s +=
      `<circle class="z-city${name === "МОНРЕАЛЬ" || name === "БОСТОН" ? " z-hub" : ""}" cx="${x}" cy="${y}" r="5"/>` +
      `<text class="z-lbl" x="${x + (side === "r" ? 12 : -12)}" y="${y + 4}" text-anchor="${side === "r" ? "start" : "end"}">${name}</text>`;
  s += still
    ? `<path class="z-plane" d="${PLANE}" transform="translate(684 372) rotate(35) scale(1.6)"/>`
    : `<g><path class="z-plane" d="${PLANE}" transform="scale(1.6)"/><animateMotion dur="16s" repeatCount="indefinite" rotate="auto" path="${FLIGHT}"/></g>`;
  return s + `</svg>`;
};

/** Табло вылетов на главной («Выезд»): куда летит урок — города лиги по кругу. */
export const AWAY_CITIES = ["Бостон", "Торонто", "Оттава", "Нью-Йорк", "Чикаго", "Филадельфия", "Детройт", "Вашингтон", "Квебек", "Монреаль"];
