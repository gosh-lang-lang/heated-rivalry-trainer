import { useEffect, useState } from "react";

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

/** Сессия жива? Нет — на вход. Без сети — работаем дальше (приложение может быть из кэша). */
export const ensureSession = async () => {
  try {
    const r = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (r.status === 401) goLogin();
  } catch {
    /* офлайн */
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
