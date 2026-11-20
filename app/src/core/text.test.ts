import { describe, expect, it } from "vitest";
import { buildTokens, checkTyped, gapSentence, norm, plural, speakScore } from "./text";

describe("сравнение ответов", () => {
  it("нормализация: регистр, апострофы, пунктуация", () => {
    expect(norm("  Get under MY skin! ")).toBe("get under my skin");
    expect(norm("one’s")).toBe("one's");
  });
  it("точный ответ", () => expect(checkTyped("Sacred", "sacred")).toEqual({ ok: true, typo: false }));
  it("одна опечатка прощается для слов длиннее 5 букв", () => {
    expect(checkTyped("sacrd", "sacred")).toEqual({ ok: true, typo: true });
    expect(checkTyped("devourd", "devoured")).toEqual({ ok: true, typo: true });
  });
  it("короткие слова — без поблажек", () => {
    expect(checkTyped("pck", "puck").ok).toBe(false);
    expect(checkTyped("mx", "mix").ok).toBe(false);
  });
  it("две опечатки — ошибка", () => expect(checkTyped("scrd", "sacred").ok).toBe(false));
  it("пустой ответ — ошибка", () => expect(checkTyped("", "sacred").ok).toBe(false));
});

describe("задания", () => {
  it("пропуск в предложении", () => {
    expect(gapSentence("I devoured the book in two days.", "devoured")).toEqual(["I ", " the book in two days."]);
  });
  it("токены сборки без финальной точки", () => {
    expect(buildTokens("He winked at me and smiled.")).toEqual(["He", "winked", "at", "me", "and", "smiled"]);
  });
  it("говорение: порог 80% слов", () => {
    expect(speakScore("He bent down to tie his skates.", "he bent down to tie his skates").ok).toBe(true);
    const r = speakScore("He bent down to tie his skates.", "he bent down");
    expect(r.ok).toBe(false);
    expect(r.miss).toEqual(["to", "tie", "his", "skates"]);
  });
  it("склонение", () => {
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => plural(n, "день", "дня", "дней"))).toEqual([
      "день", "дня", "дней", "дней", "день", "дня", "дней",
    ]);
  });
});
