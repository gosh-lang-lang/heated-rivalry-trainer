/**
 * Сцены к словам: слои из art-inbox → public/words/<id>/*.webp и src/core/word-art.gen.json.
 *
 *   node scripts/word-art.ts           — все сцены из SCENES (src/core/word-art.ts)
 *   node scripts/word-art.ts banter    — только эти
 *
 * Источник — art-inbox/<src>/layers.json от ChatGPT: PNG 1024×1024, все на одном холсте, порядок —
 * от заднего к переднему. Каждый слой уменьшаем до ART_EXPORT, обрезаем по непрозрачному и пишем webp;
 * рамку пересчитываем в пиксели исходного холста. Плюс list.webp (кроп для списка) и still.webp (сцена целиком).
 * art-inbox в git не попадает; результат — в git. Запускать из папки app.
 */
import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ART_CANVAS, ART_EXPORT, ART_LIST, ART_STILL, SCENES, type ArtGen, type ArtLayerGen } from "../src/core/word-art.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(APP, "..", "art-inbox");
const OUT = join(APP, "public", "words");
const GEN = join(APP, "src", "core", "word-art.gen.json");

interface SourceScene {
  layers: { file: string; role: string }[];
  full: string;
  crop: string;
}

const webp = (img: sharp.Sharp, quality = 75) => img.webp({ quality, alphaQuality: 90, effort: 6, smartSubsample: true }).toBuffer();
const K = ART_CANVAS / ART_EXPORT;

/** Рамка непрозрачного (альфа > 8) в raw RGBA. */
function alphaBox(data: Buffer, w: number, h: number) {
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

async function build(id: string): Promise<ArtGen[string]> {
  const spec = SCENES[id];
  const srcDir = join(INBOX, spec.src);
  const src = (JSON.parse(readFileSync(join(srcDir, "layers.json"), "utf8")) as { scenes: Record<string, SourceScene> }).scenes[id];
  if (!src) throw new Error(`${id}: нет сцены в ${spec.src}/layers.json`);
  const dir = join(OUT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const hash = createHash("sha1");
  const put = (name: string, buf: Buffer) => (writeFileSync(join(dir, `${name}.webp`), buf), hash.update(name).update(buf), buf.length);
  const layers: ArtLayerGen[] = [];
  let total = 0,
    bg = "#7fb0e6";

  for (const l of src.layers) {
    const name = basename(l.file, ".png").replace(`word-${id}-`, "");
    const small = sharp(join(srcDir, l.file)).resize(ART_EXPORT, ART_EXPORT, { kernel: "lanczos3" }).ensureAlpha();
    const { data, info } = await small.raw().toBuffer({ resolveWithObject: true });
    const raw = () => sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
    if (name === "bg") {
      const { channels } = await raw().stats();
      bg = "#" + channels.slice(0, 3).map((c) => Math.round(c.mean).toString(16).padStart(2, "0")).join("");
      total += put(name, await webp(raw().removeAlpha(), spec.quality));
      layers.push({ name, box: [0, 0, ART_CANVAS, ART_CANVAS] });
      continue;
    }
    const r = alphaBox(data, info.width, info.height);
    if (!r) throw new Error(`${id}/${name}: пустой слой`);
    total += put(name, await webp(raw().extract(r), spec.quality));
    layers.push({ name, box: [r.left * K, r.top * K, r.width * K, r.height * K] });
  }
  if (layers[0]?.name !== "bg") throw new Error(`${id}: первым слоем в layers.json должен быть фон`);

  const crop = spec.list ? sharp(join(srcDir, src.full)).extract({ left: spec.list[0], top: spec.list[1], width: spec.list[2], height: spec.list[2] }) : sharp(join(srcDir, src.crop));
  const list = await webp(crop.resize(ART_LIST, ART_LIST, { kernel: "lanczos3" }).flatten({ background: bg }), 80);
  const still = await webp(sharp(join(srcDir, src.full)).resize(ART_STILL, ART_STILL, { kernel: "lanczos3" }).flatten({ background: bg }), 75);
  put("list", list);
  put("still", still);
  console.log(`${id}: слоёв ${layers.length}, сцена ${(total / 1024).toFixed(0)} КБ, список ${(list.length / 1024).toFixed(1)} КБ, целиком ${(still.length / 1024).toFixed(0)} КБ`);
  return { v: hash.digest("hex").slice(0, 8), bg, layers };
}

const ids = process.argv.slice(2);
for (const id of ids) if (!SCENES[id]) throw new Error(`${id}: нет в SCENES (src/core/word-art.ts)`);
if (!existsSync(INBOX)) throw new Error(`нет папки ${INBOX}`);

const gen: ArtGen = existsSync(GEN) ? JSON.parse(readFileSync(GEN, "utf8")) : {};
for (const id of ids.length ? ids : Object.keys(SCENES)) gen[id] = await build(id);
for (const id of Object.keys(gen)) if (!SCENES[id]) delete gen[id];
const json = JSON.stringify(gen, (_k, v) => (typeof v === "number" ? +v.toFixed(2) : v), 1).replace(/\[\s*([-\d.,\s]+?)\s*\]/g, (_m, a: string) => `[${a.split(/,\s*/).join(", ")}]`);
writeFileSync(GEN, json + "\n");
