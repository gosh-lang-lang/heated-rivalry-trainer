import { test, expect } from "@playwright/test";
import sources from "../src/core/word-art-04.sources.json" with { type: "json" };
import { DECK } from "./helpers";
import generated from "../src/core/word-art.gen.json" with { type: "json" };
import { SCENES } from "../src/core/word-art";

for (const theme of ["День", "Ночь"]) {
  test(`27 одобренных сцен: пример, загрузка, кроп и движение — ${theme}`, async ({ page }) => {
    const ids = Object.keys(sources);
    await page.goto(`/art.html?ids=${ids.join(",")}`);
    await page.getByRole("button", { name: theme, exact: true }).click();
    await expect(page.locator("section")).toHaveCount(27);
    for (const id of ids) {
      const word = DECK.words.find((w) => w.id === id)!;
      const scene = page.locator(`[data-art="${id}"]`).first();
      await expect(scene).toHaveClass(/ready/);
      await expect(scene).toHaveAttribute("aria-label", word.example);
      await expect(scene.locator("img[data-layer]")).toHaveCount((generated as Record<string, {layers: unknown[]}>)[id].layers.length);
      expect(await scene.locator('img[data-layer="bg"]').evaluate((el) => el.getAnimations().length)).toBe(0);
      await expect.poll(() => scene.evaluate((el) => el.getAnimations({subtree:true}).length)).toBeGreaterThanOrEqual(2);
    }
    expect(await page.locator("section img").evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
    await page.getByRole('button', {name:'Кадр',exact:true}).click();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/approved-art-${test.info().project.name}-${theme === "День" ? "light" : "dark"}.png` });
  });
}

test('интерактивный просмотр: перевод, ввод, проверка и переход без прогресса', async ({ page }) => {
  await page.goto('/art.html?practice=1');
  await expect(page.getByRole('heading', {name:'giant',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Показать перевод'}).click();
  await expect(page.getByText('Огромная волна подняла его маленькую лодку.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Впиши',exact:true}).click();
  await page.getByRole('textbox',{name:'Пропущенное слово'}).fill('wrong');
  await page.getByRole('button',{name:'Проверить',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Правильный ответ: giant');
  await page.getByRole('textbox').fill('giant');
  await page.getByRole('button',{name:'Проверить',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Верно!');
  await page.getByRole('button',{name:'Дальше →'}).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
  await page.getByRole('button',{name:'Знакомство',exact:true}).click();
  await expect(page.getByRole('heading',{name:'defenseman',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ночь',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('combobox', {name:'Выбрать слово'}).selectOption(String(Object.keys(sources).indexOf('sweat-soaked')));
  await expect(page.getByRole('heading', {name:'sweat-soaked',exact:true})).toBeVisible();
  await expect(page.locator('[data-art="sweat-soaked"]')).toHaveClass(/ready/);
});

test('смысловые слои: трансформация, пауза и уменьшение движения', async ({ page }) => {
  await page.goto('/art.html?practice=1');
  const scene = page.locator('[data-art="giant"]');
  await expect(scene).toHaveClass(/ready/);
  await expect.poll(() => scene.evaluate((el) => el.getAnimations({subtree:true}).length)).toBe(Object.keys(SCENES.giant.motion).length);
  const transforms = await scene.evaluate((el) => {
    const a = el.getAnimations({subtree:true})[0];
    a.pause(); a.currentTime = 0;
    const img = (a.effect as KeyframeEffect).target!;
    const start = getComputedStyle(img).transform;
    a.currentTime = 2000;
    return [start, getComputedStyle(img).transform];
  });
  expect(transforms[0]).not.toBe(transforms[1]);
  await page.getByRole('button',{name:'Остановить картинку'}).click();
  expect(await scene.evaluate((el) => el.getAnimations({subtree:true}).length)).toBe(0);
  await page.getByRole('button',{name:'Оживить картинку'}).click();
  await expect.poll(() => scene.evaluate((el) => el.getAnimations({subtree:true}).length)).toBe(Object.keys(SCENES.giant.motion).length);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(() => scene.evaluate((el) => el.getAnimations({subtree:true}).length)).toBe(0);
});
