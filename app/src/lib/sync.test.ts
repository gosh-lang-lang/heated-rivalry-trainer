import { describe, expect, it } from "vitest";
import { emptyState } from "../core/state";
import { KEEPALIVE_MAX_BYTES, pushBody } from "./sync";

describe("pushBody", () => {
  it("небольшой прогресс при уходе из приложения — keepalive", () => {
    expect(pushBody({ ...emptyState(), upd: 1 }, true).keepalive).toBe(true);
  });
  it("прогресс крупнее предела браузера для keepalive (64 КБ) — обычным запросом, иначе он не уйдёт вовсе", () => {
    const s = { ...emptyState(), upd: 1 };
    for (let i = 0; i < 1500; i++) s.srs[`word-${i}`] = { lvl: 3, due: "2027-01-12", intro: "2026-11-20", right: 7, wrong: 2 };
    const r = pushBody(s, true);
    expect(new Blob([r.body]).size).toBeGreaterThan(KEEPALIVE_MAX_BYTES);
    expect(r.keepalive).toBe(false);
  });
  it("без просьбы — не keepalive", () => {
    expect(pushBody({ ...emptyState(), upd: 1 }, false).keepalive).toBe(false);
  });
});
