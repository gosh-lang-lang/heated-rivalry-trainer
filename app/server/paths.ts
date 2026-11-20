import { normalize } from "node:path";

/** Нормализованный путь: %-последовательности раскрыты, «..» убраны. null — некорректный. */
export const cleanPath = (pathname: string): string | null => {
  try {
    const p = normalize(decodeURIComponent(pathname)).replace(/\\/g, "/");
    return p.startsWith("/") && !p.includes("\0") && !p.split("/").includes("..") ? p : null;
  } catch {
    return null;
  }
};
/** Страница входа и то, что ей нужно, — без сессии. Проверять по cleanPath(). */
export const isPublicAsset = (p: string | null) =>
  !!p && (p === "/login" || p === "/login.html" || /^\/auth\/[\w.-]+$/.test(p) || ["/icon.svg", "/icon-512.png", "/apple-touch-icon.png", "/favicon.ico", "/manifest.webmanifest"].includes(p));
