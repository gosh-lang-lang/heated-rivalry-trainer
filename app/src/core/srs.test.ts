import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { applyGrade, blankState, dueList, groups, introduce, IV, IV_RARE, levelGroup, streak, unseen } from "./srs";
import { deck, TODAY } from "./fixtures";

describe("даты", () => {
  it("addDays переходит через месяц и год", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("интервальное повторение", () => {
  it("интервалы по уровню", () => expect([...IV]).toEqual([0, 1, 3, 7, 14, 30, 60]));

  it("знакомство: lvl=1, due=завтра, intro=сегодня", () => {
    expect(introduce(undefined, TODAY)).toEqual({ lvl: 1, due: "2026-11-21", intro: TODAY, right: 0, wrong: 0 });
  });

  it("повторное знакомство ничего не меняет", () => {
    const s = { lvl: 4, due: "2026-12-01", intro: "2026-11-01", right: 3, wrong: 0 };
    expect(introduce(s, TODAY)).toBe(s);
  });

  it("повторение, верно: уровень растёт, due по интервалу нового уровня", () => {
    const s = applyGrade({ ...blankState(), lvl: 2, intro: "x" }, true, { rev: true }, TODAY);
    expect(s.lvl).toBe(3);
    expect(s.due).toBe(addDays(TODAY, 7));
    expect(s.right).toBe(1);
  });

  it("уровень не выше 6, интервал 60 дней", () => {
    const s = applyGrade({ ...blankState(), lvl: 6 }, true, { rev: true }, TODAY);
    expect(s.lvl).toBe(6);
    expect(s.due).toBe(addDays(TODAY, 60));
  });

  it("повторение, ошибка: уровень −2 (не ниже 1), проверка завтра", () => {
    const s = applyGrade({ ...blankState(), lvl: 5, due: "2027-01-01" }, false, { rev: true }, TODAY);
    expect(s).toMatchObject({ lvl: 3, due: "2026-11-21", wrong: 1 });
    expect(applyGrade({ ...blankState(), lvl: 2 }, false, { rev: true }, TODAY)).toMatchObject({ lvl: 1, due: "2026-11-21" });
  });

  it("вечерняя ошибка: уровень −2, проверка завтра; верный ответ вечером уровень не меняет", () => {
    expect(applyGrade({ ...blankState(), lvl: 3, due: "z" }, false, { eve: true }, TODAY)).toMatchObject({ lvl: 1, due: "2026-11-21" });
    expect(applyGrade({ ...blankState(), lvl: 4, due: "z" }, false, { eve: true }, TODAY)).toMatchObject({ lvl: 2, due: "2026-11-21" });
    expect(applyGrade({ ...blankState(), lvl: 3, due: "z" }, true, { eve: true }, TODAY)).toMatchObject({ lvl: 3, due: "z", right: 1 });
  });

  it("шаг блока новых слов меняет только счётчики", () => {
    expect(applyGrade({ ...blankState(), lvl: 1, due: "d" }, false, {}, TODAY)).toMatchObject({ lvl: 1, due: "d", wrong: 1 });
  });

  describe("редкие слова", () => {
    it("интервалы вдвое длиннее", () => expect([...IV_RARE]).toEqual([0, 2, 6, 14, 30, 60, 120]));

    it("знакомство: повтор послезавтра", () => {
      expect(introduce(undefined, TODAY, true)).toMatchObject({ lvl: 1, due: addDays(TODAY, 2), intro: TODAY });
    });

    it("повторение, верно: интервал из IV_RARE", () => {
      expect(applyGrade({ ...blankState(), lvl: 5 }, true, { rev: true, rare: true }, TODAY)).toMatchObject({ lvl: 6, due: addDays(TODAY, 120) });
    });

    it("ошибка: уровень −2, не ниже 1; проверка послезавтра", () => {
      expect(applyGrade({ ...blankState(), lvl: 5 }, false, { rev: true, rare: true }, TODAY)).toMatchObject({ lvl: 3, due: addDays(TODAY, 2) });
      expect(applyGrade({ ...blankState(), lvl: 2 }, false, { rev: true, rare: true }, TODAY)).toMatchObject({ lvl: 1, due: addDays(TODAY, 2) });
      expect(applyGrade({ ...blankState(), lvl: 4 }, false, { eve: true, rare: true }, TODAY)).toMatchObject({ lvl: 2, due: addDays(TODAY, 2) });
    });
  });

  it("группы уровней", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(levelGroup)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(groups(deck.words, { praise: { ...blankState(), lvl: 5 } })).toEqual([deck.words.length - 1, 0, 0, 1]);
  });

  it("dueList: просроченные первыми (старые раньше), сегодняшние — от низкого уровня", () => {
    const srs = {
      praise: { ...blankState(), lvl: 4, due: TODAY, intro: "a" },
      novel: { ...blankState(), lvl: 5, due: "2026-11-18", intro: "a" },
      sacred: { ...blankState(), lvl: 1, due: TODAY, intro: "a" },
      entire: { ...blankState(), lvl: 2, due: "2026-11-19", intro: "a" },
      mix: { ...blankState(), lvl: 3, due: "2026-11-25", intro: "a" },
    };
    expect(dueList(deck.words, srs, TODAY).map((w) => w.id)).toEqual(["novel", "entire", "sacred", "praise"]);
  });

  it("dueList: только lvl≥1 с наступившей датой, старые первыми", () => {
    const srs = {
      praise: { ...blankState(), lvl: 2, due: "2026-11-20", intro: "a" },
      novel: { ...blankState(), lvl: 1, due: "2026-11-18", intro: "a" },
      sacred: { ...blankState(), lvl: 1, due: "2026-11-21", intro: "a" },
    };
    expect(dueList(deck.words, srs, TODAY).map((w) => w.id)).toEqual(["novel", "praise"]);
    expect(unseen(deck.words, srs).length).toBe(deck.words.length - 3);
  });

  it("серия: сегодня без занятия не обнуляет вчерашнюю серию", () => {
    const r = { score: 1, total: 1, mins: 1, newN: 0, at: "" };
    const days = { "2026-11-18": { morning: r }, "2026-11-19": { evening: r } };
    expect(streak(days, TODAY)).toBe(2);
    expect(streak({ ...days, [TODAY]: { morning: r } }, TODAY)).toBe(3);
    expect(streak({ "2026-11-17": { morning: r } }, TODAY)).toBe(0);
    expect(streak({ [TODAY]: { reread: true } }, TODAY)).toBe(0);
  });
});
