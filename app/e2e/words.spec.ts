import { expect, test, type Page } from "@playwright/test";
import { addDays, DECK, goTab, openHome, playSession, readState, setup, state, TODAY, ws } from "./helpers";

/**
 * «Слова» — два уровня, как «Настройки»: список уроков (кольцо «знакомо N из M»), «Впереди» и «Трудные»;
 * урок — своя страница (на десктопе — справа от списка), строка раскрывается: пример, звук, уровень и повтор.
 */

const Y = addDays(TODAY, -1);
const part1 = (day: string) => ({ morning: { score: 30, total: 38, mins: 15, newN: 12, at: `${day}T06:00:00.000Z` } });
/** Вчера — урок 1 (слова 0–2, выучены, у первого 5 ошибок), сегодня — урок 2 (слова 3–4). */
const twoLessons = () =>
  state({
    days: { [Y]: part1(Y), [TODAY]: part1(TODAY) },
    srs: {
      ...Object.fromEntries(DECK.words.slice(0, 3).map((w, i) => [w.id, ws({ intro: Y, lvl: 5, due: "2026-11-26", wrong: i === 0 ? 5 : 0 })])),
      [DECK.words[3].id]: ws({ intro: TODAY, lvl: 3, due: addDays(TODAY, 1) }),
      [DECK.words[4].id]: ws({ intro: TODAY }),
    },
  });

const phone = (page: Page) => (page.viewportSize()?.width ?? 0) < 900;
const lessonRow = (page: Page, name: string) => page.locator(".lrow").filter({ hasText: name });
const list = (page: Page, name: string) => page.getByRole("list", { name, exact: true });

