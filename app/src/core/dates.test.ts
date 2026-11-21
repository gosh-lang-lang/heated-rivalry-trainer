import { describe, expect, it } from "vitest";
import { greeting } from "./dates";

const at = (h: number, m = 0) => new Date(2026, 10, 21, h, m);

describe("greeting — по часам устройства", () => {
  it("утро, день, вечер, ночь", () => {
    expect(greeting(at(5))).toBe("Доброе утро");
    expect(greeting(at(11, 59))).toBe("Доброе утро");
    expect(greeting(at(12))).toBe("Добрый день");
    expect(greeting(at(16, 59))).toBe("Добрый день");
    expect(greeting(at(17))).toBe("Добрый вечер");
    expect(greeting(at(22, 59))).toBe("Добрый вечер");
    expect(greeting(at(23))).toBe("Доброй ночи");
    expect(greeting(at(0, 30))).toBe("Доброй ночи");
    expect(greeting(at(4, 59))).toBe("Доброй ночи");
  });
});
