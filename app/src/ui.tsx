import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { View } from "./App";
import { say, useSpeaking } from "./lib/speech";
import { Close, Moon, Speaker, Sun } from "./lib/icons";
import { useTheme } from "./lib/theme";
import { usePullToRefresh } from "./lib/pull";
import { SKATER_BLACK, SKATER_RED } from "./lib/skaters";

/** Тумблер «день / ночь» в шапке. */
export function ThemeToggle() {
  const [theme, set] = useTheme();
  const night = theme === "dark";
  return (
    <button
      className="theme-tg"
      role="switch"
      aria-checked={night}
      aria-label="Ночная тема"
      title={night ? "Ночная тема" : "Дневная тема"}
      onClick={() => set(night ? "light" : "dark")}
    >
      <Sun className="tg-sun" aria-hidden="true" />
      <Moon className="tg-moon" aria-hidden="true" />
      <span className="tg-knob" aria-hidden="true">{night ? <Moon /> : <Sun />}</span>
    </button>
  );
}

/** Кнопка «озвучить». Не всплывает — работает внутри <summary> и плиток. Пока фраза готовится и звучит — нажата. */
export function SpeakBtn({ text, size = "" }: { text: string; size?: "" | "s" | "big" }) {
  const state = useSpeaking(text);
  return (
    <button
      className={`spk ${size}${state ? " on" : ""}${state === "playing" ? " talking" : ""}`}
      aria-label="Озвучить"
      aria-pressed={!!state}
      aria-busy={state === "loading"}
      data-say={text}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        say(text);
      }}
    >
      {state === "loading" ? <span className="spin" aria-hidden="true" /> : <Speaker />}
    </button>
  );
}

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

/** Вкладки: «Главная» (урок дня), «Путь», «Слова» (словарь), «Я» (коллекция, достижения, статистика; настройки — шестерёнкой). */
export type Section = "home" | "path" | "words" | "me";
const TABS: [Section, string][] = [
  ["home", "Главная"],
  ["path", "Путь"],
  ["words", "Слова"],
  ["me", "Я"],
];

/* иконки нижней панели — 24×24, обводка, как в lib/icons */
const ic = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const TAB_ICON: Record<Section, ReactNode> = {
  // главная — площадка: борт, центральный круг
  home: <svg {...ic}><rect x="2.5" y="5" width="19" height="14" rx="6" /><circle cx="12" cy="12" r="2.6" /><path d="M12 5v4.4M12 14.6V19" /></svg>,
  // путь — дорожка от старта к флажку
  path: <svg {...ic}><circle cx="6" cy="19" r="2.2" /><path d="M8.2 19H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /><path d="M17 3v7" /><path d="M17 3.4h4l-1.3 1.8L21 7h-4" /></svg>,
  words: <svg {...ic}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" /><path d="M9 8h7" /></svg>,
  me: <svg {...ic}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
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
        <ThemeToggle />
      </div>
    </nav>
  );
}

/**
 * «Потяни, чтобы обновить»: полоска льда над страницей, двое игроков выезжают с краёв навстречу,
 * на пороге — вбрасывание: клюшки стукаются, искра — и перезагрузка (lib/pull.ts, pull.css).
 * Монтируется только в разделах (сегодня, путь, слова, «Я» и её подстраницы) — во время занятия жеста нет.
 */
export function PullRefresh() {
  usePullToRefresh(true);
  return (
    <div className="ptr" aria-hidden="true">
      <i className="ptr-ice" />
      <i className="ptr-puck" />
      <div className="ptr-sk l">
        <div className="ptr-body" dangerouslySetInnerHTML={{ __html: SKATER_RED }} />
      </div>
      <div className="ptr-sk r">
        <div className="ptr-body" dangerouslySetInnerHTML={{ __html: SKATER_BLACK }} />
      </div>
      <svg className="ptr-spark" viewBox="-20 -20 40 40">
        <path d="M0-8V-17M5.7-5.7l6.4-6.4M-5.7-5.7l-6.4-6.4M8-1h9M-8-1h-9M5 5l4.5 4M-5 5l-4.5 4" />
        <circle r="4.5" />
      </svg>
    </div>
  );
}

/**
 * Панель поверх страницы: на телефоне выезжает снизу, на широком экране — окно по центру.
 * Закрыть — крестик, Esc или нажатие на затемнение; под панелью страница не прокручивается.
 * В body через портал: у шапок бывает backdrop-filter, внутри него position: fixed считается от шапки.
 */
export function Sheet({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const done = useRef(onClose);
  done.current = onClose;
  useEffect(() => {
    const was = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && done.current();
    window.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = overflow;
      was?.focus?.({ preventScroll: true }); // фокус — обратно на кнопку, которая открыла панель
    };
  }, []);
  return createPortal(
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="scrim" onClick={onClose} />
      <section className={`sheet ${className}`}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button ref={closeRef} className="sheet-x" aria-label="Закрыть" onClick={onClose}><Close /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