test.describe("слова по урокам", () => {
  test("список уроков: от нового к старому, «знакомо N из M»; «Впереди» и «Трудные» — отдельно", async ({ page }) => {
    await setup(page, { state: twoLessons() });
    await openHome(page);
    await goTab(page, "Слова");
    await expect(page.getByRole("heading", { level: 1, name: "Слова" })).toBeVisible();
    await expect(page.locator(".whd-sub").first()).toHaveText(new RegExp(`^${DECK.words.length} слов\\S* · знакомо 4$`));
    await expect(page.getByRole("group", { name: "Уроки" }).locator(".s-t")).toHaveText(["Урок 2сегодня", "Урок 1"]);
    await expect(lessonRow(page, "Урок 2")).toContainText("20 ноября · знакомо 1 из 2");
    await expect(lessonRow(page, "Урок 1")).toContainText("19 ноября · знакомо 3 из 3");
    await expect(lessonRow(page, "Впереди")).toContainText(`придут в следующих уроках${DECK.words.length - 5}`);
    await expect(lessonRow(page, "Трудные")).toContainText("4+ ошибок1");
  });

  test("урок: СЛОВО · ПЕРЕВОД · УРОВЕНЬ · ПОВТОР и рупор; раскрытие — пример со звуком", async ({ page }) => {
    await setup(page, { state: twoLessons() });
    await openHome(page);
    await goTab(page, "Слова");
    await lessonRow(page, "Урок 2").click();
    if (phone(page)) {
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Урок 2");
      await expect(page.locator(".whd-sub")).toHaveText("пт, 20 ноября · 2 слова");
    } else {
      await expect(page.getByRole("heading", { level: 2, name: /Урок 2/ })).toBeVisible();
      await expect(lessonRow(page, "Урок 2")).toHaveAttribute("aria-current", "true");
    }
    const rows = list(page, "Урок 2").locator(".wrow");
    await expect(rows).toHaveCount(2);
    const w = DECK.words[3];
    const row = rows.filter({ hasText: w.ru });
    await expect(row.locator(".wlv")).toHaveAttribute("aria-label", "Знакомо · уровень 3 из 6");
    await expect(row.locator(".wlv i.f")).toHaveCount(3);
    await expect(row.locator(".wdue")).toHaveText("завтра");
    await expect(rows.filter({ hasText: DECK.words[4].ru }).locator(".wdue")).toHaveText("завтра");
    // рупор в строке: звучит — нажат, строку не раскрывает
    const spk = row.locator(`summary .spk[data-say="${w.en}"]`);
    await expect(spk).toBeVisible();
    await spk.click();
    await expect(row.locator(".det")).toBeHidden();
    await row.locator(".wru").click();
    await expect(row).toContainText(w.example);
    await expect(row).toContainText(w.exampleRu);
    await expect(row).toContainText("Знакомо · уровень 3 из 6");
    await expect(row.locator(`.det .spk[data-say="${w.example}"]`)).toBeVisible();

    // «Трудные»: слово с 4+ ошибками и их число
    if (phone(page)) await page.getByRole("button", { name: "Назад: Слова" }).click();
    await lessonRow(page, "Трудные").click();
    const hard = list(page, "Трудные").locator(".wrow");
    await expect(hard).toHaveCount(1);
    await hard.locator(".wru").click();
    await expect(hard.locator("summary")).toContainText("трудное");
    await expect(hard).toContainText("ошибок: 5");
  });

  test("телефон: урок — своя страница, «назад» браузера и «‹ Слова» возвращают к списку", async ({ page }) => {
    test.skip(!phone(page), "на десктопе урок открывается справа от списка");
    await setup(page, { state: twoLessons() });
    await openHome(page);
    await goTab(page, "Слова");
    await lessonRow(page, "Урок 1").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Урок 1");
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Слова" })).toBeVisible();
    await lessonRow(page, "Впереди").click();
    await expect(list(page, "Впереди").locator(".wrow")).toHaveCount(DECK.words.length - 5);
    await page.getByRole("button", { name: "Назад: Слова" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Слова" })).toBeVisible();
  });

  test("поиск сверху — по слову и переводу во всех словах", async ({ page }) => {
    await setup(page, { state: twoLessons() });
    await openHome(page);
    await goTab(page, "Слова");
    const find = page.getByRole("searchbox", { name: "Найти слово или перевод" });
    await find.fill(DECK.words[10].ru);
    const found = list(page, "Найденные слова").locator(".wrow");
    await expect(found.first()).toContainText(DECK.words[10].en);
    await find.fill("zzzz");
    await expect(page.getByText("Ничего не нашлось")).toBeVisible();
    await find.fill("");
    await expect(lessonRow(page, "Урок 1")).toBeVisible();
  });

  test("«Пройти все слова»: по заданию на слово урока, уровни и дни не меняются, итог — обратно к уроку", async ({ page }) => {
    const st = twoLessons();
    await setup(page, { state: st });
    await openHome(page);
    await goTab(page, "Слова");
    await lessonRow(page, "Урок 1").click();
    await page.getByRole("button", { name: "Пройти все слова · 3" }).click();
    await expect(page.locator(".sect h2")).toHaveText("Урок 1");
    const before = await readState(page);
    const rep = await playSession(page, { mistakes: 1 });
    expect(rep.steps.filter((k) => k !== "Урок 1").length).toBe(4); // 3 слова + ошибка вернулась в конец
    await expect(page.getByRole("heading", { name: "Все слова пройдены" })).toBeVisible();
    await expect(page.getByText("Тренировка: уровни и даты повтора не изменились.")).toBeVisible();
    const after = await readState(page);
    expect(after.srs).toEqual(before.srs);
    expect(after.days).toEqual(before.days);
    await page.getByRole("button", { name: "К словам" }).click();
    await expect(list(page, "Урок 1").locator(".wrow")).toHaveCount(3);
  });

  test("«Впереди» — без «Пройти все слова»: эти слова вводит урок", async ({ page }) => {
    await setup(page, { state: twoLessons() });
    await openHome(page);
    await goTab(page, "Слова");
    await lessonRow(page, "Впереди").click();
    await expect(list(page, "Впереди").locator(".wrow").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Пройти все слова/ })).toHaveCount(0);
  });
});
