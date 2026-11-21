import { describe, expect, it } from "vitest";
import { ctcUnits, createPronEngine, expectedAtoms, pcm16ToFloat, type PronModel } from "./pron.ts";

const UNITS = ["<pad>", "<s>", "θ", "ɪ", "ŋ", "k", "s"];
/** Логиты: по кадру — индекс лучшего класса (логит 10) и, если нужно, второй с заметной вероятностью. */
const logits = (frames: (number | [number, number])[]) => {
  const out = new Float32Array(frames.length * UNITS.length);
  frames.forEach((f, t) => {
    const [best, second] = Array.isArray(f) ? f : [f, -1];
    out[t * UNITS.length + best] = 10;
    if (second >= 0) out[t * UNITS.length + second] = 9; // ~27%
  });
  return out;
};

describe("декодирование CTC", () => {
  it("повторы схлопываются, пустой и служебные классы — прочь", () => {
    const f = [0, 2, 2, 0, 3, 3, 4, 0, 5, 1, 0];
    expect(ctcUnits(logits(f), f.length, UNITS.length, UNITS)).toEqual([{ u: "θ" }, { u: "ɪ" }, { u: "ŋ" }, { u: "k" }]);
  });
  it("одинаковые звуки подряд через пустой кадр — два звука", () => {
    const f = [5, 0, 5];
    expect(ctcUnits(logits(f), f.length, UNITS.length, UNITS).map((x) => x.u)).toEqual(["k", "k"]);
  });
  it("заметный второй вариант — в сомнениях модели", () => {
    const f: (number | [number, number])[] = [[6, 2], 6, 3];
    expect(ctcUnits(logits(f), f.length, UNITS.length, UNITS)).toEqual([{ u: "s", alt: ["θ"] }, { u: "ɪ" }]);
  });
});

describe("запись", () => {
  it("PCM 16 бит → −1…1", () => {
    const b = new Uint8Array(new Int16Array([0, 16384, -32768, 32767]).buffer);
    expect([...pcm16ToFloat(b)]).toEqual([0, 0.5, -1, 32767 / 32768]);
  });
});

/** Подделка модели: «слышит» заданные звуки, читает текст по словарю. */
const fake = (heard: string[], dict: Record<string, string>, log: string[] = []): PronModel => ({
  ready: Promise.resolve(),
  hear: async () => heard.map((u) => ({ u })),
  ipa: async (text) => (log.push(text), [text.split(" ").map((w) => dict[w.toLowerCase()] ?? "?").join(" ")]),
});

describe("оценка на сервере", () => {
  const dict = { i: "aɪ", think: "θˈɪŋk", so: "sˈoʊ" };

  it("звуки фразы из espeak; оценка по словам", async () => {
    const r = await createPronEngine(fake(["aɪ", "s", "ɪ", "ŋ", "k", "s", "oʊ"], dict)).assess(new Float32Array(1600), "I think so.");
    expect(r.words.map((w) => [w.w, w.mark])).toEqual([["I", "good"], ["think", "so"], ["so", "good"]]);
    expect(r.words[1].issues).toEqual([{ exp: "θ", got: "s" }]);
  });

  it("espeak слил слова — звуки берутся по одному слову", async () => {
    const m: PronModel = { ...fake([], dict), ipa: async (t) => (t.includes(" ") ? ["aɪθˈɪŋk"] : [dict[t.toLowerCase() as keyof typeof dict]]) };
    expect(await expectedAtoms(m, ["I", "think"])).toEqual([["aɪ"], ["θ", "ɪ", "ŋ", "k"]]);
  });

  it("звуки одной и той же фразы читаются один раз", async () => {
    const log: string[] = [];
    const e = createPronEngine(fake(["aɪ"], dict, log));
    await e.assess(new Float32Array(10), "I think");
    await e.assess(new Float32Array(10), "i think");
    expect(log).toEqual(["I think"]);
    expect(e.busy()).toBe(0);
  });
});
