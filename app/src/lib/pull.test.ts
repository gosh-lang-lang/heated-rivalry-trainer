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
