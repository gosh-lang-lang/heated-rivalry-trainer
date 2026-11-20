import { expect, test } from "@playwright/test";
import { afterMorning, DECK, openHome, playSession, readState, setup, state, TODAY, ws } from "./helpers";

test.describe("часть 2 урока — применяем", () => {
  test("до части 1 часть 2 недоступна", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await expect(page.getByText("Сначала пройди часть 1")).toBeVisible();
    await expect(page.getByRole("button", { name: "Начать часть 2" })).toHaveCount(0);
  });

  test("полная часть 2: вписать → своё предложение → вслух → перечитать", async ({ page }) => {
    await setup(page, { state: afterMorning(12) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 2" }).click();
    const r = await playSession(page, { sentence: "My coach is always grumpy in the morning." });

    const kinds = [...new Set(r.steps)];
    expect(kinds).toEqual([
      "Проверка без подсказок",
      "Вспомни · Впиши пропущенное",
      "Своё предложение",
      "Напиши своё предложение",
      "Скажи вслух",
      "Перечитай страницы",
    ]);
    // часть 2 закрыла урок — итог с карточкой: 12 «впиши» + 2 «скажи вслух» верно, предложения без автопроверки в счёт не идут
    await expect(page.locator(".rw-kick")).toHaveText("Урок 1 · часть 2 готова");
    await expect(page.getByRole("heading", { name: "Урок 1 пройден!" })).toBeVisible();
    await expect(page.locator(".reward .stats3 div").first()).toHaveText("100%верно");

    const st = await readState(page);
    expect(st.days[TODAY].reread).toBe(true);
    expect(st.sent).toHaveLength(3);
    expect(st.sent.every((s) => s.pending && s.text === "My coach is always grumpy in the morning.")).toBe(true);

    await page.getByRole("button", { name: "На главную" }).click();
    await expect(page.getByText("Готово · 14/14")).toBeVisible();
  });

  test("ошибка в части 2 снижает уровень на 2 и ставит проверку на завтра", async ({ page }) => {
    const srs = { [DECK.words[0].id]: ws({ lvl: 4, due: "2026-12-01" }) };
    await setup(page, { state: state({ srs, days: { [TODAY]: { morning: { score: 1, total: 1, mins: 1, newN: 1, at: "x" } } } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 2" }).click();
    await page.getByRole("button", { name: "Поехали" }).click();
    await page.locator("input.inp").fill("неправильно");
    await page.locator("#chk").click();
    const st = await readState(page);
    expect(st.srs[DECK.words[0].id]).toMatchObject({ lvl: 2, due: "2026-11-21", wrong: 1 });
  });

  test("«Скажи вслух»: проверка по доле услышанных слов", async ({ page }) => {
    await setup(page, { state: afterMorning(2) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 2" }).click();
    // пропускаем до говорения
    for (let i = 0; i < 40 && !(await page.locator(".lbl", { hasText: "Скажи вслух" }).isVisible()); i++) {
      if (await page.getByRole("button", { name: "Пропустить" }).isVisible()) await page.getByRole("button", { name: "Пропустить" }).click();
      else if (await page.getByRole("button", { name: "Не помню" }).isVisible()) {
        await page.getByRole("button", { name: "Не помню" }).click();
        await page.locator("#next").click();
      } else await page.locator("#next").click();
    }
    await page.locator("textarea.inp").fill("the");
    await page.locator("#chk").click();
    await expect(page.locator(".fb h3")).toContainText("попробуй ещё завтра");
    await expect(page.locator(".fb")).toContainText("Не расслышал");
  });
});
