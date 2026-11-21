/**
 * Настоящая оценка произношения: Kokoro произносит фразу, отдельный процесс с wav2vec2 её оценивает.
 * Медленно (загрузка двух моделей), зато проверяет то, что подделки не ловят: модель грузится в отдельном
 * процессе рядом с Kokoro, звуки распознаются, верная фраза проходит, чужая — нет.
 * Модели берутся из кэша node_modules/@huggingface/transformers/.cache (первый раз — скачиваются).
 */
import { KokoroTTS } from "kokoro-js";
import { afterAll, describe, expect, it } from "vitest";
import { PRON_PASS, PRON_RATE } from "../src/core/pron.ts";
import { createPronEngine, processModel } from "./pron.ts";

/** Kokoro даёт 24 кГц, модели нужно 16 кГц. */
const resample = (x: Float32Array, from: number) => {
  const n = Math.floor((x.length * PRON_RATE) / from),
    y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i * from) / PRON_RATE,
      k = Math.floor(p),
      f = p - k;
    y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? 0) * f;
  }
  return y;
};

const keep = setInterval(() => {}, 1e6); // процесс оценки не держит цикл событий (как и в сервере, где его держит HTTP)
afterAll(() => clearInterval(keep));

describe("оценка произношения на сервере", () => {
  const engine = createPronEngine(processModel());

  it("верная фраза проходит, чужой текст к той же записи — нет; ошибка указывает на слово", { timeout: 240_000 }, async () => {
    const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
    await engine.ready;
    const speak = async (text: string, voice: string) => {
      const a = await tts.generate(text, { voice: voice as never });
      return resample(a.audio as Float32Array, a.sampling_rate);
    };
    const phrase = "I devoured the book in two days.";
    for (const voice of ["af_heart", "bm_george"]) {
      const pcm = await speak(phrase, voice);
      const good = await engine.assess(pcm.slice(), phrase);
      expect(good.score, voice).toBeGreaterThanOrEqual(85);
      const bad = await engine.assess(pcm.slice(), "He bent down to tie his skates.");
      expect(bad.score, voice).toBeLessThan(PRON_PASS);
    }
    // сказано «sink» вместо «think»: слово не зелёное, ошибка — в звуке θ (во фразе Kokoro сам «исправляет» sink на think)
    const r = await engine.assess(await speak("sink", "af_heart"), "think");
    expect(r.words[0].mark).not.toBe("good");
    expect(r.words[0].issues).toContainEqual({ exp: "θ", got: "s" });
  });
});
