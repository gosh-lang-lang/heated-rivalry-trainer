import { expect, test } from "@playwright/test";
import { addDays, DECK, goTab, openHome, openSettingsSection, playSession, readState, setup, state, TODAY, ws } from "./helpers";

const result = (day: string, p2 = false) => ({ score: 1, total: 2, mins: 3, newN: 0, at: `${day}T${p2 ? "15" : "06"}:00:00Z` });
const daysOf = (n: number, missed: number[] = [], offset = 0) => Object.fromEntries(Array.from({ length: n }, (_, i) => {
  const day = addDays(TODAY, i - n + offset);
  return [day, { morning: result(day), ...(!missed.includes(i + 1) ? { evening: result(day, true) } : {}) }];
}));
const reviewWords = (day: string) => Object.fromEntries(DECK.words.slice(0, 2).map((w) => [w.id, ws({ intro: day, due: addDays(TODAY, 1), lvl: 3 })]));
const current = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Текущий урок" });

for (const n of [10, 20]) test(`урок ${n} — две части, отдельный финал; после пропуска части 2 сезон продолжается с ${n + 1}`, async ({ page }) => {
  const days = { ...daysOf(n - 1, [2]), [TODAY]: { morning: result(TODAY) } };
  await setup(page, { state: state({ days, srs: reviewWords(addDays(TODAY, -(n - 1))), settings: { newPerDay: 6 } }) });
  await openHome(page);
  await goTab(page, "Путь");
  const final = page.getByRole("button", { name: `Урок ${n} · сейчас`, exact: true });
  await expect(final.locator("b")).toHaveText(String(n));
  await expect(final.locator(".node-cup")).toHaveText("🏆");
  await expect(current(page)).toContainText(`Урок ${n} · сегодня`);
  await current(page).getByRole("button", { name: "Начать часть 2" }).click();
  await playSession(page);
  await expect(page.getByRole("heading", { name: `Урок ${n} пройден!` })).toBeVisible();
  await expect(page.locator(".rw-final")).toHaveText(`🏆 Финал сезона ${n / 10} · дополнительная награда`);
  await expect(page.locator(".rw-new")).toContainText("№ 10 из 10");
  const saved = await readState(page);
  expect(saved.days[TODAY].evening).toMatchObject({ cardSubject: n, newN: 0 });
  await page.getByRole("button", { name: "В коллекцию" }).click();
  const grid = page.getByRole("list", { name: `Сезон ${n / 10}`, exact: true });
  await expect(grid.getByRole("listitem").last().locator(".tc")).toHaveAttribute("data-card", String(n - 1));
  await goTab(page, "Путь");
  await expect(page.getByRole("button", { name: `Урок ${n + 1} · завтра`, exact: true }).locator("b")).toHaveText(String(n + 1));
  await expect(page.getByRole("button", { name: `Урок ${n + 10} · закрыт`, exact: true }).locator("b")).toHaveText(String(n + 10));
  await goTab(page, "Слова");
  await page.getByRole("button", { name: new RegExp(`^Урок ${n}(сегодня| )`) }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`^Урок ${n}( сегодня)?$`) })).toBeVisible();
  await expect(page.getByText(/Только повторение/).last()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Пройти все слова/ })).toHaveCount(0);
});

