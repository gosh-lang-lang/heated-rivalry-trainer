import type { ArtSceneSpec } from "./word-art.ts";
import { ANIMATED_04_B1 } from "./word-art-04-animated-b1.ts";
import { ANIMATED_04_B2 } from "./word-art-04-animated-b2.ts";
import { ANIMATED_04_B3 } from "./word-art-04-animated-b3.ts";
import { ANIMATED_04_B4 } from "./word-art-04-animated-b4.ts";

const REVIEWED = new Set(["defenseman", "hurl", "consequences", "stick", "bludgeon", "own", "sweat-soaked", "beloved", "smug", "disappointed", "undershirt", "almost", "satisfying", "devastated", "argue", "whatever", "glitch", "flatly", "quietly", "always", "form", "also", "specifically", "semicircle", "tiredly"]);
const EXPORT_QUALITY: Record<string, number> = { consequences: 62, disappointed: 68, devastated: 60, argue: 42 };

/** Только принятые сцены с восстановленным фоном и настоящими прозрачными слоями. */
export const ANIMATED_04: Record<string, ArtSceneSpec> = {
  ...Object.fromEntries(Object.entries({ ...ANIMATED_04_B1, ...ANIMATED_04_B2, ...ANIMATED_04_B3, ...ANIMATED_04_B4 }).filter(([id]) => REVIEWED.has(id)).map(([id, spec]) => [id, { ...spec, dur: Math.min(spec.dur, 4000), ...(EXPORT_QUALITY[id] ? { quality: EXPORT_QUALITY[id] } : {}) }])),
  assume: {
    src: "partia-04-animated/assume", dur: 4000, quality: 70,
    motion: {
      crumbs: { keys: [{ at: 0, o: 0.65 }, { at: 0.2, o: 1 }, { at: 0.8, o: 1 }, { at: 1, o: 0.65 }] },
      thought: { origin: [470, 300], keys: [{ at: 0, o: 0, s: 0.98 }, { at: 0.2, o: 0, s: 0.98 }, { at: 0.45, o: 1, s: 1 }, { at: 0.8, o: 1, s: 1 }, { at: 1, o: 0, s: 0.98 }] },
    },
  },
  giant: {
    src: "partia-04-animated/giant", dur: 4000, quality: 68,
    motion: {
      boat: { origin: [500, 750], keys: [{ at: 0, r: -1, y: 3 }, { at: 0.5, r: 1.5, y: -18 }, { at: 1, r: -1, y: 3 }] },
      foam: { origin: [650, 940], keys: [{ at: 0, x: -3, y: 4 }, { at: 0.5, x: 6, y: -11 }, { at: 1, x: -3, y: 4 }] },
    },
  },
};
