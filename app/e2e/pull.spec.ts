import { expect, test, type Page } from "@playwright/test";
import { openHome, setup } from "./helpers";

/**
 * «Потяни, чтобы обновить» (lib/pull.ts): жест касанием на телефоне.
 * Касания шлём сами из страницы: у Playwright нет протяжки пальцем, CDP есть только в Chromium,
 * а в WebKit нет конструктора Touch — тогда событие с теми же полями (touches, changedTouches).
 */

test.beforeEach(() => test.skip(test.info().project.name !== "iphone", "жест касанием — на телефоне"));

const X = 190;
const Y0 = 160;

/** Одно событие касания в точке (x, y) окна; возвращает, отменили ли его (preventDefault). */
const touch = (page: Page, type: "touchstart" | "touchmove" | "touchend", x: number, y: number) =>
  page.evaluate(
    ({ type, x, y }) => {
      const target = document.elementFromPoint(x, y) ?? document.body;
      const pt = { identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y + scrollY, screenX: x, screenY: y };
      const active = type === "touchend" ? [] : [pt];
      let ev: Event;
      try {
        const t = new Touch(pt);
        const list = type === "touchend" ? [] : [t];
        ev = new TouchEvent(type, { bubbles: true, cancelable: true, touches: list, targetTouches: list, changedTouches: [t] });
      } catch {
        // движок без конструктора Touch — событие с теми же полями
        ev = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperties(ev, { touches: { value: active }, targetTouches: { value: active }, changedTouches: { value: [pt] } });
      }
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    },
    { type, x, y },
  );

/** Положить палец и протянуть вниз на dy px (по шагам, как настоящий палец). Отпускать — release. */
const pull = async (page: Page, dy: number, from = Y0) => {
  await touch(page, "touchstart", X, from);
  let prevented = false;
  for (let d = 10; d <= dy; d += 10) prevented = (await touch(page, "touchmove", X, from + d)) || prevented;
  return prevented;
};
const release = (page: Page, y = Y0) => touch(page, "touchend", X, y);

const ptr = (page: Page) => page.locator("html").getAttribute("data-ptr");
const box = async (page: Page, sel: string) => (await page.locator(sel).boundingBox())!;

