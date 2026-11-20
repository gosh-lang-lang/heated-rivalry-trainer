/**
 * Настоящая озвучка: поток с Kokoro → MP3 → файл. Медленно (загрузка модели), зато проверяет то,
 * что подделки в остальных тестах не ловят: модель грузится, голоса существуют, MP3 слышимой длины.
 * Модель берётся из кэша node_modules/@huggingface/transformers/.cache (первый раз — скачивается).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createEngine } from "./tts.ts";

const dir = mkdtempSync(join(tmpdir(), "hr-kokoro-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("Kokoro на сервере", () => {
  const engine = createEngine(dir, "fp32"); // как на проде

  it("американский и британский голоса озвучивают фразу в MP3 разумной длины", { timeout: 180_000 }, async () => {
    await engine.ready;
    for (const voice of ["af_heart", "bf_emma"]) {
      const mp3 = readFileSync(engine.file(await engine.ensure("He hated him, obviously.", voice)));
      expect(mp3[0], voice).toBe(0xff); // кадр MPEG
      expect(mp3[1] & 0xe0, voice).toBe(0xe0);
      const seconds = mp3.length / 8000; // 64 кбит/с
      expect(seconds, voice).toBeGreaterThan(0.8);
      expect(seconds, voice).toBeLessThan(6);
    }
    expect(engine.stats().generated).toBe(2);
  });
});
