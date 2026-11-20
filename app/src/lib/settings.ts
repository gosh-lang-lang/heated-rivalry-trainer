import { createContext, useContext } from "react";
import type { Settings } from "../core/types";

/**
 * Личные настройки для любого места интерфейса (шапка, меню, экран настроек) — без проброса через props.
 * Значения — из прогресса (общие для всех устройств), изменение — через App (метка пункта + синхронизация).
 */
export interface SettingsApi {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export const SettingsContext = createContext<SettingsApi | null>(null);

export const useSettings = (): SettingsApi => {
  const api = useContext(SettingsContext);
  if (!api) throw new Error("useSettings — только внутри App");
  return api;
};
