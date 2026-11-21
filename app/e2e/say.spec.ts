import { expect, test, type Page } from "@playwright/test";
import { openHome, readState, say, setPron, setup, state, TODAY } from "./helpers";

/*
 * Задания «Скажи» с оценкой произношения. Микрофон — подделка (тон, e2e/helpers.ts setup → mic),
 * сервер оценки (/api/pron) — мок с ответом по заказу (setPron). Настоящую модель проверяет server/pron-worker.test.ts.
 */

/** Часть 1 с одним блоком из 6 слов — до первого «Скажи слово». */
const toFirstSay = async (page: Page) => {
  await openHome(page);
  await page.getByRole("button", { name: "Начать часть 1" }).click();
  for (let i = 0; i < 60 && !(await page.locator(".lbl", { hasText: /^Скажи/ }).isVisible()); i++) {
    const lbl = ((await page.locator(".lbl").first().textContent({ timeout: 300 }).catch(() => "")) ?? "").trim();
    if (lbl === "Найди пары") {
      // пары не важны: проходим, перебирая
      const left = page.locator(".pairs .col").nth(0).locator(".tile");
      const right = page.locator(".pairs .col").nth(1).locator(".tile");
      for (let l = 0; l < (await left.count()); l++)
        for (let r = 0; r < (await right.count()); r++) {
          if ((await left.nth(l).isDisabled()) || (await right.nth(r).isDisabled())) continue;
          await left.nth(l).click();
          await right.nth(r).click();
          if (await left.nth(l).isDisabled()) break;
          await page.waitForTimeout(650);
        }
    } else if (await page.locator(".opts .tile").first().isVisible()) {
      await page.locator(".opts .tile").first().click();
      await page.locator("#chk").click();
    }
    await page.locator("#next").click();
  }
  await expect(page.locator(".lbl")).toHaveText("Скажи слово");
};

const six = { state: state({ settings: { newPerDay: 6 } }) };

test.describe("говорение с оценкой произношения", () => {
  test("микрофон спрашивается один раз — при первом «Поехали», слово оценено и окрашено", async ({ page }) => {
    const log = await setup(page, six);
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    expect(await page.evaluate(() => (window as unknown as { __micCalls: number }).__micCalls)).toBe(0);
    await page.getByRole("button", { name: "Поехали" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __micCalls: number }).__micCalls)).toBe(1);

    await toFirstSay(page);
    const word = (await page.locator(".say-en").textContent())!.trim();
    await say(page);
    expect(log.pron.at(-1)!.text).toBe(word);
    await expect(page.locator(".fb h3")).toHaveText("Отлично! 92%");
    await expect(page.locator(".pw.good")).toHaveText(word);
    await page.locator("#next").click();

    // следующее «Скажи слово» — без нового вопроса о микрофоне
    await expect(page.locator(".lbl")).toHaveText("Скажи слово");
    await say(page);
    expect(await page.evaluate(() => (window as unknown as { __micCalls: number }).__micCalls)).toBe(1);
  });

  test("ошибка: красное слово, подсказка по звуку; «Ещё раз» — в счёт идёт лучшая попытка", async ({ page }) => {
    await setup(page, six);
    await toFirstSay(page);
    setPron(page, "bad", "good");
    await say(page);
    await expect(page.locator(".fb h3")).toHaveText("40% — давай ещё раз");
    await expect(page.locator(".pw.weak")).toHaveCount(1);
    await expect(page.locator(".say-hints")).toContainText("/θ/ прозвучал как /s/ — кончик языка между зубами");
    await expect(page.locator(".say-status")).toHaveText("Попытка 1 из 3");

    await say(page, "#again");
    await expect(page.locator(".fb h3")).toHaveText("Отлично! 92%");
    await expect(page.locator("#again")).toHaveCount(0); // попытки больше не нужны
    await page.locator("#next").click();
    await expect(page.locator(".lbl")).toHaveText("Скажи слово");
  });

  test("три неудачные попытки — «потренируем в другой раз», дальше только «Дальше»", async ({ page }) => {
    await setup(page, six);
    await toFirstSay(page);
    setPron(page, "bad", "bad", "bad");
    await say(page);
    await say(page, "#again");
    await say(page, "#again");
    await expect(page.locator(".fb h3")).toHaveText("40% — потренируем в другой раз");
    await expect(page.locator("#again")).toHaveCount(0);
    await expect(page.locator("#rec")).toHaveCount(0);
  });

  test("тишина — «не расслышал», попытка не считается", async ({ page }) => {
    await setup(page, six);
    await toFirstSay(page);
    setPron(page, "silent");
    await say(page);
    await expect(page.locator(".say-status")).toHaveText("Не расслышал — скажи погромче, ближе к телефону");
    await expect(page.locator(".fb")).toHaveCount(0);
    await say(page);
    await expect(page.locator(".fb h3")).toHaveText("Отлично! 92%");
  });

  test("запись заканчивается сама после паузы", async ({ page }) => {
    const log = await setup(page, six);
    await toFirstSay(page);
    await page.locator("#rec").click();
    await expect(page.locator("#rec")).toHaveAttribute("data-phase", "rec");
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as unknown as { __micQuiet: (q: boolean) => void }).__micQuiet(true)); // замолчал
    await expect(page.locator(".fb h3")).toHaveText("Отлично! 92%", { timeout: 5000 });
    expect(log.pron).toHaveLength(1);
  });

  test("«Не могу сейчас говорить» убирает всё говорение до конца занятия", async ({ page }) => {
    await setup(page, six);
    await toFirstSay(page);
    const before = await page.locator(".bar-n").textContent();
    await page.getByRole("button", { name: "Не могу сейчас говорить" }).click();
    await expect(page.locator(".lbl")).toHaveText("Впиши пропущенное");
    const total = (s: string | null) => Number(s!.split("/")[1]);
    // блок из 6 слов: 3 «Скажи слово» + 1 «Скажи фразу» — все убраны
    expect(total(await page.locator(".bar-n").textContent())).toBe(total(before) - 4);
  });

  test("нет доступа к микрофону — объяснение и «Пропустить говорение»", async ({ page }) => {
    await setup(page, { ...six, mic: "denied" });
    await toFirstSay(page);
    await expect(page.locator(".say-off")).toContainText("Нет доступа к микрофону");
    await page.getByRole("button", { name: "Пропустить говорение" }).click();
    await expect(page.locator(".lbl")).toHaveText("Впиши пропущенное");
  });

  test("сервер оценки недоступен — «Дальше» без оценки, счёт занятия не меняется", async ({ page }) => {
    await setup(page, { ...six, pron: "down" });
    await toFirstSay(page);
    await say(page);
    await expect(page.locator(".say-off")).toContainText("Оценка произношения сейчас недоступна");
    await page.locator("#next").click();
    await expect(page.locator(".lbl")).toHaveText("Скажи слово");
    // уровень слова от говорения не меняется
    const st = await readState(page);
    expect(Object.values(st.srs).every((w) => w.lvl === 1 && w.intro === TODAY)).toBe(true);
  });
});
