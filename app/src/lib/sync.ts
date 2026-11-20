import { useCallback, useEffect, useRef, type RefObject } from "react";
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
 */

const PUSH_DELAY_MS = 800;

/** undefined — сервер недоступен (офлайн, ошибка). */
const request = async (init?: RequestInit): Promise<AppState | null | undefined> => {
  try {
    const r = await fetch("/api/state", { credentials: "same-origin", ...init });
    if (r.status === 401) {
      goLogin();
      return undefined;
    }
    if (!r.ok) return undefined;
    const body = (await r.json()) as { state: unknown };
    return body.state ? parseState(body.state) : null;
  } catch {
    return undefined;
  }
};

const fetchRemote = () => request();
const pushRemote = (s: AppState, keepalive = false) =>
  request({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: s }), keepalive });

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
        adopt(paused.current ? { ...local, settings: merged.settings, settingsAt: merged.settingsAt } : merged);
      return !sameState(mergeStates(current.current, remote), remote);
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
      try {
        const remote = await pushRemote(current.current, keepalive);
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
    [enabled, current, reconcile],
  );

  const pull = useCallback(async () => {
    if (!enabled) return;
    const remote = await fetchRemote();
    if (remote === undefined) return;
    if (reconcile(remote)) void push();
  }, [enabled, reconcile, push]);

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
