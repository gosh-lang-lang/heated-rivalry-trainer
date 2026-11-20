import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { validateDeck } from "./deck";
import { eveningPlan, eveningWords, morningPlan } from "./plans";
import { seeded } from "./rng";
import { blankState } from "./srs";
import { deck, state, TODAY } from "./fixtures";
import type { Step } from "./types";

const types = (st: Step[]) => st.map((s) => s.t);
const count = (st: Step[], t: Step["t"]) => st.filter((s) => s.t === t).length;

describe("words.json", () => {
  it("целостный", () => expect(validateDeck(deck)).toEqual([]));
  it("62 слова, 3 партии, 24 фразы", () => {
    expect([deck.words.length, deck.batches.length, deck.sentences.length]).toEqual([62, 3, 24]);
  });
});

describe("утро", () => {
  it("первый день: 12 новых двумя блоками по 6, без разминки", () => {
    const st = morningPlan(deck, state(), TODAY, { rng: seeded(1) });
    expect(st[0]).toMatchObject({ t: "section", title: "Новые слова · блок 1" });
    expect(count(st, "section")).toBe(2);
    expect(count(st, "intro")).toBe(12);
    expect(count(st, "pick")).toBe(12);
    expect(count(st, "pairs")).toBe(2);
    expect(count(st, "listen")).toBe(6);
    expect(count(st, "type")).toBe(12);
    expect(count(st, "build")).toBe(6);
    // номера шагов по порядку
    expect(st.map((s) => s.k)).toEqual(st.map((_, i) => i));
  });

  it("порядок лестницы внутри блока", () => {
    const st = morningPlan(deck, state({ settings: { newPerDay: 6 } }), TODAY, { rng: seeded(2) });
    const order = types(st).filter((t, i, a) => t !== a[i - 1]);
    expect(order).toEqual(["section", "intro", "pick", "pairs", "listen", "type", "build"]);
    expect(st.filter((s) => s.t === "type").every((s) => s.t === "type" && s.hint)).toBe(true);
  });

  it("новые слова идут в порядке словаря", () => {
    const st = morningPlan(deck, state({ settings: { newPerDay: 6 } }), TODAY, { rng: seeded(3) });
    expect(st.filter((s) => s.t === "intro").map((s) => (s.t === "intro" ? s.w : ""))).toEqual(deck.words.slice(0, 6).map((w) => w.id));
  });

  it("разминка: до 20 слов; lvl<3 — выбор/аудирование, lvl≥3 — вписать", () => {
    const srs: Record<string, ReturnType<typeof blankState>> = {};
    deck.words.slice(0, 25).forEach((w, i) => (srs[w.id] = { ...blankState(), lvl: i < 10 ? 1 : 3, intro: "2026-11-01", due: TODAY }));
    const st = morningPlan(deck, state({ srs }), TODAY, { rng: seeded(4) });
    const rev = st.filter((s) => "rev" in s && s.rev);
    expect(rev.length).toBe(20);
    for (const s of rev) {
      const l = srs[(s as { w: string }).w].lvl;
      if (l >= 3) expect(s.t).toBe("type");
      else expect(["pick", "listen"]).toContain(s.t);
    }
  });

  it("сборка из банка: только фразы, где все слова уже известны", () => {
    const known = new Set(deck.words.slice(0, 12).map((w) => w.id));
    const st = morningPlan(deck, state(), TODAY, { rng: seeded(5) });
    const bank = st.filter((s): s is Extract<Step, { t: "build" }> => s.t === "build" && !s.w);
    for (const b of bank) {
      const sent = deck.sentences.find((x) => x.en === b.en)!;
      expect(sent.words.every((id) => known.has(id))).toBe(true);
    }
  });

  it("«ещё 6 новых» — только блок новых, без разминки", () => {
    const srs = { praise: { ...blankState(), lvl: 1, intro: "2026-11-01", due: TODAY } };
    const st = morningPlan(deck, state({ srs }), TODAY, { extra: true, rng: seeded(6) });
    expect(count(st, "intro")).toBe(6);
    expect(st.some((s) => "rev" in s && s.rev)).toBe(false);
  });

  it("нечего учить — пустой план", () => {
    const srs = Object.fromEntries(deck.words.map((w) => [w.id, { ...blankState(), lvl: 2, intro: "2026-11-01", due: addDays(TODAY, 3) }]));
    expect(morningPlan(deck, state({ srs }), TODAY)).toEqual([]);
  });
});

describe("вечер", () => {
  const introToday = (n: number) =>
    Object.fromEntries(deck.words.slice(0, n).map((w) => [w.id, { ...blankState(), lvl: 1, intro: TODAY, due: addDays(TODAY, 1) }]));

  it("без утренних слов — пусто", () => expect(eveningPlan(deck, state(), TODAY)).toEqual([]));

  it("состав: type без подсказок → write ×3 → speak ×2 → reread", () => {
    const st = eveningPlan(deck, state({ srs: introToday(12) }), TODAY, seeded(7));
    const order = types(st).filter((t, i, a) => t !== a[i - 1]);
    expect(order).toEqual(["section", "type", "section", "write", "section", "speak", "reread"]);
    expect(count(st, "type")).toBe(12);
    expect(count(st, "write")).toBe(3);
    expect(count(st, "speak")).toBe(2);
    expect(st.filter((s) => s.t === "type").every((s) => s.t === "type" && !s.hint && s.eve)).toBe(true);
    const last = st[st.length - 1];
    expect(last.t === "reread" && last.pages).toEqual(["отзывы критиков (стр. 1)"]);
  });

  it("если сегодня ничего не учил — 12 последних по дате знакомства", () => {
    const srs = Object.fromEntries(
      deck.words.slice(0, 20).map((w, i) => [w.id, { ...blankState(), lvl: 1, intro: addDays(TODAY, -20 + i), due: TODAY }]),
    );
    const ws = eveningWords(deck, srs, TODAY);
    expect(ws.length).toBe(12);
    expect(ws[0].id).toBe(deck.words[19].id);
  });

  it("одно слово: всё равно один write и два speak", () => {
    const st = eveningPlan(deck, state({ srs: introToday(1) }), TODAY, seeded(8));
    expect(count(st, "write")).toBe(1);
    expect(count(st, "speak")).toBe(2);
  });
});
