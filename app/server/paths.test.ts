import { describe, expect, it } from "vitest";
import { cleanPath, isPublicAsset } from "./paths.ts";

const pub = (p: string) => isPublicAsset(cleanPath(p));

describe("публичные пути (без входа)", () => {
  it("страница входа, её скрипты и иконки — публичны", () => {
    for (const p of ["/login", "/login.html", "/auth/login-abc123.js", "/icon.svg", "/apple-touch-icon.png", "/manifest.webmanifest"]) expect(pub(p)).toBe(true);
  });
  it("приложение и API — нет", () => {
    for (const p of ["/", "/index.html", "/assets/index-x.js", "/sw.js", "/api/tts", "/auth/", "/auth/x/y.js", "/loginx"])
      expect(pub(p)).toBe(false);
  });
  it("обход через %2e%2e и обратные слэши не работает", () => {
    expect(pub("/auth/%2e%2e/index.html")).toBe(false);
    expect(cleanPath("/auth/%2e%2e/index.html")).toBe("/index.html");
    expect(pub("/auth/..%2findex.html")).toBe(false);
    expect(pub("/auth/%5c..%5cindex.html")).toBe(false);
    // выше корня не подняться: путь остаётся внутри dist/
    expect(cleanPath("/%2e%2e/%2e%2e/etc/passwd")).toBe("/etc/passwd");
  });
  it("битая кодировка и нулевой байт — некорректный путь", () => {
    expect(cleanPath("/%E0%A4%A")).toBeNull();
    expect(cleanPath("/auth/a%00.js")).toBeNull();
  });
});
