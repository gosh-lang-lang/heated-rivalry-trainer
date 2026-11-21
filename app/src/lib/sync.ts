import { useCallback, useEffect, useRef, type RefObject } from "react";
import { clockOffset, deviceTz, setClock } from "../core/dates";
import { hasPending } from "../core/serverday";
import { mergeStates, parseState, sameState } from "../core/state";
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
const pushRemote = async (s: AppState, keepalive = false) =>
  stateOf(
    await request("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: s, tz: deviceTz() }),
      keepalive,
    }),
  );

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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const again = useRef(false);

  /** Слить серверную копию с нашей и применить, если что-то поменялось. true — у сервера не всё, что у нас. */
  const reconcile = useCallback(
    (remote: AppState | null): boolean => {
      const local = current.current;
      if (!remote) return local.upd > 0;
      const merged = mergeStates(local, remote);
      if (!sameState(merged, local))
        adopt(paused.current ? { ...local, settings: merged.settings, settingsAt: merged.settingsAt, tz: merged.tz, tzAt: merged.tzAt } : merged);
      // у сервера ещё нет пояса — отправим пояс устройства
      return !remote.tz || !sameState(mergeStates(current.current, remote), remote);
    },
    [current, adopt, paused],
  );

  const push = useCallback(
    async (keepalive = false) => {
      if (!enabled || current.current.upd === 0) return;
      if (busy.current && !keepalive) {
        again.current = true;
        return;
      }
      busy.current = true;
      const off = clockOffset();
      try {
        const remote = await pushRemote(current.current, keepalive);
        if (Math.abs(clockOffset() - off) > 30_000) onClock?.();
        // сервер вернул итог слияния (там могло быть новее — с другого устройства)
        if (remote !== undefined) reconcile(remote);
      } finally {
        busy.current = false;
        if (again.current) {
          again.current = false;
          void push();
        }
      }
    },
    [enabled, current, reconcile, onClock],
  );

  const pull = useCallback(async () => {
    if (!enabled) return;
    // есть итоги, которых сервер не видел, — сначала отдать их ему: день им выберет сервер, ответ — уже с ними
    if (hasPending(current.current) && !paused.current) return push();
    const off = clockOffset();
    const remote = await fetchRemote();
    if (Math.abs(clockOffset() - off) > 30_000) onClock?.();
    if (remote === undefined) return;
    if (reconcile(remote)) void push();
  }, [enabled, reconcile, push, current, paused, onClock]);

  const schedulePush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void push();
    }, PUSH_DELAY_MS);
  }, [push]);

  useEffect(() => {
    if (!enabled) return;
    void pull();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void pull();
      else if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void push(true);
      }
    };
    const onOnline = () => void pull();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline); // вернулись в окно (на маке вкладка могла не скрываться)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
    };
  }, [enabled, pull, push]);

  return schedulePush;
};
