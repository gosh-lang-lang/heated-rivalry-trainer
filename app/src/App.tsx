import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { changeSetting, mergeStates, parseState, sameState } from "./core/state";
import { clockNow, setClock } from "./core/dates";
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
import { PathScreen } from "./screens/Path";
import { Me } from "./screens/Me";
import { Collection } from "./screens/Collection";
import { CardViewer } from "./screens/CardViewer";
import { earnedCards } from "./core/cards";
import { Words } from "./screens/Words";
import type { LessonKey } from "./core/vocab";
import { Settings } from "./screens/Settings";
import { PullRefresh, TabBar, TopNav, useWide, type Section } from "./ui";

/**
 * Экран приложения. Вкладки — home («Главная»), path («Путь»), words («Слова»), me («Я»); подстраницы «Я» — коллекция
 * и настройки; карточка во весь экран — поверх экрана, с которого открыта (from). Занятие и итог — без вкладок.
 */
export type View =
  | { name: "home" }
  | { name: "path" }
  /** lesson — открытая страница словаря: урок, «Впереди» или «Трудные»; без неё — список уроков */
  | { name: "words"; lesson?: LessonKey }
  | { name: "me" }
  /** season — открытая вкладка сезона; без него — текущий сезон */
  | { name: "collection"; season?: number }
  /** карточка no во весь экран поверх from (коллекция, путь, «Я») */
  | { name: "card"; no: number; from: View }
  /** section — открытый раздел настроек; без него на телефоне — список разделов (на десктопе — первый раздел) */
  | { name: "settings"; section?: SettingsSection }
  /**
   * day — день урока для части 2, перенесённой со вчера; from — откуда начали (туда «выйти»);
   * для «Пройти все слова» (drill): words — слова, title — заголовок, lesson — страница «Слов», куда вернуться
   */
  | {
      name: "session";
      kind: SessionKind;
      day?: string;
      from?: "home" | "path" | "words";
      words?: string[];
      title?: string;
      lesson?: LessonKey;
      /** «Начать заново» незаконченную часть (без него сохранённая часть продолжается) */
      restart?: boolean;
    }
  /** back — куда ведёт кнопка итога (тренировка из «Слов» — обратно к уроку); без него — на главную */
  | { name: "result"; fin: Finished; back?: View };

export type SettingsSection = "lessons" | "voice" | "look" | "account";

export type SetState = (next: AppState) => void;

/** Вкладка, к которой относится экран (подсвечена в навигации). */
export const sectionOf = (v: View): Section =>
  v.name === "card" ? sectionOf(v.from) : v.name === "collection" || v.name === "settings" || v.name === "me" ? "me" : v.name === "path" || v.name === "words" ? v.name : "home";

/**
 * Глубина экрана в истории браузера: вкладки, занятие и итог — 0; коллекция и настройки — 1 (подстраницы «Я»), страница урока в «Словах» на телефоне — 1;
 * раздел настроек на телефоне — 2 (на десктопе список и раздел рядом — 1); карточка — на 1 глубже экрана под ней.
 */
export const depthOf = (v: View, wide: boolean): number =>
  v.name === "card" ? depthOf(v.from, wide) + 1 : v.name === "collection" || (v.name === "words" && v.lesson !== undefined && !wide) ? 1 : v.name === "settings" ? (v.section && !wide ? 2 : 1) : 0;

/** Запись в истории браузера: d — сколько записей приложения над базовой, v — экран. */
type Entry = { d: number; v: View };
const entry = (): Entry | null => {
  const s = history.state as Partial<Entry> | null;
  return s && typeof s.d === "number" && s.v && typeof s.v === "object" ? (s as Entry) : null;
};
/** Занятие и итог в историю не пишутся: «назад» в них не возвращает. */
const storable = (v: View) => v.name !== "session" && v.name !== "result";

const SCREENS = new Set<View["name"]>(["home", "path", "words", "me", "collection", "card", "settings"]);
/** Экран из записи истории, если он из тех, что туда пишутся (запись могла остаться от старой версии приложения). */
const savedView = (v: unknown): View | null => {
  const o = v as { name?: unknown; from?: unknown } | null;
  if (!o || typeof o !== "object" || !SCREENS.has(o.name as View["name"])) return null;
  if (o.name === "card" && !savedView(o.from)) return null;
  return o as View;
};
/**
 * Страница перезагружена (в том числе «потяни, чтобы обновить») или открыта «назад»/«вперёд» с другого сайта —
 * а не открыта заново (адрес, иконка на экране «Домой»). Переход на тот же адрес браузер может сделать заменой записи
 * с её состоянием, поэтому смотрим на тип навигации, а не только на history.state.
 */
const reopened = (): boolean => {
  const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!nav) return true; // тип неизвестен (старый браузер, подменённые часы в тестах) — верим записи истории
  return nav.type === "reload" || nav.type === "back_forward";
};
/** Экран, который восстановить при загрузке: после перезагрузки — тот же, что был; иначе — нет («Главная»). */
const restoredView = (): View | null => (reopened() ? savedView(entry()?.v) : null);
/** С какого экрана начать. */
export const initialView = (): View => restoredView() ?? { name: "home" };

/**
 * @param user — кто вошёл; null — неизвестно (без сети и без прошлого входа): только кэш, без сервера
 * @param name — как его зовут (приветствие на главной); null — неизвестно
 */
