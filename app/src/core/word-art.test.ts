import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import words from "../../../words.json";
import gen from "./word-art.gen.json";
import { ART_CANVAS, SCENES, artFrame, artUrl, boxStyle, checkArt, listCrop, toKeyframes, type ArtGen, type ArtSceneSpec } from "./word-art";

const GEN = gen as unknown as ArtGen;
const IDS = words.words.map((w) => w.id);
const PUBLIC = join(__dirname, "../../public");

describe("сцены к словам: данные", () => {
  it("описание, собранные слои и слова согласованы", () => {
    expect(checkArt(SCENES, GEN, IDS)).toEqual([]);
  });

  it("у каждой сцены есть файлы всех слоёв, кроп для списка и целая картинка; сцена ≤ 120 КБ", () => {
    for (const [id, g] of Object.entries(GEN)) {
      let total = 0;
      for (const l of g.layers) {
        const f = join(PUBLIC, "words", id, `${l.name}.webp`);
        expect(existsSync(f), f).toBe(true);
        total += statSync(f).size;
      }
      expect(total, `${id}: слои ${total} байт`).toBeLessThanOrEqual(120 * 1024);
      for (const f of ["list", "still"]) expect(existsSync(join(PUBLIC, "words", id, `${f}.webp`)), `${id}/${f}`).toBe(true);
    }
  });
});

describe("checkArt ловит ошибки описания", () => {
  const g: ArtGen = { banter: { v: "1", bg: "#000", layers: [{ name: "bg", box: [0, 0, 1024, 1024] }, { name: "red", box: [10, 10, 100, 100] }] } };
  const spec = (motion: ArtSceneSpec["motion"], dur = 3000): Record<string, ArtSceneSpec> => ({ banter: { src: "x", dur, motion } });

  it("движение для несуществующего слоя, кадры не с 0 до 1, рывок в конце цикла", () => {
    const errs = checkArt(spec({ blue: { keys: [{ at: 0 }, { at: 1 }] }, red: { keys: [{ at: 0.1 }, { at: 0.9, r: 2 }] } }), g, ["banter"]);
    expect(errs.join("\n")).toMatch(/слоя «blue»/);
    expect(errs.join("\n")).toMatch(/red: кадры должны идти от 0 до 1/);
    expect(errs.join("\n")).toMatch(/red: конец цикла не совпадает/);
  });

  it("цикл вне 2–4 с, слово без слоёв, слои без описания, нет такого слова, фон не первым", () => {
    expect(checkArt(spec({}, 1000), g, ["banter"])).toEqual(["banter: цикл 1000 мс — нужно 2–4 с"]);
    expect(checkArt(spec({}), {}, ["banter"])[0]).toMatch(/слои не собраны/);
    expect(checkArt({}, g, ["banter"])[0]).toMatch(/описания сцены нет/);
    expect(checkArt(spec({}), g, [])[0]).toMatch(/нет такого слова/);
    const back = { banter: { ...g.banter, layers: [...g.banter.layers].reverse() } };
    expect(checkArt(spec({}), back, ["banter"])).toContain("banter: первым слоем должен идти фон");
  });

  it("рамка слоя или кроп для списка за краем холста", () => {
    const out = { banter: { ...g.banter, layers: [g.banter.layers[0], { name: "red", box: [1000, 0, 100, 10] as [number, number, number, number] }] } };
    expect(checkArt(spec({}), out, ["banter"])).toEqual(["banter/red: рамка вне холста"]);
    expect(checkArt({ banter: { src: "x", dur: 3000, motion: {}, list: [600, 0, 500] } }, g, ["banter"])).toEqual(["banter: кроп для списка вне холста"]);
  });
});

