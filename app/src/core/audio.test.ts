import { describe, expect, it } from "vitest";
import { createEndpointer, resample, rms, toPcm16, trimSilence } from "./audio";

const RATE = 16000;
/** Синус 220 Гц амплитудой amp на sec секунд. */
const tone = (sec: number, amp = 0.3, rate = RATE) => Float32Array.from({ length: Math.round(sec * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / rate));
const silence = (sec: number, rate = RATE) => new Float32Array(Math.round(sec * rate)).map(() => (Math.random() - 0.5) * 0.002);
const cat = (...xs: Float32Array[]) => {
  const out = new Float32Array(xs.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of xs) out.set(x, (o += x.length) - x.length);
  return out;
};

describe("конец записи по тишине", () => {
  const feed = (end: ReturnType<typeof createEndpointer>, levels: [number, number][]) => {
    let r = "";
    for (const [level, ms] of levels) for (let t = 0; t < ms; t += 50) if ((r = end(level, 50)) === "stop") return { r, at: t };
    return { r, at: -1 };
  };
  it("речь, потом тишина дольше silenceMs — стоп", () => {
    const end = createEndpointer({ silenceMs: 800, maxMs: 15000 });
    expect(feed(end, [[0.001, 300], [0.2, 1000], [0.001, 700]]).r).toBe("speech");
    expect(end(0.001, 100)).toBe("stop");
  });
  it("до речи тишина не заканчивает запись, но через idleMs — стоп", () => {
    const end = createEndpointer({ silenceMs: 800, maxMs: 15000, idleMs: 3000 });
    expect(feed(end, [[0.001, 2900]]).r).toBe("wait");
    expect(end(0.001, 100)).toBe("stop");
  });
  it("громкий фон поднимает порог: шум не считается речью", () => {
    const end = createEndpointer({ silenceMs: 800, maxMs: 15000 });
    expect(feed(end, [[0.03, 2000]]).r).toBe("wait");
    expect(feed(end, [[0.2, 500]]).r).toBe("speech");
  });
  it("заговорили сразу, без паузы в начале — речь всё равно замечается и пауза заканчивает запись", () => {
    const end = createEndpointer({ silenceMs: 800, maxMs: 15000 });
    expect(feed(end, [[0.2, 1000]]).r).toBe("speech");
    expect(feed(end, [[0.001, 850]]).r).toBe("stop");
  });
  it("предел длины", () => {
    const end = createEndpointer({ silenceMs: 800, maxMs: 1000 });
    expect(feed(end, [[0.2, 2000]])).toEqual({ r: "stop", at: 950 });
  });
});

describe("обработка записи", () => {
  it("обрезка тишины по краям с запасом 0,2 с", () => {
    const x = cat(silence(1), tone(0.5), silence(1.5));
    const y = trimSilence(x, RATE);
    expect(y.length / RATE).toBeGreaterThan(0.85);
    expect(y.length / RATE).toBeLessThan(0.95);
    expect(rms(y)).toBeGreaterThan(0.15);
  });
  it("речь без пауз по краям — запись целиком", () => expect(trimSilence(tone(0.3), RATE)).toHaveLength(0.3 * RATE));
  it("совсем тихая запись — пусто", () => expect(trimSilence(silence(1), RATE)).toHaveLength(0));
  it("48 кГц → 16 кГц: втрое короче, громкость тона сохраняется", () => {
    const y = resample(tone(1, 0.3, 48000), 48000, 16000);
    expect(y.length).toBe(16000);
    expect(rms(y)).toBeCloseTo(0.3 / Math.SQRT2, 1);
  });
  it("PCM 16 бит little-endian, с ограничением", () => {
    expect([...new Int16Array(toPcm16(Float32Array.from([0, 0.5, -1, 2])).buffer)]).toEqual([0, 16384, -32768, 32767]);
  });
});
