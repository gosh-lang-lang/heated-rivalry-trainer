import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import type { View } from "./App";
import { say } from "./lib/speech";
import { Speaker } from "./lib/icons";

/** Кнопка «озвучить». Не всплывает — работает внутри <summary> и плиток. */
export const SpeakBtn = ({ text, size = "" }: { text: string; size?: "" | "s" | "big" }) => (
  <button
    className={`spk ${size}`}
    aria-label="Озвучить"
    data-say={text}
    onClick={(e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      say(text);
    }}
  >
    <Speaker />
  </button>
);

/** Ширина, с которой включается «настольная» раскладка (верхняя навигация, дашборд). Синхронно с styles.css. */
export const WIDE_QUERY = "(min-width: 900px)";

const matches = (q: string) => typeof window !== "undefined" && !!window.matchMedia?.(q).matches;

/** true, пока медиазапрос выполняется. Нужен, чтобы не держать в DOM две одинаковые кнопки (телефон/десктоп). */
export function useMedia(q: string) {
  const [m, setM] = useState(() => matches(q));
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const h = () => setM(mq.matches);
    h();
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}

export const useWide = () => useMedia(WIDE_QUERY);

export type Section = "home" | "words" | "stats" | "settings";
const TABS: [Section, string][] = [
  ["home", "Главная"],
  ["words", "Словарь"],
  ["stats", "Статистика"],
  ["settings", "Настройки"],
];

/* иконки нижней панели — 24×24, обводка, как в lib/icons */
const ic = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const TAB_ICON: Record<Section, ReactNode> = {
  // главная — площадка: борт, центральный круг
  home: <svg {...ic}><rect x="2.5" y="5" width="19" height="14" rx="6" /><circle cx="12" cy="12" r="2.6" /><path d="M12 5v4.4M12 14.6V19" /></svg>,
  words: <svg {...ic}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" /><path d="M9 8h7" /></svg>,
  stats: <svg {...ic}><path d="M5 20V12M10 20V5M15 20v-9M20 20v-5" /></svg>,
  settings: <svg {...ic}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></svg>,
};

/** Нижняя панель вкладок на телефоне и планшете. В занятии и на итоге не показывается. */
export function TabBar({ current, go }: { current: Section; go: (v: View) => void }) {
  return (
    <nav className="tabbar" aria-label="Разделы">
      {TABS.map(([id, label]) => (
        <button key={id} aria-current={current === id ? "page" : undefined} onClick={() => go({ name: id })}>
          {TAB_ICON[id]}
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Верхняя навигация на широком экране. На телефоне вместо неё — TabBar внизу. */
export function TopNav({ current, go }: { current: Section; go: (v: View) => void }) {
  const today = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  return (
    <nav className="topnav" aria-label="Разделы">
      <div className="in">
        <span className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect x="1.5" y="5.5" width="29" height="21" rx="10" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <path d="M16 5.5v21" stroke="var(--goal)" strokeWidth="2.2" />
            <circle cx="16" cy="16" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          Тренажёр <small>по книге</small>
        </span>
        <div className="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} aria-current={current === id ? "page" : undefined} onClick={() => go({ name: id })}>
              {label}
            </button>
          ))}
        </div>
        <span className="date">{today}</span>
      </div>
    </nav>
  );
}
