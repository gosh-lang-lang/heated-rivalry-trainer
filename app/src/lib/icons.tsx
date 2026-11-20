import type { SVGProps } from "react";

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
export const Play = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
);
