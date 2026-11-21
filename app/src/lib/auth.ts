import { useCallback, useEffect, useState } from "react";
import type { DeviceHint, DeviceKind } from "../core/device";

/** Клиентская часть входа: проверка сессии, переход на /login, выход. Сам вход — на странице /login. */

export interface Me {
  user: { name: string; displayName: string };
  passkeys: number;
}

/** На страницу входа, с возвратом туда, где был. */
export const goLogin = () => {
  const here = location.pathname + location.search;
  location.replace(here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`);
};

/**
 * Сессия жива? Нет — на вход (промис не завершится). Без сети — null: работаем дальше
 * (приложение может быть из кэша), прогресс — из кэша последнего вошедшего.
 * timeoutMs — сколько ждать ответа, если есть кэш: на плохой сети (не офлайн) запрос висит долго, а экран белый.
 * Сессию, которая на самом деле истекла, поймает первая синхронизация (401 → вход).
 */
export const ensureSession = async (timeoutMs?: number): Promise<Me | null> => {
  let r: Response;
  try {
    const signal = timeoutMs && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined;
    r = await fetch("/api/auth/me", { credentials: "same-origin", signal });
  } catch {
    return null; // офлайн или не дождались
  }
  if (r.status === 401) {
    goLogin();
    return new Promise<never>(() => {});
  }
  if (r.ok) sendDeviceHint();
  try {
    return r.ok ? ((await r.json()) as Me) : null;
  } catch {
    return null;
  }
};

export const useMe = () => {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let on = true;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
      .then((m) => on && setMe(m))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  return me;
};

export const logout = async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}", credentials: "same-origin" });
  } finally {
    location.replace("/login");
  }
};

/* ---------- устройства, где выполнен вход (настройки → «Вход») ---------- */

const post = (path: string, body: unknown = {}) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });

/**
 * Сказать серверу о себе то, чего нет в User-Agent: iPadOS Safari выдаёт себя за Mac (отличаем по сенсорному экрану),
 * установленное приложение — по display-mode. Только два флага: имя устройства сервер выводит сам.
 */
export const sendDeviceHint = () => {
  try {
    const hint: DeviceHint = {
      touch: navigator.maxTouchPoints > 1,
      standalone: matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true,
    };
    void post("/api/auth/device", hint).catch(() => {});
  } catch {
    /* не страшно: останется имя по User-Agent */
  }
};

export interface DeviceSession {
  id: string;
  name: string;
  kind: DeviceKind;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}
export interface Devices {
  sessions: DeviceSession[];
  passkeys: { count: number; synced: number };
}

/**
 * Список устройств (GET /api/auth/sessions); загружается при каждом открытии экрана.
 * null — ещё грузится или сервер недоступен (без сети список не показываем).
 */
export const useDevices = () => {
  const [data, setData] = useState<Devices | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/sessions", { credentials: "same-origin", cache: "no-store" });
      if (r.status === 401) return goLogin(); // на этом устройстве вышли (например, с другого)
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as Devices);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, failed, reload: load };
};

/** Выйти на другом устройстве. Если это текущее — обычный выход. */
export const revokeDevice = async (id: string): Promise<boolean> => {
  try {
    const r = await post("/api/auth/sessions/revoke", { id });
    if (r.ok && ((await r.json()) as { current?: boolean }).current) location.replace("/login");
    return r.ok || r.status === 404; // 404 — там уже вышли
  } catch {
    return false;
  }
};

/** Выйти везде, кроме этого устройства. */
export const revokeOtherDevices = async (): Promise<boolean> => {
  try {
    return (await post("/api/auth/sessions/revoke-others")).ok;
  } catch {
    return false;
  }
};
