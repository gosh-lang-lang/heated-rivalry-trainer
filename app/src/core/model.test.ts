/**
 * Модель на 1000 слов: настоящие правила приложения (morningPlan, eveningPlan, introduce, applyGrade),
 * 2 занятия в день, 85% верно на повторениях, 27% редких слов.
 * Проверяет, что очередь повторений не копится, а повторения не опаздывают.
 */
import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { makeDeck } from "./deck";
import { eveningPlan, morningPlan, QUEUE_STOP } from "./plans";
import { seeded } from "./rng";
import { applyGrade, dueList, introduce, unseen } from "./srs";
import { emptyState } from "./state";
import type { AppState, SessionResult, Step, Word } from "./types";

const N = 1000;
const START = "2026-12-01";

const makeWords = (rng: () => number): Word[] =>
  Array.from({ length: N }, (_, i) => ({
    id: `w${i}`, batch: 1, picture: "", en: `w${i}`, ipa: "", ru: `с${i}`, note: "",
    example: `I w${i}.`, exampleRu: "", blank: `w${i}`, correctionOfMyTranslation: false, rare: rng() < 0.27,
  }));

/** Один «ученик»: seed задаёт и слова (какие редкие), и ответы, и выбор заданий. */
export const run = (days: number, acc: number, seed = 42) => {
  const rng = seeded(seed);
  // свой «случай» у планов (какие задания) и у ученика (верно/неверно): иначе любое изменение плана меняет и ответы
  const planRng = seeded(seed * 101 + 4141);
  const deck = makeDeck({ version: 1, batches: [{ id: 1, title: "", pages: "" }], words: makeWords(rng), sentences: [] });
  let st: AppState = emptyState();
  const log: { due: number; late: number }[] = [];
  let introducedAll = -1;

  const play = (steps: Step[], today: string): SessionResult => {
    let revScore = 0,
      revTotal = 0;
    for (const s of steps) {
      if (s.t === "intro") {
        st.srs[s.w] = introduce(st.srs[s.w], today, deck.byId[s.w].rare);
      } else if ((s.t === "pick" || s.t === "listen" || s.t === "type" || (s.t === "build" && s.w)) && (s.rev || ("eve" in s && s.eve))) {
        if (!s.w) continue;
        const ok = rng() < acc;
        st.srs[s.w] = applyGrade(st.srs[s.w], ok, { rev: s.rev, eve: "eve" in s && s.eve, rare: deck.byId[s.w].rare }, today);
        if (s.rev) [revScore, revTotal] = [revScore + +ok, revTotal + 1];
      }
    }
    return { score: 0, total: 0, mins: 15, newN: 0, at: "", revScore, revTotal };
  };

  for (let d = 0; d < days; d++) {
    const today = addDays(START, d);
    const due = dueList(deck.words, st.srs, today);
    log.push({ due: due.length, late: due.length ? due.reduce((n, w) => n + (Date.parse(today) - Date.parse(st.srs[w.id].due)) / 864e5, 0) / due.length : 0 });
    st = { ...st, srs: { ...st.srs } };
    const morning = play(morningPlan(deck, st, today, { rng: planRng }), today);
    const evening = play(eveningPlan(deck, st, today, planRng), today);
    st.days = { ...st.days, [today]: { morning, evening } };
    if (introducedAll < 0 && !unseen(deck.words, st.srs).length) introducedAll = d;
  }
  return { log, introducedAll };
};

/**
 * Один «ученик» — один случай: пик очереди от случая к случаю гуляет на ±5–6, и граница по одному прогону ловит
 * разброс, а не поломку (любая перестановка заданий меняет случай). Поэтому 12 учеников: среднее по ним держим
 * близко к замеру (сдвиг всего распределения), каждого — под жёстким потолком (очередь где-то разрослась).
 * Замер 21.11.2026 (12 учеников, сиды 1–12): 85% — пик 59–67, среднее 64,3; 75% — пик 71–82, среднее 76,6.
 * Стандартная ошибка среднего ~0,7 и ~1,0 — границы средних с запасом ~3 ошибки.
 */
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const cohort = (acc: number) =>
  SEEDS.map((seed) => {
    const { log, introducedAll } = run(260, acc, seed);
    return {
      seed,
      maxDue: Math.max(...log.map((x) => x.due)),
      late: log.slice(60).reduce((n, x) => n + x.late, 0) / (log.length - 60),
      introducedAll,
    };
  });
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const report = (acc: number, rs: ReturnType<typeof cohort>) =>
  console.log(`${acc * 100}%: пик очереди ${Math.min(...rs.map((r) => r.maxDue))}–${Math.max(...rs.map((r) => r.maxDue))}, среднее ${mean(rs.map((r) => r.maxDue)).toFixed(1)}; все введены к дню ${Math.min(...rs.map((r) => r.introducedAll))}–${Math.max(...rs.map((r) => r.introducedAll))}`);

describe("модель: 1000 слов, 12 учеников", () => {
  it("85% верно: очередь под контролем, повторения не опаздывают, все слова введены за ~5–6 месяцев", () => {
    const rs = cohort(0.85);
    report(0.85, rs);
    expect(mean(rs.map((r) => r.maxDue))).toBeLessThanOrEqual(QUEUE_STOP + 7);
    for (const r of rs) {
      expect(r.maxDue, `ученик ${r.seed}: пик очереди`).toBeLessThanOrEqual(QUEUE_STOP + 15);
      expect(r.late, `ученик ${r.seed}: опоздание`).toBeLessThan(1);
      expect(r.introducedAll, `ученик ${r.seed}: все слова введены`).toBeGreaterThan(0);
      expect(r.introducedAll, `ученик ${r.seed}: все слова введены`).toBeLessThan(200);
    }
  }, 120_000);

  it("75% верно: темп сам снижается, очередь всё равно не копится", () => {
    const rs = cohort(0.75);
    report(0.75, rs);
    expect(mean(rs.map((r) => r.maxDue))).toBeLessThanOrEqual(QUEUE_STOP + 20);
    for (const r of rs) {
      expect(r.maxDue, `ученик ${r.seed}: пик очереди`).toBeLessThanOrEqual(QUEUE_STOP + 30);
      expect(r.introducedAll, `ученик ${r.seed}: все слова введены`).toBeGreaterThan(0);
    }
  }, 120_000);
});
