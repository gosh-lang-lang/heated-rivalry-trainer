import { expect, test, type Page } from "@playwright/test";
import { addDays, afterMorning, DECK, openHome, playSession, readState, setup, state, TODAY, ws } from "./helpers";

/**
 * Урок из двух частей (core/lesson.ts): пауза 90 минут от конца части 1, после 22:00 — «лучше завтра»,
 * часть 2, не пройденная вчера, переносится на сегодня и идёт первой. Время — Москва (playwright.config.ts).
 */

const YDAY = addDays(TODAY, -1);
const msk = (day: string, hm: string) => new Date(`${day}T${hm}:00+03:00`);
const card = (page: Page, part: 1 | 2) => page.locator(".today .sess").filter({ has: page.getByRole("heading", { name: new RegExp(`часть ${part}`) }) });

test.describe("урок из двух частей", () => {
  test("после части 1 — «Лучше после …» с отсчётом, начать можно; когда пауза прошла — обычная кнопка", async ({ page }) => {
    await setup(page, { state: afterMorning(12) }); // часть 1 закончилась в 09:00, сейчас 09:00
    await openHome(page);
    await expect(page.getByRole("heading", { name: "Урок 1 · часть 1 — учим" })).toBeVisible();
    const p2 = card(page, 2);
    await expect(p2.getByRole("heading")).toHaveText("Урок 1 · часть 2 — применяем");
    await expect(p2).toContainText("Лучше после 10:30");
    await expect(p2).toContainText("через 1 ч 30 мин");
    await expect(p2.getByRole("button", { name: "Начать часть 2" })).toBeVisible();
    await expect(page.locator(".hero p")).toHaveText("Урок из двух частей по ~15 минут: сначала учим, потом применяем.");

    // прошло полтора часа — вернулись в приложение
    await page.clock.setFixedTime(msk(TODAY, "10:31"));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(p2).not.toContainText("Лучше после");
    await expect(p2).toContainText("Проверка, говорение, перечитать");
    await expect(p2.getByRole("button", { name: "Начать часть 2" })).toBeVisible();
  });

  test("часть 1 закончилась в 21:30 — часть 2 лучше завтра, но можно «Всё равно сейчас»", async ({ page }) => {
    const srs = Object.fromEntries(DECK.words.slice(0, 6).map((w) => [w.id, ws()]));
    const morning = { score: 30, total: 38, mins: 14, newN: 6, at: msk(TODAY, "21:30").toISOString() };
    await setup(page, { state: state({ srs, days: { [TODAY]: { morning } } }), now: msk(TODAY, "21:35") });
    await openHome(page);
    const p2 = card(page, 2);
    await expect(p2).toContainText("Сегодня уже поздно — часть 2 лучше завтра первым делом");
    await expect(p2.getByRole("button", { name: "Начать часть 2" })).toHaveCount(0);
    await expect(page.locator(".hero p")).toHaveText("На сегодня всё — отличная смена. До завтра!");
    await p2.getByRole("button", { name: "Всё равно сейчас" }).click();
    await expect(page.locator(".sect h2")).toHaveText("Проверка без подсказок");
  });

  test("на следующий день — сначала часть 2 вчерашнего урока, потом часть 1 следующего", async ({ page }) => {
    const srs = Object.fromEntries(DECK.words.slice(0, 6).map((w) => [w.id, ws({ intro: YDAY, due: TODAY })]));
    const morning = { score: 30, total: 38, mins: 14, newN: 6, at: msk(YDAY, "21:30").toISOString() };
    await setup(page, { state: state({ srs, days: { [YDAY]: { morning } } }) }); // сегодня 09:00
    await openHome(page);

    const heads = page.locator(".today .sess h2");
    await expect(heads).toHaveText(["Урок 1 · часть 2 — применяем", "Урок 2 · часть 1 — учим"]);
    await expect(card(page, 2)).toHaveClass(/\bnow\b/);
    await expect(card(page, 2)).toContainText("Осталась с прошлого раза");
    // часть 1 нового урока — второстепенная, но начать можно
    await expect(card(page, 1)).toContainText("Лучше после части 2 урока 1");
    await expect(card(page, 1).getByRole("button", { name: "Начать часть 1" })).toHaveClass(/\bghost\b/);

    await card(page, 2).getByRole("button", { name: "Начать часть 2" }).click();
    const r = await playSession(page);
    expect(r.steps).not.toContain("Повторение"); // вчерашние слова проверяет «впиши», а не разминка
    // перенесённая часть 2 закрыла вчерашний урок — карточка №01
    await expect(page.getByRole("heading", { name: "Урок 1 пройден!" })).toBeVisible();
    await expect(page.locator(".rw-new")).toContainText("Новая карточка · №\u200901 из 10");

    // итог — в день урока, «перечитал» — тоже
    const st = await readState(page);
    expect(st.days[YDAY].evening).toMatchObject({ score: 8, total: 8 });
    expect(st.days[YDAY].reread).toBe(true);
    expect(st.days[TODAY]?.evening).toBeUndefined();

    await page.getByRole("button", { name: "На главную" }).click();
    await expect(heads).toHaveText(["Урок 1 · часть 2 — применяем", "Урок 2 · часть 1 — учим"]);
    await expect(card(page, 2)).toContainText("Готово · 8/8");
    await expect(card(page, 1)).toHaveClass(/\bnow\b/);
    await expect(card(page, 1).getByRole("button", { name: "Начать часть 1" })).not.toHaveClass(/\bghost\b/);
    // вчерашний день в полоске недели — обе части
    await expect(page.locator(".wk li").nth(5).locator(".dot.on")).toHaveCount(2);
    await expect(page.locator(".chip")).toContainText("1 день");
  });

  test("урок три дня назад — часть 2 не переносится, сегодня новый урок", async ({ page }) => {
    const d3 = addDays(TODAY, -3);
    const srs = Object.fromEntries(DECK.words.slice(0, 6).map((w) => [w.id, ws({ intro: d3, due: TODAY })]));
    const morning = { score: 30, total: 38, mins: 14, newN: 6, at: msk(d3, "10:00").toISOString() };
    await setup(page, { state: state({ srs, days: { [d3]: { morning } } }) });
    await openHome(page);
    await expect(page.locator(".today .sess h2")).toHaveText(["Урок 2 · часть 1 — учим", "Урок 2 · часть 2 — применяем"]);
    await expect(card(page, 2)).toContainText("Сначала пройди часть 1");
    await expect(card(page, 2).getByRole("button")).toHaveCount(0);
  });
});
