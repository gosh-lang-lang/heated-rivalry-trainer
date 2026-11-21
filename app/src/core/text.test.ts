import { describe, expect, it } from "vitest";
import { deck } from "./fixtures";
import { seeded } from "./rng";
import { buildTokens, checkTyped, formDistance, gapSentence, longestRun, norm, options, plural, speakScore } from "./text";

describe("longestRun", () => {
  it("самый длинный кусок без переноса: по пробелам и после дефиса", () => {
    expect(longestRun("comprehensible")).toBe(14);
    expect(longestRun("get under someone's skin")).toBe(9);
    expect(longestRun("enemies-to-lovers")).toBe(8);
    expect(longestRun("")).toBe(1);
  });
});

describe("сравнение ответов", () => {
  it("нормализация: регистр, апострофы, пунктуация", () => {
    expect(norm("  Get under MY skin! ")).toBe("get under my skin");
    expect(norm("one’s")).toBe("one's");
  });
  it("точный ответ", () => expect(checkTyped("Sacred", "sacred")).toEqual({ ok: true, typo: false }));
  it("одна опечатка прощается для слов длиннее 5 букв", () => {
    expect(checkTyped("sacrd", "sacred")).toEqual({ ok: true, typo: true });
    expect(checkTyped("devourd", "devoured")).toEqual({ ok: true, typo: true });
  });
  it("короткие слова — без поблажек", () => {
    expect(checkTyped("pck", "puck").ok).toBe(false);
    expect(checkTyped("mx", "mix").ok).toBe(false);
  });
  it("две опечатки — ошибка", () => expect(checkTyped("scrd", "sacred").ok).toBe(false));
  it("пустой ответ — ошибка", () => expect(checkTyped("", "sacred").ok).toBe(false));
});

describe("задания", () => {
  it("пропуск в предложении", () => {
    expect(gapSentence("I devoured the book in two days.", "devoured")).toEqual(["I ", " the book in two days."]);
  });
  it("токены сборки без финальной точки", () => {
    expect(buildTokens("He winked at me and smiled.")).toEqual(["He", "winked", "at", "me", "and", "smiled"]);
  });
  it("говорение: порог 80% слов", () => {
    expect(speakScore("He bent down to tie his skates.", "he bent down to tie his skates").ok).toBe(true);
    const r = speakScore("He bent down to tie his skates.", "he bent down");
    expect(r.ok).toBe(false);
    expect(r.miss).toEqual(["to", "tie", "his", "skates"]);
  });
  it("склонение", () => {
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => plural(n, "день", "дня", "дней"))).toEqual([
      "день", "дня", "дней", "дней", "день", "дня", "дней",
    ]);
  });
});

describe("formDistance", () => {
  it("похожие на письме ближе непохожих; разное число слов — дальше", () => {
    expect(formDistance("praise", "praise")).toBe(0);
    expect(formDistance("score", "scored")).toBeLessThan(formDistance("score", "banter"));
    expect(formDistance("mix", "wink")).toBeLessThan(formDistance("mix", "loads of"));
  });
});

describe("options — варианты ответа", () => {
  const W = deck.byId["praise"];
  const block = ["praise", "novel", "sacred", "autumn lawn", "rambunctious", "passionate"];
  const known = new Set(block);

  it("4 варианта, верный среди них, без повторов перевода и написания", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const o = options(W, deck.words, seeded(seed), known);
      expect(o).toHaveLength(4);
      expect(o).toContain(W.id);
      const ws = o.map((id) => deck.byId[id]);
      expect(new Set(ws.map((x) => x.ru)).size).toBe(4);
      expect(new Set(ws.map((x) => norm(x.en))).size).toBe(4);
    }
  });

  it("отвлекающие — из слов, которые человек уже учит: ответ не угадать по «единственному знакомому»", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const o = options(W, deck.words, seeded(seed), known);
      expect(o.every((id) => known.has(id))).toBe(true);
    }
  });

  it("из знакомых — похожие на ответ на письме", () => {
    const all = new Set(deck.words.map((x) => x.id));
    const target = deck.byId["score"];
    const far = [...deck.words].sort((a, b) => formDistance(b.en, target.en) - formDistance(a.en, target.en)).slice(0, 10);
    for (let seed = 1; seed <= 30; seed++) {
      const o = options(target, deck.words, seeded(seed), all);
      expect(o.some((id) => far.some((x) => x.id === id))).toBe(false);
    }
  });

  it("знакомых меньше трёх — добирает из остальной колоды, знакомые идут первыми", () => {
    const few = new Set(["praise", "novel"]);
    const o = options(W, deck.words, seeded(7), few);
    expect(o).toHaveLength(4);
    expect(o).toContain("novel");
  });

  it("вариантов меньше, если колода мала", () => {
    expect(options(W, [W, deck.byId["novel"]], seeded(1), known)).toHaveLength(2);
  });

  it("повторяемость: тот же rng — те же варианты; разные — набор меняется", () => {
    const all = new Set(deck.words.map((x) => x.id));
    expect(options(W, deck.words, seeded(3), all)).toEqual(options(W, deck.words, seeded(3), all));
    const sets = new Set(Array.from({ length: 20 }, (_, i) => [...options(W, deck.words, seeded(i), all)].sort().join()));
    expect(sets.size).toBeGreaterThan(3);
  });
});
