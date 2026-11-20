import { expect, test, type Page } from "@playwright/test";
import { addDays, DECK, goTab, openHome, setup, state, TODAY, ws } from "./helpers";

/** Иллюстрации к словам (lib/WordArt.tsx): сцена по примеру — слоями и в движении — на карточке нового слова. */

const byId = (id: string) => DECK.words.find((w) => w.id === id)!;

/** Первые 8 слов уже выучены — следующие новые: banter (есть сцена), exploration (нет). */
const startLesson = async (page: Page) => {
  const srs = Object.fromEntries(DECK.words.slice(0, 8).map((w) => [w.id, ws({ intro: addDays(TODAY, -3), due: addDays(TODAY, 5), lvl: 3 })]));
  await setup(page, { state: state({ srs }) });
  await openHome(page);
  await page.getByRole("button", { name: "Начать часть 1" }).click();
};

/** Листать до карточки нового слова en. */
const toIntro = async (page: Page, en: string) => {
  for (let n = 0; n < 30; n++) {
    const h = page.locator(".intro .word h2");
    if ((await h.count()) && (await h.textContent())?.trim() === en) return;
    await page.locator("#next").click();
  }
  throw new Error(`не дошли до карточки «${en}»`);
};

test("новое слово со сценой: слои загружены и движутся; без сцены — без картинки и без эмодзи", async ({ page }) => {
  await startLesson(page);
  await toIntro(page, "banter");
  const banter = byId("banter");
  const art = page.getByRole("img", { name: banter.example });
  await expect(art).toBeVisible();
  await expect(art).toHaveClass(/\bready\b/);
  await expect(page.locator(".intro")).not.toContainText(banter.picture);
  // все слои загрузились
  const layers = art.locator("img[data-layer]");
  await expect(layers).toHaveCount(4);
  expect(await layers.evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
  // движутся Красный, Жёлтый и вспышка; фон стоит
  expect(await page.evaluate(() => document.getAnimations().flatMap((a) => (a.effect as KeyframeEffect | null)?.target?.getAttribute("data-layer") ?? []).sort())).toEqual(["nudge", "red", "yellow"]);

  await toIntro(page, "exploration");
  await expect(page.locator(".intro")).toHaveClass(/\bnoart\b/);
  await expect(page.locator(".intro .wart, .intro .pic")).toHaveCount(0);
  await expect(page.locator(".intro")).not.toContainText(byId("exploration").picture);
});

test("«Уменьшить движение» — сцена неподвижна", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startLesson(page);
  await toIntro(page, "banter");
  const art = page.getByRole("img", { name: byId("banter").example });
  await expect(art).toHaveClass(/\bready\b/);
  await expect(art).toHaveClass(/\bstill\b/);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest(".wart")).length)).toBe(0);
});

test("словарь: сцена — в раскрытой строке слова и в движении; закрытая строка и слово без сцены — без картинки", async ({ page }) => {
  // урок 1 (вчера): praise (есть сцена) и novel (нет)
  const Y = addDays(TODAY, -1);
  const morning = { score: 30, total: 38, mins: 15, newN: 2, at: `${Y}T06:00:00.000Z` };
  await setup(page, { state: state({ days: { [Y]: { morning } }, srs: { praise: ws({ intro: Y, lvl: 2 }), novel: ws({ intro: Y, lvl: 2 }) } }) });
  await openHome(page);
  await goTab(page, "Слова");
  await page.locator(".lrow").filter({ hasText: "Урок 1" }).click();
  const rows = page.getByRole("list", { name: "Урок 1", exact: true }).locator(".wrow");
  const praise = rows.filter({ hasText: byId("praise").ru });
  await expect(praise.locator(".wart")).toHaveCount(0); // закрыта — слои не грузятся
  await praise.locator("summary").click();
  const art = praise.getByRole("img", { name: byId("praise").example });
  await expect(art).toHaveClass(/\bready\b/);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest(".wart[data-art=praise]")).length)).toBeGreaterThan(0);

  const novel = rows.filter({ hasText: byId("novel").ru });
  await novel.locator("summary").click();
  await expect(novel).toContainText(byId("novel").example);
  await expect(novel.locator(".wart")).toHaveCount(0);

  await praise.locator("summary").click(); // свернули — сцены нет
  await expect(praise.locator(".wart")).toHaveCount(0);
});
