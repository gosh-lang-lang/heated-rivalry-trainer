import { describe, expect, it } from "vitest";
import {
  align,
  delCost,
  expectedFromIpa,
  extraFactor,
  ipaAtoms,
  issueHint,
  modelAtoms,
  PRON_PASS,
  pronTextError,
  scorePron,
  subCost,
  textWords,
} from "./pron";

/** «θ ɪ ŋ k» → атомы для теста. */
const a = (s: string) => s.split(" ");

describe("звуки из IPA", () => {
  it("ударения и пометки отбрасываются, дифтонги и аффрикаты — один звук", () => {
    expect(ipaAtoms("dɪvˈaʊɚd")).toEqual(["d", "ɪ", "v", "aʊ", "ɚ", "d"]);
    expect(ipaAtoms("tʃˈiːpɪst")).toEqual(["tʃ", "iː", "p", "ɪ", "s", "t"]);
    expect(ipaAtoms("ˌɑːɹtʃɹˈaɪvəlz")).toEqual(["ɑː", "ɹ", "tʃ", "ɹ", "aɪ", "v", "ə", "l", "z"]);
    expect(ipaAtoms("wˈʌzn̩t")).toEqual(["w", "ʌ", "z", "n", "t"]);
  });
  it("составные единицы модели делятся на звуки, сомнения остаются у одиночных", () => {
    expect(modelAtoms(["ɑːɹ", "əl", "θ"])).toEqual([{ a: "ɑː" }, { a: "ɹ" }, { a: "ə" }, { a: "l" }, { a: "θ" }]);
    expect(modelAtoms([{ u: "s", alt: ["θ", "ɑːɹ"] }])).toEqual([{ a: "s", alt: ["θ"] }]);
  });
  it("звуки по словам из фразы; не совпало число слов — null", () => {
    expect(expectedFromIpa(["I", "think"], ["aɪ θˈɪŋk"])).toEqual([["aɪ"], ["θ", "ɪ", "ŋ", "k"]]);
    expect(expectedFromIpa(["The", "face-off", "wasn't", "it"], ["ðə fˈeɪsˈɔf", "wˈʌzn̩t ɪt"])).toHaveLength(4);
    expect(expectedFromIpa(["a", "b", "c"], ["ab c"])).toBeNull();
  });
  it("слова фразы без пунктуации по краям, дефисы и апострофы остаются", () => {
    expect(textWords("“Shut up,” he said — it's a face-off!")).toEqual(["Shut", "up", "he", "said", "it's", "a", "face-off"]);
  });
});

describe("цена ошибок", () => {
  it("акцент и редукция — не ошибка", () => {
    expect(subCost("ə", "ɪ")).toBe(0);
    expect(subCost("t", "ɾ")).toBe(0); // better — тэп
    expect(subCost("oː", "ɔː")).toBe(0); // score: американское и британское
    expect(subCost("ʌ", "a")).toBe(0); // ʌ как русское «а»
    expect(subCost("k", "ɡ", "s")).toBe(0); // sky
    expect(delCost("ɹ", "ɔː")).toBe(0); // британское r после гласной
  });
  it("близкие звуки — полцены, другой звук — полная", () => {
    expect(subCost("iː", "ɪ")).toBe(0.5); // sheep — ship
    expect(subCost("d", "t")).toBe(0.5); // оглушение
    expect(subCost("k", "ɡ")).toBe(0.5); // не после s
    expect(subCost("θ", "s")).toBe(1);
    expect(subCost("w", "v")).toBe(1);
    expect(subCost("æ", "uː")).toBe(1);
    expect(subCost("ɪ", "t")).toBe(1.4); // гласная вместо согласной — дороже
    expect(delCost("ɹ", "t")).toBe(1);
    expect(delCost("ə")).toBe(0.5);
  });
});

describe("выравнивание", () => {
  it("лишние звуки на стыке слов и по краям не считаются", () => {
    const { words: ops, extra } = align([a("aɪ"), a("θ ɪ ŋ k")], a("ə aɪ m θ ɪ ŋ k ə"));
    expect(ops.flat().every((o) => o.cost === 0)).toBe(true);
    expect(extra).toBe(3);
  });
  it("замена и пропуск попадают в своё слово", () => {
    const ops = align([a("aɪ"), a("θ ɪ ŋ k")], a("aɪ s ɪ ŋ")).words;
    expect(ops[0]).toEqual([{ op: "ok", exp: "aɪ", got: "aɪ", cost: 0 }]);
    expect(ops[1].filter((o) => o.op !== "ok")).toEqual([
      { op: "sub", exp: "θ", got: "s", cost: 1 },
      { op: "del", exp: "k", cost: 1 },
    ]);
  });
  it("сомнение модели: верный звук среди вариантов — почти верно", () => {
    const ops = align([a("θ ɪ ŋ k")], [{ a: "s", alt: ["θ"] }, ...a("ɪ ŋ k")]).words;
    expect(ops[0][0]).toMatchObject({ op: "ok", exp: "θ", cost: 0.25 });
  });
});

