import { useCallback, useEffect, useState } from "react";
import { pickNewer, parseState } from "./core/state";
import type { Finished } from "./core/session";
import type { AppState, SessionKind } from "./core/types";
import { DECK } from "./data";
import { loadState, saveState } from "./lib/storage";
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

export default function App() {
  const [state, setRaw] = useState<AppState>(loadState);
  const [view, setView] = useState<View>({ name: "home" });
  const wide = useWide();

  /** Любое изменение прогресса: метка времени для слияния + запись на устройство. */
  const setState: SetState = useCallback((next) => {
    const s = { ...next, upd: Date.now() };
    saveState(s);
    setRaw(s);
  }, []);

  // прогресс из другой вкладки — берём, если он новее
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "hr2_state" || !e.newValue) return;
      try {
        const other = parseState(e.newValue);
        setRaw((cur) => pickNewer(cur, other));
      } catch {
        /* чужие данные — игнорируем */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
