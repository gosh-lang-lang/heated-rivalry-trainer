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
import { PullRefresh, TabBar, TopNav, useWide } from "./ui";

export type View =
  | { name: "home" }
  | { name: "words" }
  | { name: "stats" }
  /** section — открытый раздел настроек; без него на телефоне — список разделов (на десктопе — первый раздел) */
  | { name: "settings"; section?: SettingsSection }
  /** day — день урока для части 2, перенесённой со вчера */
  | { name: "session"; kind: SessionKind; day?: string }
  | { name: "result"; fin: Finished };

export type SettingsSection = "lessons" | "voice" | "look" | "account";

export type SetState = (next: AppState) => void;

/** Метка записи в истории браузера: на телефоне открыт раздел настроек (App.go). */
const sectionInHistory = (): SettingsSection | undefined => (history.state as { settings?: SettingsSection } | null)?.settings;

/**
 * @param user — кто вошёл; null — неизвестно (без сети и без прошлого входа): только кэш, без сервера
 * @param name — как его зовут (приветствие на главной); null — неизвестно
 */
export default function App({ user, name = null }: { user: string | null; name?: string | null }) {
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

  const wideRef = useRef(wide);
  wideRef.current = wide;
  const viewRef = useRef(view);
  viewRef.current = view;
  /** go() сам отступил на запись назад (history.back асинхронный) — ближайший popstate его, а не пользователя */
  const ownBack = useRef(false);

  /**
   * Переход между экранами. Раздел настроек на телефоне — отдельная запись в истории браузера: «назад» (жест в Safari,
   * кнопка браузера) возвращает к списку настроек, а не уводит из них. Уходим со страницы раздела иначе
   * (кнопка «‹ Настройки», вкладка) — снимаем эту запись, чтобы «назад» потом не стоял на месте.
   * На десктопе (список и раздел рядом) выбор раздела в историю не пишется.
   */
  const go = useCallback((v: View) => {
    const toSection = v.name === "settings" ? v.section : undefined;
    const inHistory = sectionInHistory();
    if (ownBack.current) {
      /* история ещё отступает — запись для нового раздела добавит onPop */
    } else if (toSection && inHistory) history.replaceState({ settings: toSection }, "");
    else if (toSection && !wideRef.current) history.pushState({ settings: toSection }, "");
    else if (!toSection && inHistory) {
      ownBack.current = true;
      history.back();
    }
    viewRef.current = v;
    setView(v);
    window.scrollTo(0, 0);
  }, []);

  // «назад» / «вперёд» в истории: внутри настроек — к списку или снова в раздел; на других экранах ничего не меняем
  useEffect(() => {
    // перезагрузка на странице раздела: приложение начинает с главной, метка в истории больше ничего не значит
    if (sectionInHistory()) history.replaceState(null, "");
    const onPop = () => {
      if (ownBack.current) {
        ownBack.current = false;
        const v = viewRef.current; // пока отступали, успели открыть раздел — его запись
        if (v.name === "settings" && v.section && !wideRef.current) history.pushState({ settings: v.section }, "");
        return;
      }
      const section = sectionInHistory();
      setView((v) => (v.name === "settings" && v.section !== section ? { name: "settings", section } : v));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
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
      <PullRefresh />
      {wide && <TopNav current={section} go={go} />}
      {section === "words" ? (
        <Words deck={DECK} state={state} onBack={() => go({ name: "home" })} />
      ) : section === "stats" ? (
        <Stats deck={DECK} state={state} onBack={() => go({ name: "home" })} />
      ) : section === "settings" ? (
        <Settings
          state={state}
          setState={setState}
          section={view.name === "settings" ? view.section : undefined}
          wide={wide}
          go={go}
          onBack={() => go({ name: "home" })}
        />
      ) : (
        <Home deck={DECK} state={state} go={go} wide={wide} name={name} />
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
