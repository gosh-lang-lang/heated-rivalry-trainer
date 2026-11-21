import { expect, test } from "@playwright/test";
import { addDays, afterMorning, DECK, openHome, playSession, readState, setup, state, TODAY, ws } from "./helpers";

test.describe("часть 1 урока — учим", () => {
  test("первый день: 12 новых слов, 38 заданий, всё верно → 100%", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await expect(page.getByText("12 новых · ~15 мин")).toBeVisible();
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    await expect(page.locator(".sect h2")).toHaveText("Новые слова · блок 1");

    const r = await playSession(page);
    expect(r.steps.filter((s) => s === "Новое слово")).toHaveLength(12);

    await expect(page.locator(".score")).toHaveText("100%");
    await expect(page.getByText("38 из 38 с первой попытки")).toBeVisible();
    const st = await readState(page);
    expect(st.days[TODAY].morning).toMatchObject({ score: 38, total: 38, newN: 12 });
    // ходовые — повтор завтра, редкие — послезавтра
    for (const w of DECK.words.slice(0, 12))
      expect(st.srs[w.id]).toMatchObject({ lvl: 1, intro: TODAY, due: addDays(TODAY, w.rare ? 2 : 1) });

    await page.getByRole("button", { name: "На главную" }).click();
    await expect(page.getByText("Готово · 38/38")).toBeVisible();
    await expect(page.locator(".chip")).toContainText("1 день");
  });

  test("ошибка возвращается в конец и не портит счёт второй попыткой", async ({ page }) => {
    await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    const r = await playSession(page, { mistakes: 1 });
    expect(r.wrong).toEqual(["Выбери перевод"]);
    // повтор того же задания появился в конце
    expect(r.steps.filter((s) => s === "Выбери перевод")).toHaveLength(7);
    await expect(page.getByText("18 из 19 с первой попытки")).toBeVisible();
    await expect(page.locator(".score")).toHaveText("95%");
  });

  test("неверный ответ: красная панель с правильным вариантом", async ({ page }) => {
    await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    await page.getByRole("button", { name: "Поехали" }).click();
    for (let i = 0; i < 6; i++) await page.locator("#next").click();
    const en = (await page.locator(".word h2").textContent())!.trim();
    const w = DECK.words.find((x) => x.en === en)!;
    await page.locator(".opts .tile").filter({ hasNotText: w.ru }).first().click();
    await page.locator("#chk").click();
    await expect(page.locator(".foot.badf")).toBeVisible();
    await expect(page.locator(".fb")).toContainText(`${w.en} — ${w.ru}`);
    await expect(page.locator(".tile.good")).toContainText(w.ru);
  });

  test("впиши: опечатка в длинном слове засчитывается, «Не помню» показывает ответ", async ({ page }) => {
    const srs = Object.fromEntries(DECK.words.slice(0, 2).map((w) => [w.id, ws({ lvl: 3, due: TODAY, intro: "2026-11-01" })]));
    await setup(page, { state: state({ srs, settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    await expect(page.locator(".sect h2")).toHaveText("Разминка: повторение");
    await page.getByRole("button", { name: "Поехали" }).click();

    // первое задание: опечатка
    const hint1 = (await page.locator(".hint").textContent())!.split(" · ")[0];
    const w1 = DECK.words.find((x) => x.exampleRu === hint1)!;
    expect(w1.blank.length).toBeGreaterThan(5);
    await page.locator("input.inp").fill(w1.blank.slice(0, -1));
    await page.keyboard.press("Enter");
    await expect(page.locator(".fb")).toContainText("Почти — опечатка");
    await page.keyboard.press("Enter");

    // второе: «Не помню»
    const hint2 = (await page.locator(".hint").textContent())!.split(" · ")[0];
    const w2 = DECK.words.find((x) => x.exampleRu === hint2)!;
    await page.getByRole("button", { name: "Не помню" }).click();
    await expect(page.locator(".gap")).toHaveText(w2.blank);
    await expect(page.locator(".foot.badf")).toBeVisible();

    const st = await readState(page);
    expect(st.srs[w1.id]).toMatchObject({ lvl: 4, due: addDays(TODAY, 14) });
    expect(st.srs[w2.id]).toMatchObject({ lvl: 1, due: addDays(TODAY, 1) });
  });

  test("разминка идёт перед новыми словами и повышает уровень", async ({ page }) => {
    const srs = Object.fromEntries(DECK.words.slice(0, 3).map((w) => [w.id, ws({ lvl: 1, due: TODAY, intro: "2026-11-19" })]));
    await setup(page, { state: state({ srs, settings: { newPerDay: 6 } }) });
    await openHome(page);
    await expect(page.getByText("3 на повторение · 6 новых · ~15 мин")).toBeVisible();
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    const r = await playSession(page);
    expect(r.steps[0]).toBe("Разминка: повторение");
    expect(r.steps.slice(1, 4).every((s) => s.startsWith("Повторение · "))).toBe(true);
    const st = await readState(page);
    for (const w of DECK.words.slice(0, 3)) expect(st.srs[w.id]).toMatchObject({ lvl: 2, due: addDays(TODAY, 3) });
  });

  test("«Ещё 6 новых» после части 1 — только новые слова", async ({ page }) => {
    await setup(page, { state: afterMorning(12) });
    await openHome(page);
    await page.getByRole("button", { name: "Ещё 6 новых слов" }).click();
    const r = await playSession(page);
    expect(r.steps.some((s) => s.startsWith("Повторение"))).toBe(false);
    expect(r.steps.filter((s) => s === "Новое слово")).toHaveLength(6);
    const st = await readState(page);
    expect(st.days[TODAY].extra).toHaveLength(1);
    expect(DECK.words.slice(12, 18).every((w) => st.srs[w.id]?.intro === TODAY)).toBe(true);
  });

  test("выход посреди занятия сохраняет уже пройденное — и место, откуда продолжить", async ({ page }) => {
    await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    await page.getByRole("button", { name: "Поехали" }).click();
    await page.locator("#next").click();
    await page.locator("#next").click();
    await page.getByRole("button", { name: "Выйти" }).click();
    // «Поехали» → слово 1 → слово 2 → на экране шаг 4 (слово 3): с него и продолжим (e2e/resume.spec.ts)
    await expect(page.getByRole("button", { name: /^Продолжить · 4 из \d+$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Начать часть 1" })).toHaveCount(0);
    const st = await readState(page);
    // показанное слово считается знакомым: Поехали → слово 1 → слово 2 → слово 3 на экране
    expect(Object.values(st.srs).filter((s) => s.intro === TODAY)).toHaveLength(3);
    expect(st.days[TODAY]?.morning).toBeUndefined();
  });

  test("клавиатура: 1–4 выбирают вариант, Enter проверяет и листает", async ({ page, isMobile }) => {
    test.skip(isMobile, "физическая клавиатура — только на десктопе");
    await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    for (let i = 0; i < 7; i++) await page.keyboard.press("Enter");
    await expect(page.locator(".lbl")).toHaveText("Выбери перевод");
    await page.keyboard.press("2");
    await expect(page.locator(".opts .tile").nth(1)).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    await expect(page.locator(".fb")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".fb")).toHaveCount(0);
  });

  test("скринридер: ответ «верно/неверно» — в живой области, задание — в полосе прогресса", async ({ page }) => {
    await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    const bar = page.getByRole("progressbar", { name: "Задание" });
    await expect(bar).toHaveAttribute("aria-valuetext", /^1 из \d+$/);
    for (let i = 0; i < 7; i++) await page.locator("#next").click();
    await expect(page.locator(".lbl")).toHaveText("Выбери перевод");
    await expect(bar).toHaveAttribute("aria-valuetext", /^8 из \d+$/);
    const live = page.getByRole("status");
    await expect(live).toHaveText(""); // область есть до ответа — скринридер прочтёт изменение, а не новый блок
    await page.locator(".opts .tile").first().click();
    await page.locator("#chk").click();
    await expect(live).toHaveText(/^(Верно|Неверно)\. .+/);
  });

  test("клавиатура: Enter на другой кнопке нажимает её, а не проверяет ответ", async ({ page, isMobile }) => {
    test.skip(isMobile, "физическая клавиатура — только на десктопе");
    await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    for (let i = 0; i < 7; i++) await page.keyboard.press("Enter");
    await expect(page.locator(".lbl")).toHaveText("Выбери перевод");
    await page.keyboard.press("2");
    await page.getByRole("button", { name: "Выйти" }).focus();
    await page.keyboard.press("Enter");
    // вышли из урока, ответ не проверен и не засчитан
    await expect(page.getByRole("button", { name: /^Продолжить/ })).toBeVisible();
    await expect(page.locator(".fb")).toHaveCount(0);
  });
});
