/**
 * Движение слоёв сцен-иллюстраций: кадры, покачивание по синусу, появление, дрожь, оборот. Общие для всех этапов
 * (word-art-05.ts и следующие) — чтобы помощники не копировались в каждый файл сцен.
 * Координаты — пиксели холста 1024×1024; время — доля цикла 0…1.
 */
import type { ArtKey, ArtMotion } from "./word-art.ts";

export type P = Omit<ArtKey, "at" | "ease">;
export type O = [number, number];

export const OUT = "cubic-bezier(.61,1,.88,1)"; // к пику — как синус
export const IN = "cubic-bezier(.12,0,.39,0)"; // от пика
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Кадр: k(0.3, { y: -8 }, "ease-out"). */
export const k = (at: number, p: P = {}, ease?: string): ArtKey => ({ at, ...p, ...(ease ? { ease } : {}) });

/**
 * Плавное покачивание по синусу: n раз за цикл, amp — размах каждого поля (x, y, r, s…; для s/sx/sy — отклонение от 1),
 * phase — сдвиг в долях периода (чтобы соседи качались вразнобой).
 */
export function wave(amp: P, o: { n?: number; phase?: number; origin?: O } = {}): ArtMotion {
  const n = o.n ?? 1,
    ph = o.phase ?? 0;
  const val = (t: number): P => {
    const v = Math.sin(2 * Math.PI * (n * t + ph));
    const p: P = {};
    for (const [f, a] of Object.entries(amp) as [keyof P, number][]) p[f] = r2(f === "s" || f === "sx" || f === "sy" ? 1 + a * v : f === "o" ? 1 - a * (v + 1) / 2 : a * v);
    return p;
  };
  // опорные точки — нули и пики синуса; между ними — сглаживание «как синус»
  const ts = new Set([0, 1]);
  for (let q = -4; q <= 4 * n + 4; q++) {
    const t = (q / 4 - ph) / n;
    if (t > 0.001 && t < 0.999) ts.add(r2(t * 1000) / 1000);
  }
  const at = [...ts].sort((a, b) => a - b);
  const keys = at.map((t, i) => {
    const next = at[i + 1];
    if (next === undefined) return k(1, val(0));
    const a = Math.abs(Math.sin(2 * Math.PI * (n * t + ph))),
      b = Math.abs(Math.sin(2 * Math.PI * (n * next + ph)));
    return k(t, val(t), b > a ? OUT : IN);
  });
  return { origin: o.origin, keys };
}

/** Слой едет вместе с ведущим (накладка, рука, пламя на свитере), плюс своё движение. */
export const follow = (lead: string, own?: ArtMotion): ArtMotion => ({ follow: lead, origin: own?.origin, keys: own?.keys ?? [k(0), k(1)] });

/** Появляется в [a, b] (вспышкой с масштабом from → 1), в остальное время скрыт. */
export const shown = (a: number, b: number, fade = 0.06, origin?: O, from = 1): ArtMotion => ({
  origin,
  keys: [k(0, { o: 0, s: from }), k(a, { o: 0, s: from }, "ease-out"), k(a + fade, { o: 1 }), k(b - fade, { o: 1 }), k(b, { o: 0, s: from }), ...(b < 1 ? [k(1, { o: 0, s: from })] : [])],
});
/** Виден, кроме [a, b] — второе состояние того же места (до/после). */
export const hiddenIn = (a: number, b: number, fade = 0.06): ArtMotion => ({
  keys: [k(0), k(a), k(a + fade, { o: 0 }), k(b - fade, { o: 0 }), k(b), ...(b < 1 ? [k(1)] : [])],
});

/** Дрожь в [a, b]: count колебаний с размахом amp (звонок будильника, злость), в остальное время покой. */
export function shake(a: number, b: number, amp: P, count = 8, origin?: O): ArtMotion {
  const keys: ArtKey[] = [k(0)];
  if (a > 0) keys.push(k(a));
  for (let i = 1; i <= count; i++) {
    const sign = i % 2 ? 1 : -1;
    const p: P = {};
    for (const [f, v] of Object.entries(amp) as [keyof P, number][]) p[f] = r2(v * sign);
    keys.push(k(Math.round((a + ((b - a) * i) / (count + 1)) * 1000) / 1000, p, "linear"));
  }
  keys.push(k(b));
  if (b < 1) keys.push(k(1));
  return { origin, keys };
}

/** Полный оборот за цикл шагами (стрелка часов): steps рывков, между ними стоит. */
export function spin(origin: O, steps = 12): ArtMotion {
  const keys: ArtKey[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    keys.push(k(Math.round(t * 1000) / 1000, { r: r2((360 * i) / steps) }, "ease-out"), k(Math.round((t + 0.6 / steps) * 1000) / 1000, { r: r2((360 * (i + 1)) / steps) }));
  }
  keys.push(k(1, { r: 360 }));
  return { origin, keys };
}
