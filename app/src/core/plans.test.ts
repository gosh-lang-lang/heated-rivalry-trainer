import { emptyState } from "./state";
import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { validateDeck } from "./deck";
import { drillPlan, eveningPlan, eveningWords, MAX_REVIEW, morningPlan, newToday, QUEUE_STOP, reviewAccuracy } from "./plans";
import { seeded } from "./rng";
import { blankState } from "./srs";
import { deck, state, TODAY } from "./fixtures";
import { canBuild } from "./text";
import type { Step } from "./types";

const types = (st: Step[]) => st.map((s) => s.t);
const count = (st: Step[], t: Step["t"]) => st.filter((s) => s.t === t).length;

describe("words.json", () => {
  it("целостный", () => expect(validateDeck(deck)).toEqual([]));
  it("22 редких слова из 112", () => expect(deck.words.filter((w) => w.rare).length).toBe(22));
  it("112 слов, 5 партий, 34 фразы", () => {
    expect([deck.words.length, deck.batches.length, deck.sentences.length]).toEqual([112, 5, 34]);
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
    // фразы при знакомстве — на слух; по переводу — позже, на повторении
    expect(count(st, "build-listen")).toBe(6);
    expect(count(st, "build")).toBe(0);
    // номера шагов по порядку
    expect(st.map((s) => s.k)).toEqual(st.map((_, i) => i));
  });

  it("порядок лестницы внутри блока", () => {
    const st = morningPlan(deck, state({ settings: { ...emptyState().settings, newPerDay: 6 } }), TODAY, { rng: seeded(2) });
    const order = types(st).filter((t, i, a) => t !== a[i - 1]);
    expect(order).toEqual(["section", "intro", "pick", "pairs", "listen", "type", "build-listen"]);
    expect(st.filter((s) => s.t === "type").every((s) => s.t === "type" && s.hint)).toBe(true);
  });

  it("новые слова идут в порядке словаря", () => {
    const st = morningPlan(deck, state({ settings: { ...emptyState().settings, newPerDay: 6 } }), TODAY, { rng: seeded(3) });
    expect(st.filter((s) => s.t === "intro").map((s) => (s.t === "intro" ? s.w : ""))).toEqual(deck.words.slice(0, 6).map((w) => w.id));
  });

  it("разминка: чем выше уровень, тем активнее; lvl<3 — выбор/аудирование, 3 — вписать с подсказкой, 4+ — без", () => {
    const srs: Record<string, ReturnType<typeof blankState>> = {};
    deck.words.slice(0, 25).forEach((w, i) => (srs[w.id] = { ...blankState(), lvl: i < 10 ? 1 : i < 18 ? 3 : 5, intro: "2026-11-01", due: TODAY }));
    const st = morningPlan(deck, state({ srs }), TODAY, { rng: seeded(4) });
    const rev = st.filter((s) => "rev" in s && s.rev);
    expect(rev.length).toBe(25);
    for (const s of rev) {
      const l = srs[(s as { w: string }).w].lvl;
      if (l >= 3) expect(s).toMatchObject({ t: "type", hint: l < 4 });
      else expect(["pick", "listen"]).toContain(s.t);
    }
  });

  it("сборка из банка: только фразы, где все слова уже известны", () => {
    const known = new Set(deck.words.slice(0, 12).map((w) => w.id));
    const st = morningPlan(deck, state(), TODAY, { rng: seeded(5) });
    const bank = st.filter((s): s is Extract<Step, { t: "build-listen" }> => s.t === "build-listen" && !s.w);
    expect(bank.length).toBeGreaterThan(0);
    for (const b of bank) {
      const sent = deck.sentences.find((x) => x.en === b.en)!;
      expect(sent.words.every((id) => known.has(id))).toBe(true);
    }
  });

  it("«Собери на слух» — при первой встрече, «Собери фразу» по переводу — на повторении уровня 2; шагов столько же", () => {
    const srs: Record<string, ReturnType<typeof blankState>> = {};
    deck.words.slice(0, 30).forEach((w, i) => (srs[w.id] = { ...blankState(), lvl: i < 10 ? 1 : i < 25 ? 2 : 3, intro: "2026-11-01", due: TODAY }));
    const st = morningPlan(deck, state({ srs }), TODAY, { rng: seeded(11) });
    const rev = st.filter((s) => "rev" in s && s.rev);
    // по одному заданию на слово к повторению — как раньше
    expect(rev.length).toBe(30);
    const builds = rev.filter((s): s is Extract<Step, { t: "build" }> => s.t === "build");
    expect(builds.length).toBeGreaterThan(0);
    for (const b of builds) {
      const w = deck.byId[b.w!];
      expect(srs[w.id].lvl).toBe(2);
      expect(b).toMatchObject({ en: w.example, ru: w.exampleRu, rev: true });
      expect(canBuild(w)).toBe(true);
    }
    // уровень 1 — только узнать; уровень 2 — узнать или собрать по переводу
    for (const s of rev) if (srs[(s as { w: string }).w].lvl === 1) expect(["pick", "listen"]).toContain(s.t);
    // на слух — только новые слова блока, не повторения
    const ear = st.filter((s): s is Extract<Step, { t: "build-listen" }> => s.t === "build-listen");
    const blocks = st.filter((s) => s.t === "section" && s.title.startsWith("Новые слова")).length;
    expect(blocks).toBeGreaterThan(0);
    expect(ear.length).toBe(3 * blocks);
    const fresh = new Set(st.filter((s) => s.t === "intro").map((s) => (s as { w: string }).w));
    for (const b of ear) if (b.w) expect(fresh.has(b.w)).toBe(true);
  });

  it("на 1000 случаях доля сборки на повторении уровня 2 — около половины", () => {
    const w = deck.words.find(canBuild)!;
    const srs = { [w.id]: { ...blankState(), lvl: 2, intro: "2026-11-01", due: TODAY } };
    const rng = seeded(12);
    let b = 0;
    for (let i = 0; i < 1000; i++) {
      const st = morningPlan(deck, state({ srs, settings: { ...emptyState().settings, newPerDay: 6 } }), TODAY, { rng, extra: false });
      if (st.some((s) => s.t === "build" && s.rev)) b++;
    }
    expect(b / 1000).toBeGreaterThan(0.4);
    expect(b / 1000).toBeLessThan(0.6);
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

  it("состав: type без подсказок → speak ×2 → reread; своего предложения нет", () => {
    const st = eveningPlan(deck, state({ srs: introToday(12) }), TODAY, seeded(7));
    const order = types(st).filter((t, i, a) => t !== a[i - 1]);
    expect(order).toEqual(["section", "type", "section", "speak", "reread"]);
    expect(count(st, "type")).toBe(12);
    expect(count(st, "speak")).toBe(2);
    // говорение — по примерам слов урока
    expect(st.filter((s) => s.t === "speak").every((s) => s.t === "speak" && eveningWords(deck, introToday(12), TODAY).some((w) => w.id === s.w))).toBe(true);
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

  it("сегодня только редкие — говорение и «впиши» всё равно есть", () => {
    const rareIds = deck.words.filter((w) => w.rare).map((w) => w.id);
    const srs = Object.fromEntries(rareIds.slice(0, 3).map((id) => [id, { ...blankState(), lvl: 1, intro: TODAY, due: addDays(TODAY, 2) }]));
    const st = eveningPlan(deck, state({ srs }), TODAY, seeded(2));
    expect(count(st, "speak")).toBe(2);
    expect(count(st, "type")).toBe(3);
  });

  it("не поместилось утром — до 20 повторений в начале вечера", () => {
    const srs = { ...introToday(6) };
    deck.words.slice(10, 40).forEach((w) => (srs[w.id] = { ...blankState(), lvl: 2, intro: "2026-11-01", due: TODAY }));
    const st = eveningPlan(deck, state({ srs }), TODAY, seeded(5));
    expect(st[0]).toMatchObject({ t: "section", title: "Повторение" });
    expect(st.filter((s) => "rev" in s && s.rev).length).toBe(20);
  });

  it("одно слово: всё равно два speak", () => {
    const st = eveningPlan(deck, state({ srs: introToday(1) }), TODAY, seeded(8));
    expect(count(st, "speak")).toBe(2);
  });
});

describe("темп новых слов", () => {
  const dueN = (n: number) =>
    Object.fromEntries(deck.words.slice(0, n).map((w) => [w.id, { ...blankState(), lvl: 2, intro: "2026-11-01", due: TODAY }]));
  const day = (revScore: number, revTotal: number) => ({ morning: { score: 0, total: 0, mins: 1, newN: 0, at: "", revScore, revTotal } });

  it("по умолчанию — как в настройке", () => expect(newToday(deck, state(), TODAY)).toMatchObject({ n: 12, why: "" }));

  it("очередь больше 60 — новых нет", () => {
    expect(newToday(deck, state({ srs: dueN(QUEUE_STOP + 1) }), TODAY)).toMatchObject({ n: 0, why: "сначала разберём повторения" });
    expect(morningPlan(deck, state({ srs: dueN(QUEUE_STOP + 1) }), TODAY, { rng: seeded(1) }).filter((s) => s.t === "intro").length).toBe(0);
  });

  it("очередь 21–60 — один блок", () => expect(newToday(deck, state({ srs: dueN(30) }), TODAY).n).toBe(6));

  it("утром не больше 40 повторений", () => {
    const st = morningPlan(deck, state({ srs: dueN(55) }), TODAY, { rng: seeded(1) });
    expect(st.filter((s) => "rev" in s && s.rev).length).toBe(MAX_REVIEW);
  });

  it("точность на повторениях: ниже 80% — один блок, выше 95% — в пределах выбранного темпа", () => {
    const low = state({ days: { [TODAY]: day(15, 25) } });
    expect(reviewAccuracy(low, TODAY)).toMatchObject({ right: 15, total: 25 });
    expect(newToday(deck, low, TODAY).n).toBe(6);
    expect(newToday(deck, state({ days: { "2026-11-19": day(24, 25) } }), TODAY).n).toBe(12);
    expect(newToday(deck, state({ days: { "2026-11-19": day(22, 25) } }), TODAY).n).toBe(12);
    // мало данных или старше недели — не учитываем
    expect(newToday(deck, state({ days: { "2026-11-19": day(5, 10) } }), TODAY).n).toBe(12);
    expect(newToday(deck, state({ days: { "2026-11-10": day(5, 30) } }), TODAY).n).toBe(12);
  });
});

describe("«Пройти все слова» — drillPlan", () => {
  it("по заданию на слово, по уровню: 1–2 — узнать, 3 — вписать с подсказкой, 4+ — без; не начатое — как 1", () => {
    const [a, b, c, d] = deck.words;
    const s = state({
      srs: {
        [a.id]: { lvl: 1, due: TODAY, intro: TODAY, right: 0, wrong: 0 },
        [b.id]: { lvl: 3, due: TODAY, intro: TODAY, right: 0, wrong: 0 },
        [c.id]: { lvl: 5, due: TODAY, intro: TODAY, right: 0, wrong: 0 },
      },
    });
    const p = drillPlan(deck, s, [a.id, b.id, c.id, d.id, "нет-такого"], "Урок 1", () => 0.1);
    expect(p[0]).toMatchObject({ t: "section", title: "Урок 1" });
    const by = Object.fromEntries(p.slice(1).map((x) => ["w" in x ? x.w : "", x]));
    expect(p).toHaveLength(5);
    expect(by[a.id].t).toMatch(/pick|listen/);
    expect(by[b.id]).toMatchObject({ t: "type", hint: true });
    expect(by[c.id]).toMatchObject({ t: "type", hint: false });
    expect(by[d.id].t).toMatch(/pick|listen/);
    expect(p.map((x) => x.k)).toEqual([0, 1, 2, 3, 4]);
  });

  it("пустой список — пустой план", () => {
    expect(drillPlan(deck, state(), [], "Урок 1")).toEqual([]);
  });
});
