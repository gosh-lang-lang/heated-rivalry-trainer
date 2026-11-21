import { describe, expect, it } from "vitest";
import { PULL_THRESHOLD, pullDistance, pullProgress } from "./pull";

describe("потяни, чтобы обновить: резина и путь игроков", () => {
  it("вверх и на месте — страница не двигается", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-50)).toBe(0);
  });

  it("сначала почти за пальцем, дальше всё туже и не больше предела", () => {
    expect(pullDistance(10)).toBeGreaterThan(8);
    expect(pullDistance(10)).toBeLessThan(10);
    const step1 = pullDistance(100) - pullDistance(50);
    const step2 = pullDistance(250) - pullDistance(200);
    expect(step2).toBeLessThan(step1 / 2);
    expect(pullDistance(5000)).toBeLessThanOrEqual(150);
  });

  it("порог — примерно на 130–140 px пальца, как у системного", () => {
    expect(pullDistance(120)).toBeLessThan(PULL_THRESHOLD);
    expect(pullDistance(145)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
  });

  it("игроки доезжают до центра ровно на пороге и дальше не едут", () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(PULL_THRESHOLD / 2)).toBe(0.5);
    expect(pullProgress(PULL_THRESHOLD)).toBe(1);
    expect(pullProgress(140)).toBe(1);
    expect(pullProgress(-3)).toBe(0);
  });
});

describe("на компьютере: трекпад и клавиши обновления", () => {
  it("прокрутка — в пикселях, строки и страницы переводятся", async () => {
    const { wheelPixels } = await import("./pull");
    expect(wheelPixels({ deltaY: -12, deltaMode: 0 })).toBe(-12);
    expect(wheelPixels({ deltaY: -3, deltaMode: 1 })).toBe(-48);
    expect(wheelPixels({ deltaY: 1, deltaMode: 2 })).toBe(600);
  });

  it("⌘R, Ctrl+R (и в русской раскладке), F5 — да; с Shift, Alt и просто R — нет", async () => {
    const { isReloadKey } = await import("./pull");
    const k = (key: string, m: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>> = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...m });
    expect(isReloadKey(k("r", { metaKey: true }))).toBe(true);
    expect(isReloadKey(k("R", { ctrlKey: true }))).toBe(true);
    expect(isReloadKey(k("к", { metaKey: true }))).toBe(true);
    expect(isReloadKey(k("F5"))).toBe(true);
    expect(isReloadKey(k("r"))).toBe(false);
    expect(isReloadKey(k("r", { metaKey: true, shiftKey: true }))).toBe(false);
    expect(isReloadKey(k("F5", { shiftKey: true }))).toBe(false);
    expect(isReloadKey(k("r", { metaKey: true, altKey: true }))).toBe(false);
  });
});
