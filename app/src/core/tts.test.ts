import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE, isTtsVoice, spokenText, ttsCacheSource, ttsRequestError } from "./tts";

describe("озвучка", () => {
  it("тире между формами читается как пауза", () => expect(spokenText("bend — bent")).toBe("bend, bent"));
  it("дефис внутри слова не трогаем", () => expect(spokenText("enemies-to-lovers")).toBe("enemies-to-lovers"));
  it("голос по умолчанию — из списка", () => expect(isTtsVoice(DEFAULT_VOICE)).toBe(true));
  it("проверка запроса", () => {
    expect(ttsRequestError("hello", undefined)).toBeNull();
    expect(ttsRequestError("hello", "bf_emma")).toBeNull();
    expect(ttsRequestError("  ", undefined)).toMatch(/text/);
    expect(ttsRequestError("x".repeat(401), undefined)).toMatch(/400/);
    expect(ttsRequestError("hi", "zarvox")).toMatch(/голос/);
    expect(ttsRequestError(42, undefined)).toMatch(/text/);
  });
  it("ключ кэша зависит от голоса и не зависит от лишних пробелов", () => {
    expect(ttsCacheSource("a  b", "af_heart")).toBe(ttsCacheSource("a b", "af_heart"));
    expect(ttsCacheSource("a b", "af_heart")).not.toBe(ttsCacheSource("a b", "bf_emma"));
  });
});
