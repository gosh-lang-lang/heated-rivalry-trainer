import { useId, type SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Speaker = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
);
export const Close = (p: P) => (
  <svg {...base} strokeWidth={2.6} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const Sun = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
);
export const Moon = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
);
export const Flame = (p: P) => (
  <svg viewBox="0 0 24 24" fill="#ffb02e" stroke="#ff7a1a" strokeWidth={1.5} strokeLinejoin="round" {...p}>
    <path d="M12 22c4 0 7-2.7 7-6.6 0-3.5-2.4-5.6-3.6-8.4-.4 1.9-1.4 3-2.6 3.4.3-3.2-1-6.3-3.8-8.4.2 3.6-1.6 5.4-3.2 7.3C4.6 11.3 5 13 5 15.4 5 19.3 8 22 12 22z" />
  </svg>
);
const FLAME = "M12 22c4 0 7-2.7 7-6.6 0-3.5-2.4-5.6-3.6-8.4-.4 1.9-1.4 3-2.6 3.4.3-3.2-1-6.3-3.8-8.4.2 3.6-1.6 5.4-3.2 7.3C4.6 11.3 5 13 5 15.4 5 19.3 8 22 12 22z";
const CORE = "M12 20.1c-1.8 0-3.1-1.1-3.1-2.8 0-1.5.9-2.4 1.8-3.5.3 1 .8 1.5 1.5 1.7-.1-1.1.4-2.2 1.1-2.9.5 1.6 1.8 2.6 1.8 4.5 0 1.8-1.3 3-3.1 3z";
/** поверхность «налитого» огня — волна, а не линейка уровня (уровень 14.3 из 24 ≈ половина площади пламени) */
const WAVE = "M-1.5 14.3 q2.25 -2.3 4.5 0 t4.5 0 t4.5 0 t4.5 0 t4.5 0 t4.5 0";

/**
 * Огонь серии — сосуд (стили в sheet.css, .sf-*): 0 — сегодня урока нет (пустой контур), 1 — пройдена часть 1
 * (налит до середины, верх пустой), 2 — пройдены обе части (горит целиком: крупнее, ярче, с ореолом).
 * ignite — один раз «зажечься» при показе (переход 1 → 2), только без «Уменьшить движение».
 */
export function StreakFlame({ level, ignite, className = "", ...p }: P & { level: 0 | 1 | 2; ignite?: boolean }) {
  const id = useId().replace(/:/g, "");
  const cls = `sf sf-s${level}${ignite ? " sf-ignite" : ""} ${className}`;
  if (level === 0)
    return (
      <svg viewBox="0 0 24 24" className={cls} data-parts={0} {...p}>
        <path d={FLAME} className="sf-e" />
        <path d={FLAME} className="sf-ke" />
      </svg>
    );
  if (level === 1)
    return (
      <svg viewBox="0 0 24 24" className={cls} data-parts={1} {...p}>
        <defs>
          <clipPath id={`${id}l`}><path d={`${WAVE} V30 H-1.5z`} /></clipPath>
          <clipPath id={`${id}c`}><path d={FLAME} /></clipPath>
        </defs>
        <path d={FLAME} className="sf-h" />
        <path d={FLAME} className="sf-f" clipPath={`url(#${id}l)`} />
        <path d={WAVE} className="sf-lvl" clipPath={`url(#${id}c)`} />
        <path d={FLAME} className="sf-kf" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className={cls} data-parts={2} {...p}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="2" x2="0" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd23a" />
          <stop offset=".55" stopColor="#ffab1f" />
          <stop offset="1" stopColor="#ff8a12" />
        </linearGradient>
      </defs>
      <path d={FLAME} fill={`url(#${id}g)`} />
      <path d={CORE} className="sf-core" />
      <path d={FLAME} className="sf-kf sf-kf3" />
    </svg>
  );
}

export const Check = (p: P) => (
  <svg {...base} strokeWidth={3} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const Cross = (p: P) => (
  <svg {...base} strokeWidth={3} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const Mic = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const Back = (p: P) => (
  <svg {...base} strokeWidth={2.6} {...p}><path d="M15 5l-7 7 7 7" /></svg>
);
export const Rink = () => (
  <svg className="rink" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="44" fill="none" stroke="#fff" strokeWidth="3" />
    <circle cx="50" cy="50" r="4" fill="#fff" />
    <path d="M18 36h12M18 64h12M70 36h12M70 64h12M50 0v100" stroke="#fff" strokeWidth="3" />
  </svg>
);
export const Chevron = (p: P) => (
  <svg {...base} strokeWidth={2.6} {...p}><path d="M6 9l6 6 6-6" /></svg>
);
/* устройства — список «где выполнен вход» в настройках */
export const Phone = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></svg>
);
export const Tablet = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}><rect x="4" y="2.5" width="16" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></svg>
);
export const Laptop = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}><rect x="4.5" y="5" width="15" height="10.5" rx="1.5" /><path d="M2 19h20" /></svg>
);
export const Key = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}><circle cx="8" cy="15" r="4" /><path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" /></svg>
);
export const Play = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
);
/* разделы настроек — значки строк на корне «Настроек» */
export const Book = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" /></svg>
);
export const Palette = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}>
    <path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z" />
    <circle cx="7.5" cy="11" r=".9" fill="currentColor" /><circle cx="10.5" cy="7.2" r=".9" fill="currentColor" /><circle cx="15.2" cy="7.8" r=".9" fill="currentColor" />
  </svg>
);
/* «Путь», «Я», карточки-награды */
export const Gear = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const Cards = (p: P) => (
  <svg {...base} strokeWidth={2.1} {...p}><rect x="3" y="6" width="11" height="15" rx="2" /><path d="M8 3.5 18.5 2a2 2 0 0 1 2.2 1.7l1.6 11.4a2 2 0 0 1-1.7 2.3l-3.6.5" /></svg>
);
export const Lock = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const Flip = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></svg>
);
export const Right = (p: P) => (
  <svg {...base} strokeWidth={2.6} {...p}><path d="M9 6l6 6-6 6" /></svg>
);
export const Search = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
);
/** «Путь»: дорожка к флажку (как во вкладке) */
export const Route = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}><circle cx="6" cy="19" r="2.2" /><path d="M8.2 19H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /><path d="M17 3v7" /><path d="M17 3.4h4l-1.3 1.8L21 7h-4" /></svg>
);
export const Alert = (p: P) => (
  <svg {...base} strokeWidth={2.8} {...p}><path d="M12 5v9" /><path d="M12 19h.01" /></svg>
);
export const Pencil = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
);
