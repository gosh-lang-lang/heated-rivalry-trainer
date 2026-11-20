import { useEffect, useState } from "react";

/**
 * Тема «день / ночь». Выбор хранится на устройстве (не в прогрессе): пока не выбирали — как в системе.
 * Применяется атрибутом <html data-theme>, стили уже умеют его (styles.css: :root[data-theme=…]).
 */

export type Theme = "light" | "dark";
const KEY = "hr2_theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const systemTheme = (): Theme => (window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light");

export const savedTheme = (): Theme | null => {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
};

const apply = (t: Theme | null) => {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
};

/** До первой отрисовки — чтобы не мигнуть чужой темой. */
export const initTheme = () => apply(savedTheme());

/** Текущая тема и смена её (с запоминанием). Без сохранённого выбора следит за системной. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? systemTheme());
  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY);
    if (!mq) return;
    const h = () => {
      if (!savedTheme()) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  const set = (t: Theme) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* не запомнили — тема всё равно сменится до перезагрузки */
    }
    apply(t);
    setTheme(t);
  };
  return [theme, set];
}