describe("оценка", () => {
  const words = ["I", "think", "so"];
  const exp = [a("aɪ"), a("θ ɪ ŋ k"), a("s oʊ")];

  it("всё верно — 100, слова зелёные", () => {
    const r = scorePron(words, exp, a("aɪ θ ɪ ŋ k s oʊ"));
    expect(r).toMatchObject({ score: 100, ok: true, silent: false });
    expect(r.words.map((w) => w.mark)).toEqual(["good", "good", "good"]);
    expect(r.words[1].ipa).toBe("θɪŋk");
  });
  it("θ → s: слово жёлтое, ошибка с подсказкой, фраза ещё проходит", () => {
    const r = scorePron(words, exp, a("aɪ s ɪ ŋ k s oʊ"));
    expect(r.words[1]).toMatchObject({ w: "think", score: 80, mark: "so", issues: [{ exp: "θ", got: "s" }] });
    expect(r.score).toBeGreaterThanOrEqual(PRON_PASS);
    expect(issueHint(r.words[1].issues[0])).toBe("/θ/ прозвучал как /s/ — кончик языка между зубами, выдох — не «с» и не «ф»");
  });
  it("пропущенное слово — красное, фраза не проходит", () => {
    const r = scorePron(words, exp, a("aɪ s oʊ"));
    expect(r.words[1]).toMatchObject({ score: 0, mark: "weak" });
    expect(r.ok).toBe(false);
  });
  it("служебное слово весит меньше: ошибка в «I» почти не снижает оценку", () => {
    const fnErr = scorePron(words, exp, a("oʊ θ ɪ ŋ k s oʊ")).score;
    const contentErr = scorePron(words, exp, a("aɪ θ ɪ ŋ k z uː")).score;
    expect(fnErr).toBeGreaterThan(contentErr);
  });
  it("тишина — silent, оценка 0", () => {
    expect(scorePron(words, exp, [])).toMatchObject({ score: 0, ok: false, silent: true });
  });
  it("оглушение на конце — своя подсказка", () => {
    const r = scorePron(["bad"], [a("b æ d")], a("b æ t"));
    expect(r.words[0].issues).toEqual([{ exp: "d", got: "t", end: true }]);
    expect(issueHint(r.words[0].issues[0])).toContain("на конце оглушился");
    expect(issueHint({ exp: "ŋ", got: "" })).toBe("пропущен звук /ŋ/ — задняя часть языка к нёбу, через нос — без «г» в конце");
  });
  it("другая гласная в коротком слове — не проходит (mix — max)", () => {
    const r = scorePron(["mix"], [a("m ɪ k s")], a("m æ k s"));
    expect(r.words[0]).toMatchObject({ score: 60, mark: "so", issues: [{ exp: "ɪ", got: "æ" }] });
    expect(r.ok).toBe(false);
  });
  it("целая фраза вместо слова — оценка падает, а вдох и «э-э» по краям — нет", () => {
    const word = [a("b ɛ ɹ l i")];
    const said = a("ð ə f æ n z l ʌ v ð ɛ ɹ t iː m"); // The fans love their team.
    expect(scorePron(["barely"], word, said).score).toBeLessThan(40);
    expect(scorePron(["barely"], word, a("ə b ɛ ɹ l i ə m")).score).toBe(100);
    expect(extraFactor(10, 4)).toBe(1);
    expect(extraFactor(4, 9)).toBe(0.4); // сверх запаса 3 — ещё 6 звуков
  });
  it("британское произношение без r — не ошибка", () => {
    expect(scorePron(["score"], [a("s k oː ɹ")], a("s ɡ ɔː")).score).toBe(100);
  });
});

describe("запрос", () => {
  it("текст обязателен и не длиннее предела", () => {
    expect(pronTextError("Hello there")).toBeNull();
    expect(pronTextError("")).not.toBeNull();
    expect(pronTextError(" — ! ")).not.toBeNull();
    expect(pronTextError(5)).not.toBeNull();
    expect(pronTextError("word ".repeat(80))).not.toBeNull();
  });
});