test("пропущенная часть 2 видна в истории; прежний сюжет и слова карточки сохранены после загрузки", async ({ page }) => {
  const days = daysOf(5, [2]);
  await setup(page, { state: state({ days, srs: reviewWords(addDays(TODAY, -3)) }) });
  await openHome(page);
  await goTab(page, "Путь");
  await page.getByRole("button", { name: "Урок 2 · часть 2 пропущена", exact: true }).click();
  const record = page.getByRole("region", { name: "Урок 2", exact: true });
  await expect(record).toContainText("Часть 2 пропущена. Карточка не получена.");
  await page.getByRole("button", { name: "Урок 2 · часть 2 пропущена", exact: true }).click();
  await page.getByRole("button", { name: "Урок 3 · пройден", exact: true }).click();
  const done = page.getByRole("region", { name: "Урок 3", exact: true });
  await expect(done).toContainText("Илья Розанов"); // в старой модели вторая награда = Илья
  await done.getByRole("button", { name: "Карточка", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Урок 3");
  await dialog.getByRole("button", { name: "Перевернуть", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Слова урока 3" })).toContainText(DECK.words[0].en);
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("Илья Розанов");
  await page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).click();
  await goTab(page, "Я");
  await page.getByRole("button", { name: "Коллекция: 4 из 10" }).click();
  await expect(page.getByRole("button", { name: "№ 03: Илья Розанов", exact: true })).toBeVisible();
});

test("пропущенный финальный урок не удерживает сезон; архив не обещает полную коллекцию", async ({ page }) => {
  await setup(page, { state: state({ days: daysOf(10, [10], -3) }) });
  await openHome(page);
  await goTab(page, "Путь");
  await expect(page.getByRole("button", { name: "Урок 11 · сейчас", exact: true })).toBeVisible();
  await goTab(page, "Я");
  await page.getByRole("button", { name: "Коллекция: 0 из 10" }).click();
  await page.getByRole("button", { name: "Сезон 1 9/10", exact: true }).click();
  await expect(page.locator(".cprog")).toContainText("Сезон 1 · получено 9 из 10 карточек");
});

test("сезон 101 появляется автоматически, шаблонные награды открываются без иллюстраций", async ({ page }) => {
  await setup(page, { state: state({ days: daysOf(1001) }) });
  await page.route("**/cards/*", (route) => route.fulfill({ status: 404, body: "" }));
  await openHome(page);
  await goTab(page, "Путь");
  await expect(page.getByRole("button", { name: "Урок 1002 · сейчас", exact: true }).locator("b")).toHaveText("1002");
  await expect(page.getByRole("button", { name: "Урок 1010 · закрыт", exact: true }).locator("b")).toHaveText("1010");
  await goTab(page, "Я");
  await page.getByRole("button", { name: "Коллекция: 1 из 10" }).click();
  await page.getByRole("button", { name: "№ 01: Сезон 101 · карточка №01", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Урок 1001");
  await expect(dialog.locator(".tc-art svg")).toBeVisible();
});


test("перенесённый финал остаётся в сезоне 1 и открывает урок 11 после завершения", async ({ page }) => {
  const days = daysOf(10, [10]);
  await setup(page, { state: state({ days, srs: reviewWords(addDays(TODAY, -1)) }) });
  await openHome(page);
  await goTab(page, "Путь");
  await expect(current(page)).toContainText("Урок 10 · часть 2 осталась");
  await current(page).getByRole("button", { name: "Начать часть 2", exact: true }).click();
  await playSession(page);
  await expect(page.locator(".rw-final")).toContainText("Финал сезона 1");
  expect((await readState(page)).days[addDays(TODAY, -1)].evening).toMatchObject({ cardSubject: 10 });
  await page.getByRole("button", { name: "На главную", exact: true }).click();
  await goTab(page, "Путь");
  await expect(current(page)).toContainText("Урок 11 · сегодня");
  await expect(page.getByRole("button", { name: "Урок 11 · сейчас", exact: true }).locator("b")).toHaveText("11");
});

test("смена темпа с 6 на 12 при высокой точности меняет будущий план и сохраняет историю", async ({ page }) => {
  const days = daysOf(5, [2]);
  days[addDays(TODAY, -1)].morning = { ...result(addDays(TODAY, -1)), revScore: 30, revTotal: 30 } as typeof days[string]["morning"];
  await setup(page, { state: state({ days, srs: reviewWords(addDays(TODAY, -5)), settings: { newPerDay: 6 } }) });
  await openHome(page);
  const before = await readState(page);
  await openSettingsSection(page, "Занятия");
  await page.getByRole("button", { name: "12", exact: true }).click();
  const after = await readState(page);
  expect(after.days).toEqual(before.days);
  expect(after.srs).toEqual(before.srs);
  await goTab(page, "Путь");
  await expect(current(page)).toContainText("12 новых слов");
  await expect(page.getByRole("button", { name: "Урок 6 · сейчас", exact: true })).toBeVisible();
});

test("новые слова закончились: обе части урока только с повторениями дают карточку без новых слов", async ({ page }) => {
  const intro = addDays(TODAY, -3);
  const srs = Object.fromEntries(DECK.words.map((w, i) => [w.id, ws({ intro, due: i ? addDays(TODAY, 10) : TODAY, lvl: 3 })]));
  await setup(page, { state: state({ days: daysOf(20), srs }) });
  await openHome(page);
  await goTab(page, "Путь");
  await expect(current(page)).toContainText("повторение");
  await current(page).getByRole("button", { name: "Начать часть 1", exact: true }).click();
  const morning = await playSession(page);
  expect(morning.steps).not.toContain("Новое слово");
  expect((await readState(page)).days[TODAY].morning).toMatchObject({ newN: 0 });
  await page.getByRole("button", { name: "На главную", exact: true }).click();
  await goTab(page, "Путь");
  await current(page).getByRole("button", { name: "Начать часть 2", exact: true }).click();
  await playSession(page);
  await expect(page.getByRole("heading", { name: "Урок 21 пройден!", exact: true })).toBeVisible();
  await expect(page.locator(".reward .stats3")).toContainText("0новых слов");
  await page.getByRole("button", { name: "В коллекцию", exact: true }).click();
  await expect(page.getByRole("list", { name: "Сезон 3", exact: true }).getByRole("listitem").first()).toContainText("Урок 21");
});
