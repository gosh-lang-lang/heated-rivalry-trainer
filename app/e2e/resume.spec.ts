import { expect, test, type Page } from "@playwright/test";
import { DECK, goTab, openHome, readState, setup, state } from "./helpers";

/*
 * Незаконченная часть урока (core/session.ts saveRun / resumable / restoreSession): ✕ или закрытое приложение
 * посреди части — на главной и в «Пути» «Продолжить · n из N» и «Начать заново». Жалоба 21.11.2026: вышел посреди
 * урока — вернуться нельзя, часть начинается сначала («Новые слова», «Поехали»).
 */

const byEn = (en: string) => DECK.words.find((w) => w.en === en)!;
const bar = (page: Page) => page.locator(".bar-n");
/** Номер шага и всего шагов из «7 / 38». */
const pos = async (page: Page) => (await bar(page).textContent())!.split("/").map((x) => Number(x.trim()));

/** Ответить на «Выбери перевод» верно и проверить. Возвращает слово. */
const answerPick = async (page: Page) => {
  await expect(page.locator(".lbl")).toHaveText("Выбери перевод");
  const w = byEn((await page.locator(".word h2").textContent())!.trim());
  await page.locator(".opts .tile").filter({ hasText: w.ru }).click();
  await page.locator("#chk").click();
  await expect(page.locator("#next")).toBeVisible();
  return w;
};

test.describe("продолжить незаконченную часть", () => {
  test("вышел посреди части 1 → «Продолжить» на главной и в «Пути» → то же задание → «Начать заново» не засчитывает ответы второй раз", async ({ page }) => {
    const log = await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    await page.getByRole("button", { name: "Поехали" }).click();
    for (let i = 0; i < 6; i++) await page.locator("#next").click(); // знакомство с 6 словами

    // шаг 8: «Выбери перевод» — верно, «Дальше»; шаг 9 — запомнили задание и вышли, не отвечая
    const [, total] = await pos(page);
    const first = await answerPick(page);
    await page.locator("#next").click();
    await expect(bar(page)).toHaveText(`9 / ${total}`);
    const word9 = await page.locator(".word h2").textContent();
    const opts9 = await page.locator(".opts .tile").allTextContents();
    await page.getByRole("button", { name: "Выйти" }).click();

    // главная: продолжить с 9-го, а не начать заново
    const cont = page.getByRole("button", { name: `Продолжить · 9 из ${total}` });
    await expect(cont).toBeVisible();
    await expect(page.getByRole("button", { name: "Начать часть 1" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Начать заново" })).toBeVisible();
    const right1 = (await readState(page)).srs[first.id].right;

    // закрыл приложение — сохранённое осталось (и ушло на сервер)
    await openHome(page);
    await expect(cont).toBeVisible();
    await expect.poll(() => (log.server.state as { run?: { i: number } } | null)?.run?.i).toBe(8);

    // «Путь» — та же кнопка
    await goTab(page, "Путь");
    const cur = page.getByRole("region", { name: "Текущий урок" });
    await expect(cur.getByRole("button", { name: `Продолжить · 9 из ${total}` })).toBeVisible();
    await expect(cur.getByRole("button", { name: "Начать заново" })).toBeVisible();
    await cur.getByRole("button", { name: `Продолжить · 9 из ${total}` }).click();

    // то же задание: то же слово и те же варианты в том же порядке
    await expect(bar(page)).toHaveText(`9 / ${total}`);
    await expect(page.locator(".word h2")).toHaveText(word9!);
    expect(await page.locator(".opts .tile").allTextContents()).toEqual(opts9);

    // ответил и вышел, не нажав «Дальше», — ответ засчитан, продолжим со следующего
    await answerPick(page);
    await page.getByRole("button", { name: "Выйти" }).click();
    await goTab(page, "Главная");
    await expect(page.getByRole("button", { name: `Продолжить · 10 из ${total}` })).toBeVisible();

    // «Начать заново»: снова «Новые слова», с первого шага
    await page.getByRole("button", { name: "Начать заново" }).click();
    await expect(page.locator(".sect h2")).toHaveText("Новые слова");
    await expect(bar(page)).toHaveText(`1 / ${total}`);
    await page.getByRole("button", { name: "Поехали" }).click();
    for (let i = 0; i < 6; i++) await page.locator("#next").click();
    const again = await answerPick(page);
    expect(again.id).toBe(first.id);
    // второй проход ответ не засчитывает: уровень и счётчики слова — как после первого ответа
    expect((await readState(page)).srs[first.id].right).toBe(right1);

    // вышел сразу после «Начать заново» — на главной новое место
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page.getByRole("button", { name: `Продолжить · 9 из ${total}` })).toBeVisible();
  });

  test("начатая вчера часть сегодня не продолжается — часть 1 начинается заново", async ({ page }) => {
    const yday = "2026-11-19";
    const steps = [
      { k: 0, t: "section", pic: "🏒", title: "Новые слова", sub: "" },
      { k: 1, t: "intro", w: DECK.words[0].id },
      { k: 2, t: "pick", w: DECK.words[0].id },
    ];
    const run = { kind: "morning", day: yday, date: yday, seed: 1, steps, i: 2, graded: 0, right: 0, revGraded: 0, revRight: 0, first: [], newIds: [], written: {}, t0: 0 };
    await setup(page, { state: state({ settings: { newPerDay: 6 }, run, runAt: 1 }) });
    await openHome(page);
    await expect(page.getByRole("button", { name: /^Продолжить/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    await expect(page.locator(".sect h2")).toHaveText("Новые слова");
    expect((await pos(page))[1]).toBeGreaterThan(3); // новый план, а не вчерашние 3 шага
  });
});
