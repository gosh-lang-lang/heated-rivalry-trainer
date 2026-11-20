import { describe, expect, it } from "vitest";
import { buildCheckPrompt, parseVerdict } from "./check";

describe("проверка своего предложения", () => {
  it("промпт содержит слова и текст", () => {
    const p = buildCheckPrompt([{ en: "endure", ru: "вытерпеть" }], "I endured a long day.");
    expect(p).toContain('"endure" (вытерпеть)');
    expect(p).toContain('"""I endured a long day."""');
  });
  it("разбирает JSON внутри текста", () => {
    expect(parseVerdict('Sure! {"ok": false, "corrected": "I endured it.", "comment": "Время."}', "x")).toEqual({
      ok: false, corrected: "I endured it.", comment: "Время.",
    });
  });
  it("corrected по умолчанию — исходный текст", () => {
    expect(parseVerdict({ ok: true }, "Hi")).toEqual({ ok: true, corrected: "Hi", comment: "" });
  });
  it("без ok — null", () => {
    expect(parseVerdict("no json", "x")).toBeNull();
    expect(parseVerdict({ corrected: "x" }, "x")).toBeNull();
  });
});
