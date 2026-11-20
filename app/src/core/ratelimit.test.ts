import { describe, expect, it } from "vitest";
import { createLimiter } from "./ratelimit";

describe("ограничение частоты", () => {
  it("пускает limit событий за окно, потом отказывает", () => {
    const l = createLimiter(3, 1000);
    expect([0, 1, 2, 3].map((t) => l.take("a", t))).toEqual([true, true, true, false]);
    expect(l.retryAfter("a", 3)).toBe(997);
  });
  it("окно скользит", () => {
    const l = createLimiter(2, 1000);
    l.take("a", 0);
    l.take("a", 500);
    expect(l.take("a", 999)).toBe(false);
    expect(l.take("a", 1000)).toBe(true);
  });
  it("ключи независимы", () => {
    const l = createLimiter(1, 1000);
    expect(l.take("a", 0)).toBe(true);
    expect(l.take("b", 0)).toBe(true);
    expect(l.take("a", 1)).toBe(false);
  });
  it("старые ключи вытесняются", () => {
    const l = createLimiter(1, 1000, 2);
    l.take("a", 0);
    l.take("b", 0);
    l.take("c", 0);
    expect(l.take("a", 1)).toBe(true); // «a» забыт
  });
});
