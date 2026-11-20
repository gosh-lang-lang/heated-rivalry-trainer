import { useCallback, useEffect, useRef, type RefObject } from "react";
import { parseState } from "../core/state";
import type { AppState } from "../core/types";
import { goLogin } from "./auth";

/**
 * Синхронизация прогресса с сервером (server/progress.ts). Правило одно — побеждает более новый upd:
 *  - при запуске, возвращении в приложение и появлении сети — забираем серверную копию;
 *    она новее — берём её, наша новее (занимались без сети, прогресс из прототипа) — отправляем свою;
 *  - после каждого изменения — отправляем (с задержкой, чтобы не слать каждый шаг занятия);
 *  - уходим из приложения — отправляем сразу (keepalive переживает закрытие вкладки).
 * Без сети ничего не теряется: кэш на устройстве новее серверного и уйдёт при следующей синхронизации.
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
        // на сервере оказалось новее (другое устройство) — берём его
        if (remote && remote.upd > current.current.upd && !paused.current) adopt(remote);
      } finally {
        busy.current = false;
        if (again.current) {
          again.current = false;
          void push();
        }
      }
    },
    [enabled, current, adopt, paused],
  );

  const pull = useCallback(async () => {
    if (!enabled) return;
    const remote = await fetchRemote();
    if (remote === undefined) return;
    const local = current.current;
    if (remote && remote.upd > local.upd) {
      if (!paused.current) adopt(remote);
    } else if (!remote || local.upd > remote.upd) void push();
  }, [enabled, current, adopt, paused, push]);

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
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, pull, push]);

  return schedulePush;
};
