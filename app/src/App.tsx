import { useCallback, useEffect, useRef, useState } from "react";
import { pickNewer, parseState } from "./core/state";
import type { Finished } from "./core/session";
import type { AppState, SessionKind } from "./core/types";
import { DECK } from "./data";
import { cacheKey, loadState, saveState } from "./lib/storage";
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
  | { name: "session"; kind: SessionKind }
  | { name: "result"; fin: Finished };

export type SetState = (next: AppState) => void;

/**
 * @param user — кто вошёл; null — неизвестно (без сети и без прошлого входа): только кэш, без сервера
 */
export default function App({ user }: { user: string | null }) {
  const [state, setRaw] = useState<AppState>(() => loadState(user));
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

  // прогресс из другой вкладки — берём, если он новее
  useEffect(() => {
    const key = cacheKey(user);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || !e.newValue) return;
      try {
        const other = parseState(e.newValue);
        if (pickNewer(current.current, other) === other) {
          current.current = other;
          setRaw(other);
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
      return (
        <SessionScreen
          deck={DECK}
          kind={view.kind}
          state={state}
          setState={setState}
          onQuit={() => go({ name: "home" })}
          onFinish={(fin) => go({ name: "result", fin })}
        />
      );
    case "result":
      return <Result fin={view.fin} state={state} onHome={() => go({ name: "home" })} />;
  }

  // разделы: на широком экране — верхняя навигация, на телефоне и планшете — нижняя панель вкладок
  const section = view.name;
  return (
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
