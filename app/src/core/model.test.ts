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

const run = (days: number, acc: number) => {
  const rng = seeded(42);
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
      } else if ((s.t === "pick" || s.t === "listen" || s.t === "type") && (s.rev || ("eve" in s && s.eve))) {
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
    const morning = play(morningPlan(deck, st, today, { rng }), today);
    const evening = play(eveningPlan(deck, st, today, rng), today);
    st.days = { ...st.days, [today]: { morning, evening } };
    if (introducedAll < 0 && !unseen(deck.words, st.srs).length) introducedAll = d;
  }
  return { log, introducedAll };
};

describe("модель: 1000 слов", () => {
  it("85% верно: очередь под контролем, повторения не опаздывают, все слова введены за ~5–6 месяцев", () => {
    const { log, introducedAll } = run(260, 0.85);
    const maxDue = Math.max(...log.map((x) => x.due));
    const late = log.slice(60).reduce((n, x) => n + x.late, 0) / (log.length - 60);
    console.log(`85%: все введены к дню ${introducedAll}, макс. очередь ${maxDue}, среднее опоздание ${late.toFixed(2)} дн`);
    expect(maxDue).toBeLessThanOrEqual(QUEUE_STOP + 15);
    expect(late).toBeLessThan(1);
    expect(introducedAll).toBeGreaterThan(0);
    expect(introducedAll).toBeLessThan(200);
  });

  it("75% верно: темп сам снижается, очередь всё равно не копится", () => {
    const { log, introducedAll } = run(260, 0.75);
    const maxDue = Math.max(...log.map((x) => x.due));
    console.log(`75%: все введены к дню ${introducedAll}, макс. очередь ${maxDue}`);
    expect(maxDue).toBeLessThanOrEqual(QUEUE_STOP + 15);
  });
});