test.describe("потяни, чтобы обновить", () => {
  test("сцена появляется, игроки едут навстречу за пальцем, страница сдвигается", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await expect(page.locator(".ptr")).toBeHidden();
    const heroTop = (await box(page, ".hero")).y;

    // первые миллиметры вниз: системный «отскок» уже отменён, но сцены ещё нет (мёртвая зона)
    await touch(page, "touchstart", X, Y0);
    expect(await touch(page, "touchmove", X, Y0 + 4), "прокрутку перехватили сразу").toBe(true);
    expect(await ptr(page)).toBeNull();
    await release(page);

    expect(await pull(page, 60), "прокрутку перехватили").toBe(true);
    expect(await ptr(page)).toBe("pull");
    await expect(page.locator(".ptr")).toBeVisible();
    const l1 = await box(page, ".ptr-sk.l"),
      r1 = await box(page, ".ptr-sk.r");
    expect((await box(page, ".hero")).y).toBeGreaterThan(heroTop + 30);

    for (let d = 70; d <= 110; d += 10) await touch(page, "touchmove", X, Y0 + d);
    const l2 = await box(page, ".ptr-sk.l"),
      r2 = await box(page, ".ptr-sk.r");
    expect(l2.x, "красный едет слева к центру").toBeGreaterThan(l1.x + 20);
    expect(r2.x, "чёрный едет справа к центру").toBeLessThan(r1.x - 20);
    // ещё не порог — друг до друга не доехали
    const mid = page.viewportSize()!.width / 2;
    expect(l2.x + l2.width).toBeLessThan(mid - 10);
    await release(page);
  });

  test("короткий рывок — сцена уезжает обратно, без перезагрузки", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await page.evaluate(() => ((window as unknown as { __alive: number }).__alive = 1));
    const heroTop = (await box(page, ".hero")).y;

    await pull(page, 90);
    await release(page, Y0 + 90);
    expect(await ptr(page)).toBe("back");
    await expect(page.locator("html")).not.toHaveAttribute("data-ptr");
    await expect(page.locator(".ptr")).toBeHidden();
    expect((await box(page, ".hero")).y).toBe(heroTop);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => (window as unknown as { __alive?: number }).__alive), "страница не перезагружалась").toBe(1);
  });

  test("за порогом — встают на вбрасывание, стукаются клюшками, и страница перезагружается", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await page.evaluate(() => ((window as unknown as { __alive: number }).__alive = 1));

    await pull(page, 220);
    // на пороге крюки клюшек почти касаются над шайбой
    const mid = page.viewportSize()!.width / 2;
    const l = await box(page, ".ptr-sk.l"),
      r = await box(page, ".ptr-sk.r");
    expect(Math.abs(l.x + l.width - mid)).toBeLessThan(8);
    expect(Math.abs(r.x - mid)).toBeLessThan(8);

    const loaded = page.waitForEvent("load");
    await release(page, Y0 + 220);
    expect(await ptr(page)).toBe("clash");
    await expect(page.locator(".ptr-spark")).toHaveCSS("animation-name", "ptr-spark");
    await loaded;
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Евгений");
    expect(await page.evaluate(() => (window as unknown as { __alive?: number }).__alive), "перезагрузилась").toBeUndefined();
  });

  test("«уменьшить движение»: игроки сразу у центра, без катания, и перезагрузка", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setup(page);
    await openHome(page);
    await pull(page, 40);
    const mid = page.viewportSize()!.width / 2;
    const l = await box(page, ".ptr-sk.l");
    expect(Math.abs(l.x + l.width - mid)).toBeLessThan(8);
    await expect(page.locator(".ptr-body svg").first()).toHaveCSS("animation-name", "none");
    for (let d = 50; d <= 220; d += 10) await touch(page, "touchmove", X, Y0 + d);
    const loaded = page.waitForEvent("load");
    await release(page, Y0 + 220);
    await loaded;
  });

  test("обычная прокрутка не тронута: страница не наверху, жест вверх и вбок", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Слова", exact: true }).click();
    await page.locator(".lrow").filter({ hasText: "Впереди" }).click(); // длинная страница — почти вся колода
    await expect(page.locator(".wrow").first()).toBeVisible();

    // палец вверх (прокрутка вниз) — не наш жест, событие не отменяем
    await touch(page, "touchstart", X, 400);
    expect(await touch(page, "touchmove", X, 370)).toBe(false);
    expect(await touch(page, "touchmove", X, 420)).toBe(false);
    await touch(page, "touchend", X, 420);
    // вбок — тоже
    await touch(page, "touchstart", 100, 300);
    expect(await touch(page, "touchmove", 140, 305)).toBe(false);
    await touch(page, "touchend", 140, 305);
    expect(await ptr(page)).toBeNull();

    // страница прокручена — тянуть вниз значит просто листать обратно
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    expect(await pull(page, 200)).toBe(false);
    await release(page);
    expect(await ptr(page)).toBeNull();
    await expect(page.locator(".ptr")).toBeHidden();
  });

  test("во время занятия жеста нет — занятие не потеряется", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await page.evaluate(() => ((window as unknown as { __alive: number }).__alive = 1));
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    await expect(page.locator(".sect h2")).toHaveText("Новые слова · блок 1");

    expect(await pull(page, 220)).toBe(false);
    expect(await ptr(page)).toBeNull();
    await expect(page.locator(".ptr")).toHaveCount(0);
    await release(page);
    await page.waitForTimeout(900);
    await expect(page.locator(".sect h2")).toHaveText("Новые слова · блок 1");
    expect(await page.evaluate(() => (window as unknown as { __alive?: number }).__alive)).toBe(1);
  });
});
