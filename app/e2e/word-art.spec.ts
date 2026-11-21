import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addDays, DECK, goTab, openHome, setup, state, TODAY, ws } from "./helpers";

/** Иллюстрации к словам (lib/WordArt.tsx): сцена по примеру — слоями и в движении — на карточке нового слова. */

const byId = (id: string) => DECK.words.find((w) => w.id === id)!;

/**
 * Сейчас сцена есть у каждого слова колоды, но новые слова приходят без неё. Чтобы проверить слово без сцены, тест
 * отдаёт приложению word-art.gen.json без этих слов (e2e идёт на vite dev — JSON приходит модулем).
 */
const GEN = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/core/word-art.gen.json"), "utf8")) as Record<string, unknown>;
const withoutArt = (page: Page, ...ids: string[]) =>
  page.route(/\/src\/core\/word-art\.gen\.json(\?.*)?$/, (route) => {
    const gen = Object.fromEntries(Object.entries(GEN).filter(([id]) => !ids.includes(id)));
    return route.fulfill({ contentType: "text/javascript", body: `export default ${JSON.stringify(gen)};` });
  });

/** Первые 8 слов уже выучены — следующие новые: banter (есть сцена) … mix (в тесте — без сцены). */
const startLesson = async (page: Page) => {
  await withoutArt(page, "mix");
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

  await toIntro(page, "mix");
  await expect(page.locator(".intro")).toHaveClass(/\bnoart\b/);
  await expect(page.locator(".intro .wart, .intro .pic")).toHaveCount(0);
  await expect(page.locator(".intro")).not.toContainText(byId("mix").picture);
});

test("длинное слово на карточке нового слова не шире строки (на широком экране ужимается)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const i = DECK.words.findIndex((w) => w.id === "comprehensible");
  const srs = Object.fromEntries(DECK.words.slice(0, i).map((w) => [w.id, ws({ intro: addDays(TODAY, -3), due: addDays(TODAY, 5), lvl: 3 })]));
  await setup(page, { state: state({ srs }) });
  await openHome(page);
  await page.getByRole("button", { name: "Начать часть 1" }).click();
  await toIntro(page, "comprehensible");
  const fit = await page.locator(".intro .word h2").evaluate((h) => {
    const r = document.createRange();
    r.selectNodeContents(h);
    return { text: r.getBoundingClientRect().right, row: h.parentElement!.getBoundingClientRect().right, fs: parseFloat(getComputedStyle(h).fontSize) };
  });
  expect(fit.text).toBeLessThanOrEqual(fit.row);
  expect(fit.fs).toBeGreaterThan(30);
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
  // урок 1 (вчера): praise и wink (есть сцены; у wink веко и искра едут вместе с головой) и mix (в тесте — без сцены)
  await withoutArt(page, "mix");
  const Y = addDays(TODAY, -1);
  const morning = { score: 30, total: 38, mins: 15, newN: 3, at: `${Y}T06:00:00.000Z` };
  await setup(page, { state: state({ days: { [Y]: { morning } }, srs: { praise: ws({ intro: Y, lvl: 2 }), wink: ws({ intro: Y, lvl: 2 }), mix: ws({ intro: Y, lvl: 2 }) } }) });
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

  const wink = rows.filter({ hasText: byId("wink").ru });
  await wink.locator("summary").click();
  await expect(wink.getByRole("img", { name: byId("wink").example })).toHaveClass(/\bready\b/);
  // веко и искра — внутри обёрток, которые повторяют движение головы; и у обёрток, и у самих слоёв своя анимация
  await expect(wink.locator('[data-follow="yellow"] img[data-layer]')).toHaveCount(2);
  // анимации стартуют эффектом после ready — ждём, а не читаем один раз
  const moving = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .flatMap((a) => {
          const el = (a.effect as KeyframeEffect | null)?.target;
          return el?.closest(".wart[data-art=wink]") ? [el.getAttribute("data-layer") ?? `follow:${el.getAttribute("data-follow")}`] : [];
        })
        .sort(),
    );
  await expect.poll(moving).toEqual(["eye-closed", "follow:yellow", "follow:yellow", "spark", "yellow"]);

  const mix = rows.filter({ hasText: byId("mix").ru });
  await mix.locator("summary").click();
  await expect(mix).toContainText(byId("mix").example);
  await expect(mix.locator(".wart")).toHaveCount(0);

  await praise.locator("summary").click(); // свернули — сцены нет
  await expect(praise.locator(".wart")).toHaveCount(0);
});
