import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { clockOffset, deviceTz, setClock } from "../core/dates";
import { hasPending } from "../core/serverday";
import { mergeStates, parseState, sameState, withPersonal } from "../core/state";
import type { AppState } from "../core/types";
import { goLogin } from "./auth";

/**
 * Синхронизация прогресса и личных настроек с сервером (server/progress.ts).
 * Копии сливаются (core/state.ts mergeStates): слова, дни и предложения — по отдельности, настройки — по пунктам,
 * поэтому занятие на одном устройстве не затирает сделанное на другом (в том числе без сети).
 *  - при запуске, возвращении в приложение и появлении сети — забираем серверную копию и сливаем с нашей;
 *    у сервера чего-то нет (занимались без сети, поменяли настройку) — отправляем итог;
 *  - после каждого изменения — отправляем (с задержкой, чтобы не слать каждый шаг занятия);
 *  - уходим из приложения — отправляем сразу (keepalive переживает закрытие вкладки).
 * Посреди занятия прогресс с сервера не подмешиваем (занятие идёт по своему плану), а настройки применяем сразу;
 * прогресс сольётся при следующей отправке.
 * Без сети ничего не теряется: кэш на устройстве уйдёт при следующей синхронизации.
 *
 * Дни решает сервер (server/progress.ts, core/serverday.ts): каждый ответ несёт его часы (now) — по ним приложение
 * считает «сегодня» (setClock), а сервер кладёт пройденные части в свой день. Пока у устройства есть итоги, которых
 * сервер не видел (без srv), синхронизация начинается с отправки: сервер сначала раскладывает их, потом устройство
 * забирает итог. В теле PUT — пояс устройства: сервер берёт его, пока своего пояса у пользователя нет.
 */

const PUSH_DELAY_MS = 800;

/** Поправка на часы сервера: now из ответа против середины запроса по часам устройства. */
const learnClock = (now: unknown, t0: number, t1: number) => {
  if (typeof now === "number" && Number.isFinite(now)) setClock({ offset: Math.round(now - (t0 + t1) / 2) });
};

/** undefined — сервер недоступен (офлайн, ошибка). */
const request = async (path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> } | undefined> => {
  try {
    const t0 = Date.now();
    const r = await fetch(path, { credentials: "same-origin", ...init });
    if (r.status === 401) {
      goLogin();
      return undefined;
    }
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    learnClock(body.now, t0, Date.now());
    return { status: r.status, body };
  } catch {
    return undefined;
  }
};
const stateOf = (r: Awaited<ReturnType<typeof request>>): AppState | null | undefined => {
  if (!r || r.status !== 200) return undefined;
  try {
    return r.body.state ? parseState(r.body.state) : null;
  } catch {
    return undefined;
  }
};

const fetchRemote = async () => stateOf(await request("/api/state"));
/**
 * Браузер не отправляет keepalive-запрос с телом больше 64 КБ (сразу ошибка сети), а прогресс через несколько
 * месяцев занятий крупнее. Большое — обычным запросом: при закрытии вкладки может не дойти, но кэш уйдёт при следующем запуске.
 */
export const KEEPALIVE_MAX_BYTES = 60_000;
export const pushBody = (s: AppState, keepalive: boolean) => {
  const body = JSON.stringify({ state: s, tz: deviceTz() });
  return { body, keepalive: keepalive && new Blob([body]).size <= KEEPALIVE_MAX_BYTES };
};
const pushRemote = async (s: AppState, keepalive = false) =>
  stateOf(await request("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, ...pushBody(s, keepalive) }));

/**
 * Сменить часовой пояс уроков на пояс устройства (настройки). Сервер разрешает раз в сутки:
 * отказ — текст и когда можно (next, ms по часам сервера); undefined — сервер недоступен.
 */
export const changeTimeZone = async (tz: string): Promise<{ state: AppState } | { error: string; next?: number } | undefined> => {
  const r = await request("/api/tz", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tz }) });
  if (!r) return undefined;
  if (r.status === 200) {
    const s = stateOf(r);
    return s ? { state: s } : undefined;
  }
  return { error: typeof r.body.error === "string" ? r.body.error : "не получилось", next: typeof r.body.next === "number" ? r.body.next : undefined };
};

/** Доступ к серверу (тесты подставляют свой). undefined — сервер недоступен; null — у сервера прогресса нет. */
export interface SyncApi {
  fetchRemote: () => Promise<AppState | null | undefined>;
  pushRemote: (s: AppState, keepalive: boolean) => Promise<AppState | null | undefined>;
}
const httpApi: SyncApi = { fetchRemote, pushRemote };

