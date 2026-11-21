import { expect, test, type Page } from "@playwright/test";
import { afterMorning, NOW, openHome, openSettingsSection, readState, setup } from "./helpers";

/**
 * Прогресс живёт на сервере, браузер — только кэш (src/lib/sync.ts).
 * Сервер здесь — мок из helpers.setup (те же правила, что у server/progress.ts);
 * настоящий сервер с двумя пользователями — в auth.spec.ts.
 */

const perDay = (page: Page, n: number) => page.getByRole("button", { name: String(n), exact: true });

test("прогресс, живший только в браузере, уезжает на сервер при первом входе", async ({ page }) => {
  const log = await setup(page, { state: afterMorning(6) });
  await openHome(page);
  await expect(page.locator(".legend")).toContainText("Учу6");
  await expect.poll(() => Object.keys((log.server.state as { srs?: object } | null)?.srs ?? {}).length).toBe(6);
  // старый общий ключ забран вошедшим пользователем
  expect(await page.evaluate(() => localStorage.getItem("hr2_state"))).toBeNull();
  expect(Object.keys((await readState(page)).srs)).toHaveLength(6);
});

test("на новом устройстве — прогресс с сервера", async ({ page }) => {
  const remote = { ...afterMorning(5), upd: 5 };
  const log = await setup(page, { remote });
  await openHome(page);
  await expect(page.locator(".legend")).toContainText("Учу5");
  expect(Object.keys((await readState(page)).srs)).toHaveLength(5);
  expect(log.server.puts).toBe(0); // ничего нового — ничего не отправляли
});

test("на сервере новее, чем на устройстве, — берём серверный", async ({ page }) => {
  const log = await setup(page, { state: afterMorning(3), remote: { ...afterMorning(7), upd: 10 } });
  await openHome(page);
  await expect(page.locator(".legend")).toContainText("Учу7");
  expect(Object.keys((await readState(page)).srs)).toHaveLength(7);
  expect(log.server.state!.upd).toBe(10);
});

test("изменение сразу уходит на сервер", async ({ page }) => {
  const log = await setup(page, { remote: { ...afterMorning(2), upd: 5 } });
  await openHome(page);
  await openSettingsSection(page, "Занятия");
  await perDay(page, 18).click();
  await expect.poll(() => (log.server.state as { settings?: { newPerDay: number } }).settings?.newPerDay).toBe(18);
});

test("вернулся в приложение — подхватил сделанное на другом устройстве", async ({ page }) => {
  const log = await setup(page, { remote: { ...afterMorning(2), upd: 5 } });
  await openHome(page);
  await openSettingsSection(page, "Занятия");
  await expect(perDay(page, 12)).toHaveAttribute("aria-pressed", "true");
  // на телефоне поменяли настройку
  log.server.state = { ...afterMorning(2), settings: { newPerDay: 24 }, upd: NOW.getTime() + 60_000 };
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(perDay(page, 24)).toHaveAttribute("aria-pressed", "true");
});

test("без сети работаем с кэшем, а когда сеть появилась — отправляем накопленное", async ({ page }) => {
  const log = await setup(page, { remote: { ...afterMorning(2), upd: 5 } });
  const down = (route: { abort: (e: string) => Promise<void> }) => route.abort("internetdisconnected");
  await page.route("**/api/state", down); // поверх мока: сервер недоступен
  await page.goto("/");
  await openSettingsSection(page, "Занятия");
  await perDay(page, 6).click();
  await page.waitForTimeout(1200); // задержка отправки прошла — отправить не удалось
  expect((await readState(page)).settings.newPerDay).toBe(6);
  expect(log.server.puts).toBe(0);

  await page.unroute("**/api/state", down);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => (log.server.state as { settings?: { newPerDay: number } }).settings?.newPerDay).toBe(6);
});

test("прогресс сброшен на сервере (progress:reset) — кэш устройства до сброса его не возвращает", async ({ page }) => {
  // на устройстве — 6 слов и часть 1 сегодня (кэш до сброса), на сервере — сброшено, голос оставлен
  const remote = { ...afterMorning(0), srs: {}, days: {}, upd: 10, reset: 10, settings: { newPerDay: 12, voice: "bf_emma" }, settingsAt: { voice: 3 } };
  const log = await setup(page, { state: { ...afterMorning(6), upd: 99 }, remote });
  await openHome(page);
  await expect(page.locator(".legend")).toContainText("Новые62");
  await expect(page.getByRole("button", { name: "0 дней подряд — подробнее о серии" })).toBeVisible();
  await expect.poll(async () => Object.keys((await readState(page)).srs).length).toBe(0);
  expect((await readState(page)).settings.voice).toBe("bf_emma");
  await page.waitForTimeout(600);
  expect(Object.keys((log.server.state as { srs?: object }).srs ?? {})).toHaveLength(0); // на сервер слова не вернулись
});
