import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openAuthStore } from "./auth-store.ts";
import { openProgress } from "./progress.ts";
import { emptyState, changeSetting } from "../src/core/state.ts";
import { createQueue } from "./tts.ts";
import { createWarmer, deckTexts } from "./warm.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const engine = () => {
  const d = mkdtempSync(join(tmpdir(), "hr-warm-"));
  dirs.push(d);
  const made: string[] = [];
  return { q: createQueue(d, async (t, v) => (made.push(`${v}:${t}`), new Uint8Array([1]))), made };
};
const deck = { words: [{ en: "praise", example: "The new book got a lot of praise." }, { en: "devour", example: "I devoured it." }], sentences: [{ en: "I praise it." }] };

describe("прогрев озвучки", () => {
  it("колода: сначала слова, потом примеры и фразы, без повторов", () => {
    expect(deckTexts({ ...deck, sentences: [...deck.sentences, { en: "praise" }] })).toEqual([
      "praise",
      "devour",
      "The new book got a lot of praise.",
      "I devoured it.",
      "I praise it.",
    ]);
  });

  it("озвучивает колоду выбранным голосом; второй раз и чужие голоса — ничего", async () => {
    const { q, made } = engine();
    const warm = createWarmer(q, deckTexts(deck), () => {});
    await warm("bm_lewis");
    expect(made).toHaveLength(5);
    expect(made.every((m) => m.startsWith("bm_lewis:"))).toBe(true);
    expect(warm("bm_lewis")).toBeNull();
    expect(warm("robot")).toBeNull();
    expect(made).toHaveLength(5);
  });

  it("уже готовое не генерирует заново", async () => {
    const { q, made } = engine();
    await q.ensure("praise", "af_heart");
    await createWarmer(q, deckTexts(deck), () => {})("af_heart");
    expect(made.filter((m) => m === "af_heart:praise")).toHaveLength(1);
  });

  it("голоса пользователей — из их общих настроек", () => {
    const store = openAuthStore(":memory:");
    const progress = openProgress(store.db);
    const a = store.addUser("evgeny"),
      b = store.addUser("svetlana"),
      c = store.addUser("anna");
    progress.put(a.id, { ...changeSetting(emptyState(), "voice", "bm_lewis", 5), upd: 5 });
    progress.put(b.id, { ...emptyState(), upd: 3 });
    progress.put(c.id, { ...changeSetting(emptyState(), "voice", "bm_lewis", 7), upd: 7 });
    expect(progress.voices().sort()).toEqual(["af_heart", "bm_lewis"]);
  });
});
