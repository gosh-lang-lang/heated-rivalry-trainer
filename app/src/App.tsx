import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { changeSetting, mergeStates, parseState, sameState } from "./core/state";
import type { Finished } from "./core/session";
import type { AppState, SessionKind } from "./core/types";
import { DECK } from "./data";
import { cacheKey, loadState, saveState } from "./lib/storage";
import { applyVoice, takeLegacyVoice } from "./lib/speech";
import { applyLook, legacyLook } from "./lib/glass";
import { applyTheme, legacyTheme } from "./lib/theme";
import { SettingsContext, type SettingsApi } from "./lib/settings";
import { useServerSync } from "./lib/sync";
import { Home } from "./screens/Home";
import { Result } from "./screens/Result";
import { SessionScreen } from "./screens/Session";
import { Stats } from "./screens/Stats";
import { Words } from "./screens/Words";
import { Settings } from "./screens/Settings";
import { TabBar, TopNav, useWide } from "./ui";

export type View =
  | { name: "home" }
  | { name: "words" }
  | { name: "stats" }
  | { name: "settings" }
  /** day — день урока для части 2, перенесённой со вчера */
  | { name: "session"; kind: SessionKind; day?: string }
  | { name: "result"; fin: Finished };

export type SetState = (next: AppState) => void;

/**
 * @param user — кто вошёл; null — неизвестно (без сети и без прошлого входа): только кэш, без сервера
 */
export default function App({ user }: { user: string | null }) {
  const [state, setRaw] = useState<AppState>(() => withLegacySettings(user, loadState(user)));
  const [view, setView] = useState<View>({ name: "home" });
  const wide = useWide();
  const current = useRef(state);
  const inSession = useRef(false);
  inSession.current = view.name === "session";

  /** Принять прогресс как есть (с сервера, из другой вкладки) — в память и в кэш устройства. */
  const adopt = useCallback(
    (s: AppState) => {
      current.current = s;
      saveState(user, s);
      setRaw(s);
    },
    [user],
  );
  const schedulePush = useServerSync(!!user, current, adopt, inSession);

  /** Любое изменение прогресса: метка времени для слияния, кэш, отправка на сервер. */
  const setState: SetState = useCallback(
    (next) => {
      // строго растёт, даже если два изменения пришлись на одну миллисекунду или часы ушли назад
      adopt({ ...next, upd: Math.max(Date.now(), current.current.upd + 1) });
      schedulePush();
    },
    [adopt, schedulePush],
  );

  // личные настройки (общие для всех устройств) → голос, оформление, день/ночь; оформление — до отрисовки, без мигания
  useEffect(() => applyVoice(state.settings.voice), [state.settings.voice]);
  useLayoutEffect(() => applyLook(state.settings.look), [state.settings.look]);
  useLayoutEffect(() => applyTheme(state.settings.theme), [state.settings.theme]);

  /** Настройки для любого места интерфейса: изменение пункта — его метка времени и обычная синхронизация. */
  const settingsApi = useMemo<SettingsApi>(
    () => ({ settings: state.settings, set: (key, value) => setState(changeSetting(current.current, key, value)) }),
    [state.settings, setState],
  );
  const withSettings = (node: ReactNode) => <SettingsContext.Provider value={settingsApi}>{node}</SettingsContext.Provider>;

  // прогресс и настройки из другой вкладки — сливаем с нашими
  useEffect(() => {
    const key = cacheKey(user);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || !e.newValue) return;
      try {
        const merged = mergeStates(current.current, parseState(e.newValue));
        if (!sameState(merged, current.current)) {
          current.current = merged;
          setRaw(merged);
        }
      } catch {
        /* чужие данные — игнорируем */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user]);

  const go = useCallback((v: View) => {
    setView(v);
    window.scrollTo(0, 0);
  }, []);

  switch (view.name) {
    case "session":
      return withSettings(
        <SessionScreen
          deck={DECK}
          kind={view.kind}
          day={view.day}
          state={state}
          setState={setState}
          onQuit={() => go({ name: "home" })}
          onFinish={(fin) => go({ name: "result", fin })}
        />
      );
    case "result":
      return withSettings(<Result fin={view.fin} state={state} onHome={() => go({ name: "home" })} />);
  }

  // разделы: на широком экране — верхняя навигация, на телефоне и планшете — нижняя панель вкладок
  const section = view.name;
  return withSettings(
    <div className={`shell is-${section}${wide ? "" : " has-tabbar"}`}>
      {wide && <TopNav current={section} go={go} />}
      {section === "words" ? (
        <Words deck={DECK} state={state} onBack={() => go({ name: "home" })} />
      ) : section === "stats" ? (
        <Stats deck={DECK} state={state} onBack={() => go({ name: "home" })} />
      ) : section === "settings" ? (
        <Settings state={state} setState={setState} onBack={() => go({ name: "home" })} />
      ) : (
        <Home deck={DECK} state={state} go={go} wide={wide} />
      )}
      {!wide && <TabBar current={section} go={go} />}
    </div>
  );
}

/**
 * Голос, оформление и день/ночь, выбранные в этом браузере до того, как настройки стали общими (жили в localStorage).
 * Переносим в настройки с самой ранней меткой: если на другом устройстве этот пункт уже выбирали, победит тот выбор.
 */
function withLegacySettings(user: string | null, s: AppState): AppState {
  let next = s;
  const voice = takeLegacyVoice(),
    look = legacyLook(true),
    theme = legacyTheme(true);
  if (voice && s.settingsAt.voice === 0) next = changeSetting(next, "voice", voice, 1);
  if (look && s.settingsAt.look === 0) next = changeSetting(next, "look", look, 1);
  if (theme && s.settingsAt.theme === 0) next = changeSetting(next, "theme", theme, 1);
  if (next === s) return s;
  next = { ...next, upd: Math.max(s.upd, 1) };
  saveState(user, next);
  return next;
}
