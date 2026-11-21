import { expect, test, type Page } from "@playwright/test";
import { goTab, MOCK_DEVICES, openHome, openSettings, openSettingsSection, settingsRow, setup } from "./helpers";

/**
 * «Настройки», как в iOS (screens/Settings.tsx): корень — список разделов с текущими значениями,
 * раздел — своя страница внутри настроек (телефон) или правая колонка рядом со списком (десктоп).
 */

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 900;
const rootHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "Настройки" });
/** Настройки — подстраница «Я»: в навигации выбрана вкладка «Я». */
const tab = (page: Page) => page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Я", exact: true });
const depth = (page: Page) => page.evaluate(() => (history.state as { d?: number } | null)?.d ?? 0);

test("корень: четыре раздела с текущими значениями, имя вошедшего над входом", async ({ page }) => {
  await setup(page);
  await openHome(page);
  await openSettings(page);
  await expect(settingsRow(page, "Занятия")).toContainText("12 новых слов за урок");
  await expect(settingsRow(page, "Озвучка")).toContainText("Heart");
  await expect(settingsRow(page, "Оформление")).toContainText("Лёд · как в системе");
  await expect(settingsRow(page, "Вход и устройства")).toContainText("3 устройства");
  await expect(page.locator(".set-nav .sgroup")).toHaveText("Евгений");
  await expect(page.locator(".srow")).toHaveCount(4);
});

test("значения на корне меняются вслед за выбором в разделе", async ({ page }) => {
  await setup(page);
  let list = MOCK_DEVICES;
  await page.route("**/api/auth/sessions", (route) => route.fulfill({ json: list }));
  await page.route("**/api/auth/sessions/revoke", (route) => {
    const { id } = route.request().postDataJSON() as { id: string };
    list = { ...list, sessions: list.sessions.filter((s) => s.id !== id) };
    return route.fulfill({ json: { ok: true } });
  });
  await openHome(page);

  await openSettingsSection(page, "Занятия");
  await page.getByRole("button", { name: "18", exact: true }).click();
  await openSettingsSection(page, "Озвучка");
  await page.getByRole("radio", { name: /Emma/ }).click();
  await openSettingsSection(page, "Оформление");
  await page.getByRole("radiogroup", { name: "Оформление" }).getByRole("radio", { name: /Классика/ }).click();
  await openSettingsSection(page, "Вход и устройства");
  await page.getByRole("button", { name: /^Выйти: Mac · Chrome/ }).click();
  await expect(page.getByRole("list", { name: "Где выполнен вход" }).getByRole("listitem")).toHaveCount(2);

  await openSettings(page);
  await expect(settingsRow(page, "Занятия")).toContainText("18 новых слов за урок");
  await expect(settingsRow(page, "Озвучка")).toContainText("Emma");
  await expect(settingsRow(page, "Оформление")).toContainText("Классика · как в системе");
  await expect(settingsRow(page, "Вход и устройства")).toContainText("2 устройства");

  // день/ночь — тумблером в шапке; на корне настроек — тоже видно
  await goTab(page, "Главная");
  await page.getByRole("switch", { name: "Ночная тема" }).click();
  await openSettings(page);
  await expect(settingsRow(page, "Оформление")).toContainText("Классика · ночь");
});

