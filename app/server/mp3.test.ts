import { describe, expect, it } from "vitest";
import { toMp3 } from "./mp3.ts";

const tone = (seconds: number, rate: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * 440 * i) / rate));

/** Длительность MP3 по заголовкам кадров MPEG-1/2 Layer III (без внешних библиотек). */
const frames = (b: Uint8Array) => {
  let n = 0,
    i = 0,
    rate = 0;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return { n, rate, junk: true };
    const v1 = (b[i + 1] & 0x18) === 0x18;
    const br = (v1 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[b[i + 2] >> 4];
    rate = (v1 ? [44100, 48000, 32000] : [22050, 24000, 16000])[(b[i + 2] >> 2) & 3];
    const len = Math.floor(((v1 ? 144 : 72) * br * 1000) / rate) + ((b[i + 2] >> 1) & 1);
    i += len;
    n++;
  }
  return { n, rate, junk: false };
};

describe("MP3", () => {
  it("Kokoro отдаёт 24 кГц — получается корректный MP3 той же длительности", () => {
    const mp3 = toMp3(tone(1, 24000), 24000);
    const f = frames(mp3);
    expect(f.junk).toBe(false);
    expect(f.rate).toBe(24000);
    expect(f.n * 576).toBeGreaterThanOrEqual(24000); // MPEG-2: 576 отсчётов в кадре
    expect(f.n * 576).toBeLessThan(24000 + 3 * 576);
    expect(mp3.length).toBeLessThan(10_000); // 64 кбит/с ≈ 8 КБ на секунду
  });

  it("перегруз не ломает кодирование, тишина и пустой звук — тоже", () => {
    expect(frames(toMp3(tone(0.3, 24000, 3), 24000)).junk).toBe(false);
    expect(frames(toMp3(new Float32Array(24000), 24000)).junk).toBe(false);
    expect(() => toMp3(new Float32Array(0), 24000)).not.toThrow();
  });

  it("результат — отдельный буфер (его можно передать между потоками)", () => {
    const mp3 = toMp3(tone(0.2, 24000), 24000);
    expect(mp3.byteOffset).toBe(0);
    expect(mp3.buffer.byteLength).toBe(mp3.length);
  });
});