export interface SyncDeps {
  /** актуальный прогресс */
  current: () => AppState;
  /** принять итог слияния с сервером */
  adopt: (s: AppState) => void;
  /** сейчас идёт занятие: чужой прогресс посреди него не подменяем (настройки — сразу) */
  paused: () => boolean;
  /** поправка на часы сервера заметно изменилась (может смениться «сегодня») */
  onClock?: () => void;
}

/** Синхронизация без React: отправка (с очередью), забор, отложенная отправка и отправка при уходе. */
export const createSync = (d: SyncDeps, api: SyncApi = httpApi) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let busy = false,
    again = false;

  /** часы сервера заметно сдвинулись за время запроса — пусть приложение пересчитает «сегодня» */
  const watchClock = async <T>(f: () => Promise<T>): Promise<T> => {
    const off = clockOffset();
    const r = await f();
    if (Math.abs(clockOffset() - off) > 30_000) d.onClock?.();
    return r;
  };

  /** Слить серверную копию с нашей и применить, если что-то поменялось. true — у сервера не всё, что у нас. */
  const reconcile = (remote: AppState | null): boolean => {
    const local = d.current();
    if (!remote) return local.upd > 0;
    const merged = mergeStates(local, remote);
    if (!sameState(merged, local)) d.adopt(d.paused() ? withPersonal(local, merged) : merged);
    // у сервера ещё нет пояса — отправим пояс устройства
    return !remote.tz || !sameState(mergeStates(d.current(), remote), remote);
  };

  /** Отправить прогресс. Пока идёт отправка, новая ждёт и уходит одна — с самым свежим (keepalive — сразу). */
  const push = async (keepalive = false): Promise<void> => {
    if (d.current().upd === 0) return;
    if (busy && !keepalive) {
      again = true;
      return;
    }
    busy = true;
    try {
      const remote = await watchClock(() => api.pushRemote(d.current(), keepalive));
      // сервер вернул итог слияния (там могло быть новее — с другого устройства)
      if (remote !== undefined) reconcile(remote);
    } finally {
      busy = false;
      if (again) {
        again = false;
        void push();
      }
    }
  };

  /** Забрать серверную копию и слить. Есть итоги, которых сервер не видел, — сначала отдать их (день им выберет сервер). */
  const pull = async (): Promise<void> => {
    if (hasPending(d.current()) && !d.paused()) return push();
    const remote = await watchClock(api.fetchRemote);
    if (remote === undefined) return;
    if (reconcile(remote)) void push();
  };

  /** После изменения — отправить с задержкой (не каждый шаг занятия). */
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void push();
    }, PUSH_DELAY_MS);
  };

  /** Уходим из приложения: отложенное — сразу и keepalive (переживает закрытие вкладки). */
  const flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    void push(true);
  };

  return { push, pull, schedule, flush };
};

/**
 * @param current — актуальный прогресс (ref, чтобы не пересоздавать обработчики)
 * @param adopt — принять более новый прогресс с сервера
 * @param paused — сейчас идёт занятие: чужой прогресс не подменяем посреди него
 * @returns schedulePush — вызвать после каждого изменения
 */
export const useServerSync = (
  enabled: boolean,
  current: RefObject<AppState>,
  adopt: (s: AppState) => void,
  paused: RefObject<boolean>,
  /** поправка на часы сервера заметно изменилась (может смениться «сегодня») */
  onClock?: () => void,
) => {
  // свежие обработчики без пересоздания синхронизации
  const cb = useRef({ adopt, onClock });
  cb.current = { adopt, onClock };
  const sync = useMemo(
    () =>
      enabled
        ? createSync({
            current: () => current.current,
            adopt: (s) => cb.current.adopt(s),
            paused: () => !!paused.current,
            onClock: () => cb.current.onClock?.(),
          })
        : null,
    [enabled, current, paused],
  );

  useEffect(() => {
    if (!sync) return;
    void sync.pull();
    const onVisibility = () => (document.visibilityState === "visible" ? void sync.pull() : sync.flush());
    const onOnline = () => void sync.pull();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline); // вернулись в окно (на маке вкладка могла не скрываться)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
      sync.flush(); // отложенное изменение не теряем — отправляем сразу
    };
  }, [sync]);

  return useCallback(() => sync?.schedule(), [sync]);
};
