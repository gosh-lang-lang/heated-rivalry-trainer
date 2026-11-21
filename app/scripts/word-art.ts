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
import { ART_CANVAS, ART_EXPORT, ART_LIST, ART_STILL, SCENES, artFrame, listCrop, type ArtGen, type ArtLayerGen } from "../src/core/word-art.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = join(APP, "..", "art-inbox");
const OUT = join(APP, "public", "words");
const GEN = join(APP, "src", "core", "word-art.gen.json");

interface SourceScene {
  layers: { file: string; role: string; opacity?: number }[];
  full: string;
  crop: string;
  /** где на холсте взят crop: [x, y, ширина, высота] (этап 5; у этапа 3 нет) */
  cropRect?: [number, number, number, number];
}

const webp = (img: ReturnType<typeof sharp>, quality = 75) => img.webp({ quality, alphaQuality: 90, effort: 6, smartSubsample: true }).toBuffer();
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

/**
 * Ряды с содержимым: от краёв срезаем ряды почти одного цвета (разброс каналов < 14) — заливку под кадр 4:3,
 * ровное небо или лёд. Полосы меньше 24 px не в счёт; нет полос — undefined.
 */
async function contentRows(file: string | Buffer): Promise<[number, number] | undefined> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const flat = (y: number) => {
    const mn = [255, 255, 255],
      mx = [0, 0, 0];
    for (let x = 0; x < w; x += 2)
      for (let c = 0; c < 3; c++) {
        const v = data[(y * w + x) * 3 + c];
        mn[c] = Math.min(mn[c], v);
        mx[c] = Math.max(mx[c], v);
      }
    return Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) < 14;
  };
  let top = 0,
    bot = info.height;
  while (top < bot && flat(top)) top++;
  while (bot > top && flat(bot - 1)) bot--;
  if (top < 24) top = 0;
  if (bot > info.height - 24) bot = info.height;
  return top > 0 || bot < info.height ? [top, bot] : undefined;
}

/**
 * Поправка формы слоя на холсте: масштаб s и растяжение по высоте sy вокруг точки at (по умолчанию — центр
 * непрозрачного). Что вышло за холст — обрезается.
 */
