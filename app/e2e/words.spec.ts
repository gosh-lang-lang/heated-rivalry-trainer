import { expect, test, type Page } from "@playwright/test";
import { addDays, DECK, goTab, openHome, setup, state, TODAY, ws } from "./helpers";

/**
 * «Слова»: словарь по урокам, в которых слово выучено (не начатые — «Впереди»).
 * Телефон — строка открывает страницу слова; десктоп — таблица, раскрытие строки — пример.
 */

const Y = addDays(TODAY, -1);
const part1 = (day: string) => ({ morning: { score: 30, total: 38, mins: 15, newN: 12, at: `${day}T06:00:00.000Z` } });
/** Вчера — урок 1 (слова 0–2), сегодня — урок 2 (слова 3–4, у первого повтор завтра, уровень 3). */
const twoLessons = () =>
  state({
    days: { [Y]: part1(Y), [TODAY]: part1(TODAY) },
    srs: {
      ...Object.fromEntries(DECK.words.slice(0, 3).map((w) => [w.id, ws({ intro: Y, lvl: 5, due: "2026-11-26" })])),
      [DECK.words[3].id]: ws({ intro: TODAY, lvl: 3, due: addDays(TODAY, 1) }),
      [DECK.words[4].id]: ws({ intro: TODAY }),
    },
  });

const phone = (page: Page) => (page.viewportSize()?.width ?? 0) < 900;
const lessons = (page: Page) => page.getByRole("group", { name: "Уроки" });
const groupRows = (page: Page, name: string) => page.getByRole("region", { name, exact: true }).locator(".wrow");

test.describe("словарь по урокам", () => {
  test("уроки — по дню знакомства, от нового к старому; не начатые — «Впереди»", async ({ page }) => {
    await setup(page, { state: twoLessons() });
    await openHome(page);
    await goTab(page, "Слова");
    await expect(page.getByRole("heading", { level: 1, name: "Словарь" })).toBeVisible();
    await expect(page.locator(".ph-meta")).toHaveText("62 слова · 2 урока");
    await expect(page.locator(".wlist h3")).toHaveText(["Урок 2", "Урок 1", "Впереди"]);
    await expect(groupRows(page, "Урок 2")).toHaveCount(2);
    await expect(groupRows(page, "Урок 1")).toHaveCount(3);
    await expect(groupRows(page, "Впереди")).toHaveCount(57);
    await expect(page.getByRole("region", { name: "Урок 2", exact: true })).toContainText("пт, 20 ноября · сегодня · 2 слова");

    // строка: слово, перевод, уровень, повтор; «—» — не начато
    const w = DECK.words[3];
    const row = groupRows(page, "Урок 2").filter({ hasText: w.ru }).first();
    await expect(row).toContainText(w.en);
    await expect(row.locator(".dots i.f")).toHaveCount(3);
    await expect(row.locator(".wdue")).toHaveText("завтра");
    await expect(groupRows(page, "Урок 1").first().locator(".wdue")).toHaveText("26 ноября");
    await expect(groupRows(page, "Впереди").first().locator(".wdue")).toHaveText("—");
    // на телефоне в строке нет звука и картинок — только на странице слова
    if (phone(page)) await expect(row.locator(".spk")).toHaveCount(0);

    // урок-фильтр и поиск по слову и переводу
    await lessons(page).getByRole("button", { name: /^Урок 1/ }).click();
    await expect(page.locator(".wlist h3")).toHaveText(["Урок 1"]);
    await lessons(page).getByRole("button", { name: /^Все/ }).click();
    await page.getByRole("searchbox").fill(DECK.words[0].ru);
    await expect(page.locator(".wlist .wrow").first()).toContainText(DECK.words[0].en);
    await page.getByRole("searchbox").fill("zzzz");
    await expect(page.getByText("Таких слов нет.")).toBeVisible();
    await page.getByRole("button", { name: "Сбросить фильтры" }).click();
    await expect(page.locator(".wlist .wrow")).toHaveCount(62);
  });

  test("телефон: строка → страница слова, листание по уроку, «назад» — в словарь", async ({ page }) => {
    test.skip(!phone(page), "страница слова открывается с телефона; на десктопе строка раскрывается");
    await setup(page, { state: twoLessons() });
    await openHome(page);
    await goTab(page, "Слова");
    const [a, b] = [DECK.words[3], DECK.words[4]];
    await groupRows(page, "Урок 2").filter({ hasText: a.ru }).first().click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Урок 2");
    await expect(page.locator(".ph-meta")).toHaveText("1 из 2");
    const card = page.locator(".wp-word");
    await expect(card.getByRole("heading", { level: 2 })).toHaveText(a.en);
    await expect(card).toContainText(a.ru);
    await expect(card).toContainText(a.example);
    await expect(card.locator(`.spk[data-say="${a.en}"]`)).toBeVisible();
    await expect(page.locator(".wp-stat")).toContainText("Знакомо · 3 из 6");
    await expect(page.locator(".wp-stat")).toContainText("завтра");
    await expect(page.getByRole("button", { name: /Предыдущее слово/ })).toHaveCount(0);

    await page.getByRole("button", { name: `Следующее слово: ${b.en}` }).click();
    await expect(card.getByRole("heading", { level: 2 })).toHaveText(b.en);
    await expect(page.locator(".ph-meta")).toHaveText("2 из 2");

    // «назад» браузера (жест в Safari) — в словарь, а не на предыдущее слово
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Словарь" })).toBeVisible();
    await groupRows(page, "Урок 2").first().click();
    await page.getByRole("button", { name: "Назад: словарь" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Словарь" })).toBeVisible();
  });

  test("десктоп: таблица, раскрытие строки — пример и повтор, фильтр уровня", async ({ page }) => {
    test.skip(phone(page), "таблица и фильтр уровня — на десктопе");
    await setup(page, { state: twoLessons() });
    await openHome(page);
    await goTab(page, "Слова");
    await expect(page.locator(".whead").first()).toHaveText(/Слово\s*Перевод\s*Уровень\s*Повтор/);
    await expect(lessons(page).getByRole("button", { name: /^Урок 2/ })).toContainText("сегодня");
    const w = DECK.words[3];
    const row = groupRows(page, "Урок 2").filter({ hasText: w.ru }).first();
    await expect(row.locator(`.spk[data-say="${w.en}"]`)).toBeVisible();
    await row.locator("summary").click();
    await expect(row).toContainText(w.example);
    await expect(row).toContainText("Следующее повторение: завтра");

    await page.getByRole("group", { name: "Уровень" }).getByRole("button", { name: /Выучено/ }).click();
    await expect(page.locator(".wlist h3")).toHaveText(["Урок 1"]);
    await expect(page.locator(".wlist .wrow")).toHaveCount(3);
  });
});
