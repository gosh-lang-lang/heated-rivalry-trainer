import { expect, test, type Page } from "@playwright/test";
import { addDays, afterMorning, DECK, goTab, openHome, playSession, readState, seasonState, setup, state, tabButton, TODAY, ws } from "./helpers";

/**
 * «Путь» (screens/Path.tsx), карточки-награды (core/cards.ts, screens/cards.tsx, CardViewer.tsx, Collection.tsx, Result.tsx)
 * и «Я» (screens/Me.tsx, core/achievements.ts).
 */

const node = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });
/** «Пузырь» текущего урока. */
const current = (page: Page) => page.getByRole("region", { name: "Текущий урок" });
const YDAY = addDays(TODAY, -1);

test.describe("путь", () => {
  test("сезон: уроки 1–4 пройдены, 5 — сейчас, 6–10 закрыты; у текущего обе части и совет, как на главной", async ({ page }) => {
    await setup(page, { state: seasonState() });
    await openHome(page);
    await goTab(page, "Путь");
    await expect(page.getByRole("heading", { level: 1, name: "Путь" })).toBeVisible();
    await expect(page.getByText("Сезон 1 · урок 5 из 10")).toBeVisible();
    await expect(tabButton(page, "Путь")).toHaveAttribute("aria-current", "page");

    for (const n of [1, 2, 3, 4]) await expect(node(page, `Урок ${n} · пройден`)).toBeEnabled();
    await expect(node(page, "Урок 5 · сейчас")).toBeVisible();
    for (const n of [6, 7, 8, 9, 10]) await expect(node(page, `Урок ${n} · закрыт`)).toBeDisabled();
    await expect(page.locator(".node.final")).toHaveCount(1); // 10-й — кубок, «Финал сезона»
    await expect(page.locator(".nlabel.gold")).toHaveText("Финал сезона");

    // карточки у дорожки: 4 полученные, следующая — «после части 2»
    await expect(page.locator(".cmark.got")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Карточка № 01: Шейн Холландер" })).toBeVisible();
    await expect(page.locator(".cmark.nextc .cm-tag")).toHaveText("после части 2");
    await expect(page.locator(".me-sk")).toHaveCount(1); // игрок у текущего урока

    const cur = current(page);
    await expect(cur).toContainText("Урок 5 · сегодня");
    await expect(cur).toContainText("12 новых слов"); // на телефоне — «· 2 части по ~15 мин», на десктопе — коротко
    await expect(cur.locator(".parts li").nth(0)).toContainText("Часть 1 — учимГотово · 34 из 38 · 16 мин");
    await expect(cur.locator(".parts li").nth(1)).toContainText("Лучше после 10:30 · можно и сейчас");

    // кнопка начинает именно часть 2
    await cur.getByRole("button", { name: "Начать часть 2" }).click();
    await expect(page.locator(".sect h2")).toHaveText("Проверка без подсказок");
    await expect(page.getByRole("navigation", { name: "Разделы" })).toHaveCount(0);
  });

  test("новый пользователь: урок 1, кнопка начинает часть 1", async ({ page }) => {
    await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await goTab(page, "Путь");
    await expect(node(page, "Урок 1 · сейчас")).toBeVisible();
    await expect(page.locator(".cmark.got")).toHaveCount(0);
    const cur = current(page);
    await expect(cur).toContainText("Урок 1 · сегодня");
    await expect(cur.locator(".parts li").nth(1)).toContainText("Сначала пройди часть 1");
    await expect(cur.getByRole("button", { name: "Начать часть 2" })).toHaveCount(0);
    await cur.getByRole("button", { name: "Начать часть 1" }).click();
    await playSession(page);
    expect((await readState(page)).days[TODAY].morning).toBeTruthy();
    expect((await readState(page)).days[TODAY].evening).toBeUndefined();
  });

  test("перенос: вчерашняя часть 2 — главная, часть 1 нового урока — второстепенно", async ({ page }) => {
    const srs = Object.fromEntries(DECK.words.slice(0, 6).map((w) => [w.id, ws({ intro: YDAY, due: TODAY })]));
    const morning = { score: 30, total: 38, mins: 14, newN: 6, at: new Date(`${YDAY}T21:30:00+03:00`).toISOString() };
    await setup(page, { state: state({ srs, days: { [YDAY]: { morning } } }) });
    await openHome(page);
    await goTab(page, "Путь");
    const cur = current(page);
    await expect(cur).toContainText("Урок 1 · часть 2 осталась");
    await expect(cur.locator(".parts li").nth(1)).toContainText("Осталась с прошлого раза — начни с неё");
    await expect(cur.getByRole("button", { name: "Урок 2 · начать часть 1" })).toBeVisible();
    await cur.getByRole("button", { name: "Начать часть 2" }).click();
    await playSession(page);
    // итог — в день урока, урок 1 пройден — карточка №01
    await expect(page.getByRole("heading", { name: "Урок 1 пройден!" })).toBeVisible();
    expect((await readState(page)).days[YDAY].evening).toBeTruthy();
  });

  test("пройденный урок: дата, слова, точность, карточка; «Карточка» и «Слова урока»", async ({ page }) => {
    await setup(page, { state: seasonState() });
    await openHome(page);
    await goTab(page, "Путь");
    await node(page, "Урок 1 · пройден").click();
    const pop = page.getByRole("region", { name: "Урок 1" });
    await expect(pop).toContainText("Урок 1 · пройден");
    await expect(pop).toContainText("пн, 16 ноября · 12 слов · 92% верно");
    await expect(pop).toContainText("Карточка № 01 · Герой");
    await expect(pop).toContainText("Шейн Холландер");

    await pop.getByRole("button", { name: "Карточка" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toContainText("Получена 16 ноября · за урок 1");
    await dlg.getByRole("button", { name: "Закрыть" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Путь" })).toBeVisible();

    // пузырь урока остался открытым
    await page.getByRole("region", { name: "Урок 1" }).getByRole("button", { name: "Слова урока" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Словарь" })).toBeVisible();
    await expect(tabButton(page, "Слова")).toHaveAttribute("aria-current", "page");
  });

  test("ночью и в каждом оформлении путь рисуется", async ({ page }) => {
    await setup(page, { state: state({ ...seasonState(), settings: { newPerDay: 12, theme: "dark", look: "classic" }, settingsAt: { theme: 5, look: 5 } }) });
    await openHome(page);
    await goTab(page, "Путь");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-glass", "classic");
    await expect(page.locator(".rink-svg")).toBeVisible();
    const ice = await page.locator(".rink-svg .ice").evaluate((el) => getComputedStyle(el).fill);
    expect(ice).toBe("rgb(13, 23, 40)"); // тёмный лёд
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("карточки-награды", () => {
  test("часть 2 закрыла урок: карточка влетает на итоге и появляется в коллекции", async ({ page }) => {
    await setup(page, { state: afterMorning(12) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 2" }).click();
    await playSession(page);

    await expect(page.locator(".rw-kick")).toHaveText("Урок 1 · часть 2 готова");
    await expect(page.getByRole("heading", { name: "Урок 1 пройден!" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Карточка № 01: Шейн Холландер" })).toBeVisible();
    await expect(page.locator(".rw-new")).toHaveText("Новая карточка · № 01 из 10");
    // влетает рубашкой вверх и переворачивается
    await expect(page.locator(".reward")).toHaveAttribute("data-phase", "done");
    await expect(page.locator(".reward .stats3")).toContainText("12новых слов");

    await page.getByRole("button", { name: "В коллекцию" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Коллекция" })).toBeVisible();
    await expect(page.locator(".coll-head .ph-meta")).toHaveText("1 из 10");
    await expect(page.getByRole("button", { name: "Сезон 1 1/10" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Сезон 2 — закрыт" })).toBeDisabled();
    const grid = page.getByRole("list", { name: "Сезон 1" });
    await expect(grid.getByRole("listitem")).toHaveCount(10);
    await expect(grid.getByRole("listitem").first()).toContainText("Шейн ХолландерУрок 1 · Герой");
    await expect(grid.getByRole("listitem", { name: "№ 02: следующая" })).toContainText("Завтраурок 2");
    await expect(grid.getByRole("listitem").last()).toContainText("Финал сезона");
    await expect(tabButton(page, "Я")).toHaveAttribute("aria-current", "page");

    // «назад» из коллекции — туда, откуда пришли (итог в историю не пишется)
    await page.getByRole("button", { name: "Назад: Я" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Евгений" })).toBeVisible();
  });

  test("при «уменьшить движение» карточка сразу лицом, без полёта", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setup(page, { state: afterMorning(6) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 2" }).click();
    await playSession(page);
    await expect(page.locator(".reward")).toHaveAttribute("data-phase", "done");
    await expect(page.locator(".rw-face.rear")).toBeHidden();
  });

  test("часть 1 карточки не даёт", async ({ page }) => {
    await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    await playSession(page);
    await expect(page.getByRole("heading", { name: "Урок 1 · часть 1 готова" })).toBeVisible();
    await expect(page.locator(".reward")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "В коллекцию" })).toHaveCount(0);
  });

  test("карточка во весь экран: оборот — слова урока, нажатие озвучивает; листание; «назад» закрывает", async ({ page }) => {
    const log = await setup(page, { state: seasonState() });
    await openHome(page);
    await goTab(page, "Я");
    await page.getByRole("button", { name: "Коллекция: 4 из 10" }).click();
    await page.getByRole("button", { name: "№ 02: Илья Розанов" }).click();

    const dlg = page.getByRole("dialog", { name: "Карточка № 02: Илья Розанов" });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText("№ 02 из 10");
    await expect(dlg.locator(".cm-cap")).toHaveText("Получена 17 ноября · за урок 2");

    await dlg.getByRole("button", { name: "Перевернуть" }).click();
    await expect(dlg.locator(".cm-cap")).toHaveText("Слова урока 2 — нажми, чтобы услышать");
    const words = dlg.getByRole("list", { name: "Слова урока 2" }).getByRole("button");
    await expect(words).toHaveCount(12);
    const lesson2 = DECK.words.slice(12, 24);
    await expect(words.first()).toHaveAttribute("data-say", lesson2[0].en);
    await expect(dlg.locator(".tb-stats")).toContainText("92%верно12слов30мин");
    await words.nth(1).click();
    await expect.poll(() => log.requests.map((r) => r.text)).toContain(lesson2[1].en);

    // листание — с лица следующей
    await dlg.getByRole("button", { name: "Лицевая сторона" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Следующая карточка" }).click();
    await expect(page.getByRole("dialog", { name: "Карточка № 03: Раздевалка" })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("dialog", { name: "Карточка № 02: Илья Розанов" })).toBeVisible();

    // «назад» браузера (жест в Safari) закрывает карточку — под ней коллекция
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Коллекция" })).toBeVisible();
    // Esc тоже закрывает
    await page.getByRole("button", { name: "№ 01: Шейн Холландер" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("«Я»", () => {
  test("шапка, веер коллекции, достижения баннерами и статистика", async ({ page }) => {
    await setup(page, { state: state({ ...seasonState(), sent: [{ at: new Date(`${TODAY}T08:00:00+03:00`).toISOString(), words: ["endure"], text: "I endure it.", ok: true }] }) });
    await openHome(page);
    await goTab(page, "Я");
    await expect(page.getByRole("heading", { level: 1, name: "Евгений" })).toBeVisible();
    await expect(page.locator(".mehead")).toContainText("учится с 16 ноября · урок 5");
    await expect(page.getByRole("button", { name: "Коллекция: 4 из 10" })).toContainText("Сезон 1 · следующая карточка — после части 2 урока 5");
    await expect(page.locator(".mecoll .fan .tc")).toHaveCount(5);

    await expect(page.locator(".sec-title").filter({ hasText: "Достижения" })).toContainText("4 из 12");
    const ach = (row: string) => page.getByRole("list", { name: row }).getByRole("listitem");
    await expect(ach("Серия дней")).toHaveCount(3);
    await expect(ach("Серия дней").nth(0)).toHaveAccessibleName("7 дней подряд: 5 из 7");
    await expect(ach("Слова").nth(0)).toHaveAccessibleName("50 слов: получено 20 ноября");
    await expect(ach("Слова").nth(1)).toHaveAccessibleName("100 слов: 60 из 100");
    await expect(ach("Уроки").nth(0)).toHaveAccessibleName("1 первый урок: получено 16 ноября");
    await expect(ach("Уроки").nth(1)).toHaveAccessibleName("10 уроков: 4 из 10");
    await expect(ach("Особые").nth(0)).toHaveAccessibleName("1-я карточка: получено 16 ноября");
    await expect(ach("Особые").nth(1)).toHaveAccessibleName("своя фраза: получено 20 ноября");
    await expect(ach("Особые").nth(2)).toHaveAccessibleName("сезон 1: 4 из 10");
    await expect(page.locator(".ban.got")).toHaveCount(4);

    // статистика — как была на своей вкладке
    await expect(page.getByRole("heading", { level: 2, name: "Статистика" })).toBeVisible();
    await expect(page.locator(".stats3")).toContainText("5дней подряд");
    await expect(page.getByRole("heading", { name: "Верно на повторениях" })).toBeVisible();
    await expect(page.locator(".hrow")).toHaveCount(14);
    await expect(page.locator(".sline")).toContainText("I endure it.");
  });
});