export default function App({ user, name = null }: { user: string | null; name?: string | null }) {
  const [state, setRaw] = useState<AppState>(() => withLegacySettings(user, loadState(user)));
  const [view, setView] = useState<View>(initialView);
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
  // «сегодня» — в поясе пользователя с сервера (пока его нет — в поясе устройства), core/dates.ts
  setClock({ tz: state.tz });
  // поправка на часы сервера изменилась — перерисовать: «сегодня» могло смениться
  const [, setClockTick] = useState(0);
  const onClock = useCallback(() => setClockTick((n) => n + 1), []);
  const schedulePush = useServerSync(!!user, current, adopt, inSession, onClock);

  /** Любое изменение прогресса: метка времени для слияния, кэш, отправка на сервер. */
  const setState: SetState = useCallback(
    (next) => {
      // строго растёт, даже если два изменения пришлись на одну миллисекунду или часы ушли назад
      adopt({ ...next, upd: Math.max(clockNow(), current.current.upd + 1) }); // по часам сервера, как и прочие метки слияния
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
  /** go() сам отступил назад (history.go асинхронный) — ближайший popstate его, а не пользователя */
  const ownBack = useRef(false);

  /** Привести текущую запись истории к открытому экрану (после своего отступа назад). */
  const syncEntry = useCallback(() => {
    const v = viewRef.current;
    const t = depthOf(v, wideRef.current),
      d = entry()?.d ?? 0;
    if (t > d) history.pushState({ d: d + 1, v }, "");
    else if (t === d && (t > 0 || storable(v))) history.replaceState({ d, v }, "");
  }, []);

  /**
   * Переход между экранами. Подстраницы (коллекция, настройки, раздел настроек на телефоне, карточка) — отдельные
   * записи в истории браузера: «назад» (жест в Safari, кнопка браузера) возвращает на экран под ними, «вперёд» — снова
   * туда. Глубже — новая запись; на том же уровне (другой раздел, другая карточка, другая вкладка) — замена;
   * выше (кнопка «‹ Я», вкладка, закрыть карточку) — отступаем по истории, чтобы «назад» потом не стоял на месте.
   */
  const go = useCallback(
    (v: View) => {
      const t = depthOf(v, wideRef.current),
        d = entry()?.d ?? 0;
      if (ownBack.current) {
        /* история ещё отступает — запись для нового экрана поставит onPop */
      } else if (t > d) history.pushState({ d: d + 1, v }, "");
      else if (t === d) {
        if (t > 0 || storable(v)) history.replaceState({ d, v }, "");
      } else {
        ownBack.current = true;
        history.go(t - d);
      }
      const was = viewRef.current;
      viewRef.current = v;
      setView(v);
      // карточка открывается и закрывается поверх экрана — прокрутку под ней не трогаем
      if (v.name !== "card" && was.name !== "card") window.scrollTo(0, 0);
    },
    [],
  );

  // «назад» / «вперёд» в истории: экран из записи; базовая запись без экрана (до приложения) — «Главная»
  useEffect(() => {
    // перезагрузка открывает тот же экран (initialView), записи истории под ним остаются — «назад» работает как до неё;
    // открыли заново или запись без понятного экрана (от старой версии) — эта запись базовая, «Главная»
    if (!restoredView()) history.replaceState({ d: 0, v: { name: "home" } }, "");
    const onPop = () => {
      if (ownBack.current) {
        ownBack.current = false;
        syncEntry(); // пока отступали, успели открыть другой экран — его запись
        return;
      }
      const cur = viewRef.current;
      if (!storable(cur)) return; // в занятии и на итоге история экран не меняет
      const v = entry()?.v ?? { name: "home" };
      viewRef.current = v;
      setView(v);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncEntry]);

  switch (view.name) {
    case "session":
      return withSettings(
        <SessionScreen
          deck={DECK}
          kind={view.kind}
          day={view.day}
          words={view.words}
          title={view.title}
          restart={view.restart}
          state={state}
          setState={setState}
          onQuit={() => go(view.from === "words" ? { name: "words", lesson: view.lesson } : { name: view.from ?? "home" })}
          onFinish={(fin) => go({ name: "result", fin, back: view.from === "words" ? { name: "words", lesson: view.lesson } : undefined })}
        />
      );
    case "result":
      return withSettings(<Result fin={view.fin} state={state} deck={DECK} go={go} back={view.back} />);
  }

  /** Экран раздела (для карточки — экран под ней). */
  const screen = (v: View): ReactNode => {
    switch (v.name) {
      case "words":
        return <Words deck={DECK} state={state} go={go} wide={wide} lesson={v.lesson} />;
      case "path":
        return <PathScreen deck={DECK} state={state} go={go} wide={wide} />;
      case "me":
        return <Me deck={DECK} state={state} go={go} name={name} />;
      case "collection":
        return <Collection deck={DECK} state={state} go={go} season={v.season} />;
      case "card":
        return screen(v.from);
      case "settings":
        return <Settings state={state} setState={setState} section={v.section} wide={wide} go={go} onBack={() => go({ name: "me" })} />;
      default:
        return <Home deck={DECK} state={state} go={go} wide={wide} name={name} />;
    }
  };
  const base = view.name === "card" ? view.from : view;
  const cards = view.name === "card" ? earnedCards(state, DECK) : [];

  // разделы: на широком экране — верхняя навигация, на телефоне и планшете — нижняя панель вкладок
  const section = sectionOf(view);
  return withSettings(
    <div className={`shell is-${base.name} tab-${section}${wide ? "" : " has-tabbar"}`}>
      <PullRefresh />
      {wide && <TopNav current={section} go={go} />}
      {screen(base)}
      {!wide && <TabBar current={section} go={go} />}
      {view.name === "card" && (
        <CardViewer
          cards={cards}
          no={view.no}
          deck={DECK}
          onClose={() => go(view.from)}
          onOpen={(no) => go({ name: "card", no, from: view.from })}
        />
      )}
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