describe("checkArt: ведомые слои и полный оборот", () => {
  const g: ArtGen = { banter: { v: "1", bg: "#000", layers: [{ name: "bg", box: [0, 0, 1024, 1024] }, { name: "red", box: [10, 10, 100, 100] }, { name: "nudge", box: [10, 10, 50, 50] }] } };
  const spec = (motion: ArtSceneSpec["motion"]): Record<string, ArtSceneSpec> => ({ banter: { src: "x", dur: 3000, motion } });
  const still = { keys: [{ at: 0 }, { at: 1 }] };

  it("follow — только за слоем со своим движением, без цепочек", () => {
    expect(checkArt(spec({ red: still, nudge: { ...still, follow: "red" } }), g, ["banter"])).toEqual([]);
    expect(checkArt(spec({ nudge: { ...still, follow: "red" } }), g, ["banter"])[0]).toMatch(/nudge: follow «red»/);
    expect(checkArt(spec({ red: { ...still, follow: "nudge" }, nudge: { ...still, follow: "red" } }), g, ["banter"])).toHaveLength(2);
  });

  it("стрелка часов: 0 → 360° — тот же кадр, 0 → 180° — рывок", () => {
    expect(checkArt(spec({ red: { keys: [{ at: 0, r: 0 }, { at: 1, r: 360 }] } }), g, ["banter"])).toEqual([]);
    expect(checkArt(spec({ red: { keys: [{ at: 0, r: 0 }, { at: 1, r: 180 }] } }), g, ["banter"])[0]).toMatch(/рывок/);
  });

  it("снятый слой (drop) не должен остаться в сборке", () => {
    const s = (drop: string[]) => ({ banter: { src: "x", dur: 3000, drop, motion: { red: still } } });
    expect(checkArt(s(["hand"]), g, ["banter"])).toEqual([]);
    expect(checkArt(s(["nudge"]), g, ["banter"])[0]).toMatch(/«nudge» снят/);
  });

  it("поправка формы (reshape) — только для слоёв сцены или всей сцены «*»", () => {
    const s = (reshape: ArtSceneSpec["reshape"]) => ({ banter: { src: "x", dur: 3000, reshape, motion: { red: still } } });
    expect(checkArt(s({ "*": { sy: 1.1 }, nudge: { s: 0.8 } }), g, ["banter"])).toEqual([]);
    expect(checkArt(s({ cloud: { s: 0.8 } }), g, ["banter"])[0]).toMatch(/«cloud», а такого слоя нет/);
  });

  it("порог прозрачности (alphaFloor) — для своего слоя и в пределах 1…254", () => {
    const s = (alphaFloor: ArtSceneSpec["alphaFloor"]) => ({ banter: { src: "x", dur: 3000, alphaFloor, motion: { red: still } } });
    expect(checkArt(s({ nudge: 60 }), g, ["banter"])).toEqual([]);
    expect(checkArt(s({ cloud: 60 }), g, ["banter"])).toHaveLength(1);
    expect(checkArt(s({ nudge: 0 }), g, ["banter"])).toHaveLength(1);
  });
});

describe("кадр по содержимому", () => {
  it("без полос — 4:3 вокруг focus, не выходя за холст", () => {
    expect(artFrame(undefined)).toEqual({ ar: 4 / 3, fy: 0.5, y0: 128, h: 768 });
    expect(artFrame(undefined, 0.1)).toMatchObject({ y0: 0, fy: 0.375 });
    expect(artFrame(undefined, 0.95)).toMatchObject({ y0: 256, fy: 0.625 });
  });

  it("полоса содержимого: кадр внутри неё, а если она ниже 4:3 — кадр шире", () => {
    expect(artFrame([200, 1024])).toMatchObject({ ar: 4 / 3, y0: 200, h: 768 });
    expect(artFrame([0, 900], 0.6)).toMatchObject({ y0: 132, h: 768 });
    const narrow = artFrame([128, 888]);
    expect(narrow).toMatchObject({ y0: 128, h: 760 });
    expect(narrow.ar).toBeCloseTo(1024 / 760);
  });

  it("кроп для списка вдвигается в полосу и уменьшается, если она ниже стороны", () => {
    expect(listCrop([100, 50, 600])).toEqual([100, 50, 600]);
    expect(listCrop([100, 50, 600], [150, 1024])).toEqual([100, 150, 600]);
    expect(listCrop([0, 100, 900], [150, 850])).toEqual([100, 150, 700]);
  });
});

describe("toKeyframes", () => {
  it("сдвиг — в % от рамки слоя, ось — в % внутри рамки, пустой кадр — исходное положение", () => {
    const { origin, frames } = toKeyframes(
      { origin: [150, 250], keys: [{ at: 0 }, { at: 0.5, x: 20, y: -40, r: -2, s: 1.1, o: 0.5, ease: "ease-out" }, { at: 1 }] },
      [100, 200, 200, 400],
    );
    expect(origin).toBe("25% 12.5%");
    expect(frames[0]).toEqual({ offset: 0, transform: "translate(0%, 0%) rotate(0deg) scale(1, 1)", opacity: 1, easing: "ease-in-out" });
    expect(frames[1]).toEqual({ offset: 0.5, transform: "translate(10%, -10%) rotate(-2deg) scale(1.1, 1.1)", opacity: 0.5, easing: "ease-out" });
  });

  it("масштаб по осям: sx/sy поверх общего s", () => {
    const { frames } = toKeyframes({ keys: [{ at: 0, s: 1.2, sy: 0.9 }, { at: 1, sx: 1.05 }] }, [0, 0, 10, 10]);
    expect(frames.map((f) => f.transform)).toEqual(["translate(0%, 0%) rotate(0deg) scale(1.2, 0.9)", "translate(0%, 0%) rotate(0deg) scale(1.05, 1)"]);
  });

  it("без оси — центр слоя", () => {
    expect(toKeyframes({ keys: [{ at: 0 }, { at: 1 }] }, [0, 0, 10, 10]).origin).toBe("50% 50%");
  });

  it("рамка в % холста и адрес файла с версией", () => {
    expect(boxStyle([0, 512, ART_CANVAS / 4, 1024 / 3])).toEqual({ left: "0%", top: "50%", width: "25%", height: "33.333%" });
    expect(artUrl("banter", "red", "abc")).toBe("/words/banter/red.webp?v=abc");
  });
});