test.describe("телефон: раздел — своя страница", () => {
  test.beforeEach(({ page }) => test.skip(wide(page), "на десктопе список и раздел рядом"));

  test("строка открывает раздел, «‹ Настройки» возвращает к списку", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await openSettings(page);
    await expect(page.locator(".seg")).toHaveCount(0); // на корне — только список

    await settingsRow(page, "Озвучка").click();
    await expect(page.getByRole("heading", { level: 1, name: "Озвучка" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Голос озвучки" })).toBeVisible();
    await expect(page.locator(".srow")).toHaveCount(0);
    await expect(tab(page)).toHaveAttribute("aria-current", "page"); // всё ещё внутри «Я» → «Настройки»

    await page.getByRole("button", { name: "Назад в настройки" }).click();
    await expect(rootHeading(page)).toBeVisible();
    await expect(page.locator(".srow")).toHaveCount(4);
    expect(await depth(page)).toBe(1); // запись раздела снята — «назад» не стоит на месте, остаётся запись «Настроек»
  });

  test("«назад» браузера (жест в Safari) из раздела — к списку настроек, «вперёд» — снова в раздел", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await openSettings(page);

    await settingsRow(page, "Вход и устройства").click();
    await expect(page.getByRole("heading", { level: 1, name: "Вход и устройства" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Где выполнен вход" })).toBeVisible();

    await page.goBack();
    await expect(rootHeading(page)).toBeVisible();
    await expect(settingsRow(page, "Вход и устройства")).toContainText("3 устройства");
    await expect(tab(page)).toHaveAttribute("aria-current", "page");

    await page.goForward();
    await expect(page.getByRole("heading", { level: 1, name: "Вход и устройства" })).toBeVisible();
    await page.goBack();
    await expect(rootHeading(page)).toBeVisible();

    // кнопка, а потом другой раздел и «назад» — снова к списку
    await settingsRow(page, "Занятия").click();
    await page.getByRole("button", { name: "Назад в настройки" }).click();
    await settingsRow(page, "Оформление").click();
    await expect(page.getByRole("heading", { level: 1, name: "Оформление" })).toBeVisible();
    await page.goBack();
    await expect(rootHeading(page)).toBeVisible();
  });

  test("вкладка «Я» из раздела — на «Я»; ушёл на другую вкладку — история не держит раздел", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await openSettings(page);
    await settingsRow(page, "Занятия").click();
    await expect(page.getByRole("heading", { level: 1, name: "Занятия" })).toBeVisible();
    await tab(page).click();
    await expect(page.getByRole("heading", { level: 1, name: "Евгений" })).toBeVisible();
    await expect.poll(() => depth(page)).toBe(0);

    await openSettings(page);
    await settingsRow(page, "Озвучка").click();
    await goTab(page, "Слова");
    await expect(page.getByRole("heading", { level: 1, name: "Слова" })).toBeVisible();
    await expect.poll(() => depth(page)).toBe(0);
    await openSettings(page); // снова — со списка, а не с последнего раздела
    await expect(page.locator(".srow")).toHaveCount(4);
  });
});

test("десктоп: список слева, раздел справа — первый открыт сразу, выбор не пишется в историю", async ({ page }) => {
  test.skip(!wide(page), "на телефоне раздел — отдельная страница");
  await setup(page);
  await openHome(page);
  await openSettings(page);
  const detail = page.locator(".set-detail");
  await expect(detail.getByRole("heading", { level: 2, name: "Занятия" })).toBeVisible();
  await expect(settingsRow(page, "Занятия")).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "12", exact: true })).toHaveAttribute("aria-pressed", "true");

  const len = await page.evaluate(() => history.length);
  await settingsRow(page, "Озвучка").click();
  await expect(detail.getByRole("heading", { level: 2, name: "Озвучка" })).toBeVisible();
  await expect(detail.getByRole("radiogroup", { name: "Голос озвучки" }).locator('[role=radio][aria-checked="true"]')).toContainText("Heart");
  await expect(settingsRow(page, "Озвучка")).toHaveAttribute("aria-current", "true");
  await expect(settingsRow(page, "Занятия")).not.toHaveAttribute("aria-current", "true");
  await expect(rootHeading(page)).toBeVisible(); // список остаётся на месте
  await expect(page.locator(".srow")).toHaveCount(4);
  expect(await page.evaluate(() => history.length)).toBe(len);
  expect(await depth(page)).toBe(1); // только запись самих «Настроек»

  // список и раздел — рядом
  const nav = await page.locator(".set-nav").boundingBox();
  const box = await detail.boundingBox();
  expect(box!.x).toBeGreaterThan(nav!.x + nav!.width - 1);
  expect(Math.abs(box!.y - nav!.y)).toBeLessThan(40);
});
