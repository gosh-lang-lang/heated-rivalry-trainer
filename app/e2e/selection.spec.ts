import { expect, test } from "@playwright/test";
import { addDays, DECK, goTab, openHome, setup, state, TODAY, ws } from "./helpers";

/**
 * Долгое нажатие и двойной тап по интерфейсу ничего не выделяют (styles.css: html{user-select:none}); выделять можно
 * только в полях ввода и в тексте для чтения раскрытого слова «Слов» (пример, цитата, пояснение).
 */

const selected = (page: import("@playwright/test").Page) => page.evaluate(() => window.getSelection()?.toString() ?? "");
const userSelect = (el: Element) => {
  const s = getComputedStyle(el) as CSSStyleDeclaration & { webkitUserSelect?: string };
  return s.userSelect || s.webkitUserSelect || "";
};

test("интерфейс не выделяется; поле ввода и пример в раскрытом слове — выделяются", async ({ page }) => {
  const Y = addDays(TODAY, -1);
  const praise = DECK.words.find((w) => w.id === "praise")!;
  await setup(page, { state: state({ days: { [Y]: { morning: { score: 30, total: 38, mins: 15, newN: 1, at: `${Y}T06:00:00.000Z` } } }, srs: { praise: ws({ intro: Y, lvl: 2 }) } }) });
  await openHome(page);

  // приветствие на главной: тройной клик ничего не выделяет
  const hello = page.getByRole("heading", { level: 1 }).first();
  await expect(hello).toBeVisible();
  // проверяем поведение, а не стиль: в WebKit у потомков вычисленное значение — auto («как у родителя»)
  await hello.click({ clickCount: 3 });
  expect(await selected(page)).toBe("");

  // «Слова»: поиск печатается и выделяется
  await goTab(page, "Слова");
  const find = page.locator("input.find");
  expect(await find.evaluate(userSelect)).toBe("text");
  await find.fill("praise");
  await expect(find).toHaveValue("praise");
  await find.click({ clickCount: 3 }); // тройной: в эмуляции iPhone двойной клик в поле не выделяет и без нашего правила
  expect(await find.evaluate((i: HTMLInputElement) => i.value.slice(i.selectionStart ?? 0, i.selectionEnd ?? 0))).toBe("praise");

  // раскрытое слово: строка-заголовок не выделяется, пример — выделяется
  const row = page.locator(".wrow").filter({ hasText: praise.ru }).first();
  await row.locator("summary").click();
  const example = row.locator(".dex p b");
  await expect(example).toHaveText(praise.example);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await row.locator("summary .wru").click({ clickCount: 3 });
  expect(await selected(page)).toBe("");
  if (!(await example.isVisible())) await row.locator("summary").click(); // клики по строке её сворачивают — раскрываем
  expect(await row.locator(".dex p").evaluate(userSelect)).toBe("text");
  await example.click({ clickCount: 3 });
  expect(praise.example).toContain((await selected(page)).trim());
  expect((await selected(page)).trim()).not.toBe("");
});
