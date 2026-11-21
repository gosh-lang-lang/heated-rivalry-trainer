import { expect, test, type Page } from "@playwright/test";
import { openHome, setup } from "./helpers";

/**
 * «Потяни, чтобы обновить» на компьютере (lib/pull.ts): та же сцена с хоккеистами — трекпадом у самого верха
 * страницы и клавишами ⌘R / Ctrl+R / F5 (игроки сами выезжают навстречу, удар — и перезагрузка).
 */

test.beforeEach(() => test.skip(test.info().project.name !== "desktop-chrome", "трекпад и клавиатура — на компьютере"));

const ptr = (page: Page) => page.locator("html").getAttribute("data-ptr");
const mark = (page: Page) => page.evaluate(() => ((window as unknown as { __alive: number }).__alive = 1));
const alive = (page: Page) => page.evaluate(() => (window as unknown as { __alive?: number }).__alive);
/** Жест трекпадом вверх: n событий по step px. */
const swipeUp = async (page: Page, n: number, step = 20) => {
  await page.mouse.move(640, 300);
  for (let i = 0; i < n; i++) await page.mouse.wheel(0, -step);
};

test("трекпад у верха: игроки выезжают, недотянул — уезжают обратно без перезагрузки", async ({ page }) => {
  await setup(page);
  await openHome(page);
  await mark(page);
  await page.mouse.move(640, 300);
  await page.mouse.wheel(0, -20);
  expect(await ptr(page)).toBe("pull"); // сцена видна, пока жест идёт
  await expect(page.locator(".ptr")).toBeVisible();
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -20); // всего 80 px прокрутки → ~43 px сдвига, до порога далеко
  await expect(page.locator("html")).not.toHaveAttribute("data-ptr"); // уехали обратно (через «back»)
  await expect(page.locator(".ptr")).toBeHidden();
  await page.waitForTimeout(800);
  expect(await alive(page), "не перезагружалась").toBe(1);
});

test("трекпад за порогом — вбрасывание, удар клюшками и перезагрузка на том же экране", async ({ page }) => {
  await setup(page);
  await openHome(page);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Путь", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400); // прокрутка «Пути» к уроку и обратно — закончилась, жест новый
  await mark(page);
  const loaded = page.waitForEvent("load");
  await swipeUp(page, 14);
  await expect(page.locator("html")).toHaveAttribute("data-ptr", "clash");
  await loaded;
  expect(await alive(page), "перезагрузилась").toBeUndefined();
  await expect(page.getByRole("heading", { level: 1, name: "Путь" })).toBeVisible();
});

test("инерция прокрутки, докатившаяся до верха, — не потягивание", async ({ page }) => {
  await setup(page);
  await openHome(page);
  await page.evaluate(() => window.scrollTo(0, 200));
  await page.waitForTimeout(400);
  await page.mouse.move(640, 300);
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, -40);
    expect(await ptr(page)).toBeNull();
  }
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("⌘R: игроки сами выезжают навстречу, стукаются — и перезагрузка", async ({ page }) => {
  await setup(page);
  await openHome(page);
  await mark(page);
  const loaded = page.waitForEvent("load");
  await page.keyboard.press("Meta+r");
  await expect(page.locator("html")).toHaveAttribute("data-ptr", "pull");
  await expect(page.locator("html")).toHaveAttribute("data-ptr", "clash");
  await expect(page.locator(".ptr-spark")).toHaveCSS("animation-name", "ptr-spark");
  await loaded;
  expect(await alive(page), "перезагрузилась").toBeUndefined();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Евгений");
});

test("в открытой панели трекпад листает панель, страница не обновляется", async ({ page }) => {
  await setup(page);
  await openHome(page);
  await page.getByRole("button", { name: /подробнее о серии/ }).click();
  await expect(page.getByRole("dialog", { name: "Серия дней" })).toBeVisible();
  const b = (await page.locator(".sheet").boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  for (let i = 0; i < 14; i++) await page.mouse.wheel(0, -20);
  expect(await ptr(page)).toBeNull();
});
