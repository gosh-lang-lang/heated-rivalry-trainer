import { useEffect, useState } from "react";
import type { ThemePref } from "../core/types";
import { useSettings } from "./settings";

/**
 * Тема «день / ночь». Выбор — в личных настройках (settings.theme), общий для всех устройств;
 * пока не выбирали (system) — как в системе устройства.
 * Применяется атрибутом <html data-theme>, стили уже умеют его (styles.css: :root[data-theme=…]).
 */

export type Theme = "light" | "dark";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const systemTheme = (): Theme => (window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light");

/** Выбор, сделанный до того, как тема стала общей настройкой (жил в localStorage). */
const LEGACY_KEY = "hr2_theme";
export const legacyTheme = (take = false): Theme | null => {
  try {
    const t = localStorage.getItem(LEGACY_KEY);
    if (take) localStorage.removeItem(LEGACY_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
};

/** system — снять атрибут: стили сами следуют системе. */
export const applyTheme = (t: ThemePref) => {
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
};

/** Текущая тема (для system — системная, с отслеживанием) и смена её (в общих настройках; применяет App). */
export function useTheme(): [Theme, (t: Theme) => void] {
  const { settings, set } = useSettings();
  const [system, setSystem] = useState<Theme>(systemTheme);
  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY);
    if (!mq) return;
    const h = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return [settings.theme === "system" ? system : settings.theme, (t) => set("theme", t)];
}