async function reshape(png: Buffer, fix: { s?: number; sy?: number; at?: [number, number] }): Promise<Buffer> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const b = alphaBox(data, info.width, info.height) ?? { left: 0, top: 0, width: info.width, height: info.height };
  const [cx, cy] = fix.at ?? [b.left + b.width / 2, b.top + b.height / 2];
  const sx = fix.s ?? 1,
    sy = sx * (fix.sy ?? 1);
  const w = Math.round(info.width * sx),
    h = Math.round(info.height * sy);
  const ox = Math.round(cx - cx * sx),
    oy = Math.round(cy - cy * sy);
  const big = await sharp(png).resize(w, h, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
  const l = Math.max(0, -ox),
    t = Math.max(0, -oy);
  const part = await sharp(big)
    .extract({ left: l, top: t, width: Math.min(w, info.width - ox) - l, height: Math.min(h, info.height - oy) - t })
    .png()
    .toBuffer();
  return sharp({ create: { width: info.width, height: info.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: part, left: ox + l, top: oy + t }])
    .png()
    .toBuffer();
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

  const drop = new Set(spec.drop ?? []);
  const fixes = new Set(Object.keys(spec.reshape ?? {}).filter((n) => n !== "*"));
  // без снятых, поправленных или очищенных слоёв full художника не годится — собираем из стека
  const restack = !!(spec.drop || spec.reshape || spec.alphaFloor);
  const stack: { input: Buffer }[] = [];
  for (const l of src.layers) {
    const name = basename(l.file, ".png").replace(`word-${id}-`, "");
    if (drop.has(name)) {
      drop.delete(name);
      continue;
    }
    let canvas: Buffer = await sharp(join(srcDir, l.file)).ensureAlpha().png().toBuffer();
    if (spec.reshape?.["*"]) canvas = await reshape(canvas, spec.reshape["*"]);
    if (spec.reshape?.[name]) (canvas = await reshape(canvas, spec.reshape[name])), fixes.delete(name);
    const floor = spec.alphaFloor?.[name];
    if (floor) {
      const { data, info } = await sharp(canvas).raw().toBuffer({ resolveWithObject: true });
      for (let i = 3; i < data.length; i += 4) if (data[i] < floor) data[i] = 0;
      canvas = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    }
    if (restack && (l.opacity ?? 1) > 0) {
      if ((l.opacity ?? 1) < 1) throw new Error(`${id}/${name}: полупрозрачный слой — full из стека так не собрать`);
      stack.push({ input: canvas });
    }
    const small = sharp(canvas).resize(ART_EXPORT, ART_EXPORT, { kernel: "lanczos3" }).ensureAlpha();
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
    layers.push({ name, box: [r.left * K, r.top * K, r.width * K, r.height * K], ...(l.opacity !== undefined && l.opacity < 1 ? { o: l.opacity } : {}) });
  }
  if (layers[0]?.name !== "bg") throw new Error(`${id}: первым слоем в layers.json должен быть фон`);

  if (drop.size) throw new Error(`${id}: в layers.json нет слоёв ${[...drop].join(", ")} (drop)`);
  if (fixes.size) throw new Error(`${id}: в layers.json нет слоёв ${[...fixes].join(", ")} (reshape)`);
  const full = restack ? await sharp(stack[0].input).composite(stack.slice(1)).png().toBuffer() : join(srcDir, src.full);

  // ровные полосы сверху и снизу (художник рисовал под 4:3 и залил остальное) — кадр и кропы не выходят за содержимое
  const fit = spec.frame === "content" ? await contentRows(full) : undefined;
  // кроп художника — по исходному холсту; если поправлена вся сцена, он едет и масштабируется вместе с ней
  // (по центру, сторона — по ширине; что вышло за холст — вдвигается обратно)
  const all = spec.reshape?.["*"];
  const [ax, ay] = all?.at ?? [ART_CANVAS / 2, ART_CANVAS / 2];
  const ks = all?.s ?? 1,
    ky = ks * (all?.sy ?? 1);
  const srcRect = src.cropRect && (() => {
    const [x, y, side] = src.cropRect!;
    const cx = ax + (x + side / 2 - ax) * ks,
      cy = ay + (y + side / 2 - ay) * ky;
    const s2 = Math.min(ART_CANVAS, Math.round(side * ks));
    const clamp = (v: number) => Math.max(0, Math.min(ART_CANVAS - s2, Math.round(v - s2 / 2)));
    return [clamp(cx), clamp(cy), s2] as [number, number, number];
  })();
  const rect = spec.list ?? srcRect;
  const [lx, ly, ls] = rect ? listCrop(rect, fit) : [0, 0, 0];
  const cropImg = rect ? sharp(full).extract({ left: lx, top: ly, width: ls, height: ls }) : sharp(join(srcDir, src.crop));
  const list = await webp(cropImg.resize(ART_LIST, ART_LIST, { kernel: "lanczos3" }).flatten({ background: bg }), 80);
  const f = artFrame(fit, spec.focus);
  const still = await webp(sharp(full).extract({ left: 0, top: Math.round(f.y0), width: ART_CANVAS, height: Math.round(f.h) }).resize(ART_STILL, Math.round((ART_STILL * f.h) / ART_CANVAS), { kernel: "lanczos3" }).flatten({ background: bg }), 75);
  put("list", list);
  put("still", still);
  console.log(`${id}: слоёв ${layers.length}, сцена ${(total / 1024).toFixed(0)} КБ, список ${(list.length / 1024).toFixed(1)} КБ, целиком ${(still.length / 1024).toFixed(0)} КБ${fit ? `, содержимое y ${fit[0]}…${fit[1]}` : ""}`);
  return { v: hash.digest("hex").slice(0, 8), bg, layers, ...(fit ? { fit } : {}) };
}

const ids = process.argv.slice(2);
for (const id of ids) if (!SCENES[id]) throw new Error(`${id}: нет в SCENES (src/core/word-art.ts)`);
if (!existsSync(INBOX)) throw new Error(`нет папки ${INBOX}`);

const gen: ArtGen = existsSync(GEN) ? JSON.parse(readFileSync(GEN, "utf8")) : {};
for (const id of ids.length ? ids : Object.keys(SCENES)) gen[id] = await build(id);
for (const id of Object.keys(gen)) if (!SCENES[id]) delete gen[id];
const json = JSON.stringify(gen, (_k, v) => (typeof v === "number" ? +v.toFixed(2) : v), 1).replace(/\[\s*([-\d.,\s]+?)\s*\]/g, (_m, a: string) => `[${a.split(/,\s*/).join(", ")}]`);
writeFileSync(GEN, json + "\n");
