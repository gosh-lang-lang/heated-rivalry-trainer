import { expect, test } from "@playwright/test";
import { afterMorning, DECK, goTab, openHome, openSettings, setup, state, TODAY, ws } from "./helpers";

test.describe("главная", () => {
  test("новый пользователь: приветствие, 62 новых слова, серия 0", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Доброе утро, Евгений");
    await expect(page.locator(".chip")).toContainText("0 дней");
    await expect(page.locator(".legend")).toContainText("Новые62");
    await expect(page.getByText("всего слов: 62")).toBeVisible();
  });

  test("настройка «новых слов за утро» сохраняется", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await openSettings(page);
    await page.getByRole("button", { name: "18", exact: true }).click();
    await expect(page.getByRole("button", { name: "18", exact: true })).toHaveAttribute("aria-pressed", "true");
    await goTab(page, "Главная");
    await expect(page.getByText("18 новых · ~15 мин")).toBeVisible();
    await page.reload();
    await expect(page.getByText("18 новых · ~15 мин")).toBeVisible();
  });
});

test.describe("словарь", () => {
  test("3 партии, 62 слова, раскрытие показывает пример и дату повторения", async ({ page }) => {
    const w = DECK.words[0];
    await setup(page, { state: state({ srs: { [w.id]: ws({ lvl: 3, due: "2026-11-27" }) } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Словарь" }).first().click();
    for (const b of DECK.batches) await expect(page.getByRole("heading", { name: b.title, exact: true })).toBeVisible();
    await expect(page.locator(".wrow")).toHaveCount(62);
    const row = page.locator(".wrow").filter({ hasText: w.ru }).first();
    await row.locator("summary").click();
    await expect(row).toContainText(w.example);
    await expect(row).toContainText("Следующее повторение: 27.11.2026");
    await expect(row.locator(".dots i.f")).toHaveCount(3);
  });
});

test.describe("статистика", () => {
  test("серия, частые ошибки и свои предложения", async ({ page }) => {
    const [a, b] = DECK.words;
    const r = { score: 9, total: 10, mins: 12, newN: 6, at: "x" };
    await setup(page, {
      state: state({
        srs: { [a.id]: ws({ wrong: 5 }), [b.id]: ws({ wrong: 2, lvl: 5 }) },
        days: { "2026-11-18": { morning: r }, "2026-11-19": { morning: r, evening: r } },
        sent: [
          { at: "1", words: ["endure"], text: "I endure it.", ok: false, corrected: "I endured it.", comment: "Прошедшее время." },
          { at: "2", words: ["novel"], text: "I read a novel.", pending: true },
        ],
      }),
    });
    await openHome(page);
    await page.getByRole("button", { name: "Статистика" }).first().click();
    await expect(page.locator(".stats3")).toContainText("2дня подряд");
    await expect(page.locator(".stats3")).toContainText("1выучено");
    await expect(page.locator(".wrow").first()).toContainText(a.en);
    await expect(page.locator(".wrow").first()).toContainText("5×");
    await expect(page.locator(".hrow")).toHaveCount(14);
    await expect(page.locator(".sline").filter({ hasText: "I endured it." })).toContainText("Прошедшее время.");
    await expect(page.locator(".sline").filter({ hasText: "I read a novel." })).toContainText("Ждёт проверки");
  });
});

test.describe("перенос данных", () => {
  test("экспорт отдаёт текущий прогресс JSON-ом", async ({ page }) => {
    await setup(page, { state: afterMorning(6) });
    await openHome(page);
    await openSettings(page);
    await page.getByRole("button", { name: "Экспорт" }).click();
    const json = JSON.parse(await page.locator(".xio textarea").inputValue());
    expect(Object.keys(json.srs)).toHaveLength(6);
    expect(json.days[TODAY].morning.newN).toBe(6);
    expect(json.app).toBe("hr2");
  });

  test("импорт экспорта из прототипа восстанавливает уровни, серию и настройки", async ({ page }) => {
    await setup(page);
    await openHome(page);
    const proto = {
      upd: 1763650000000,
      settings: { newPerDay: 18 },
      srs: { sacred: { lvl: 5, due: "2026-12-20", intro: "2026-11-01", right: 9, wrong: 1 } },
      days: { "2026-11-18": { morning: { score: 30, total: 35, mins: 14, newN: 12, at: "x" } }, "2026-11-19": { evening: { score: 10, total: 12, mins: 13, newN: 0, at: "x" } } },
      sent: [],
      exportedAt: "x",
      app: "hr2",
    };
    await openSettings(page);
    await page.getByRole("button", { name: "Импорт" }).click();
    await page.locator(".xio textarea").fill(JSON.stringify(proto));
    await page.getByRole("button", { name: "Заменить мой прогресс" }).click();
    await expect(page.getByText("Прогресс загружен")).toBeVisible();
    await expect(page.getByRole("button", { name: "18", exact: true })).toHaveAttribute("aria-pressed", "true");
    await goTab(page, "Главная");
    await expect(page.locator(".chip")).toContainText("2 дня");
    await expect(page.locator(".legend")).toContainText("Выучено1");
  });

  test("импорт мусора — понятная ошибка, прогресс не тронут", async ({ page }) => {
    await setup(page, { state: afterMorning(3) });
    await openHome(page);
    await openSettings(page);
    await page.getByRole("button", { name: "Импорт" }).click();
    await page.locator(".xio textarea").fill('{"foo": 1}');
    await page.getByRole("button", { name: "Заменить мой прогресс" }).click();
    await expect(page.getByText(/Не получилось: .*srs/)).toBeVisible();
    await goTab(page, "Главная");
    await expect(page.locator(".legend")).toContainText("Учу3");
  });
});

test.describe("вёрстка", () => {
  for (const name of ["главная", "занятие", "словарь", "статистика", "настройки"]) {
    test(`без горизонтальной прокрутки: ${name}`, async ({ page }) => {
      await setup(page, { state: afterMorning(12) });
      await openHome(page);
      if (name === "занятие") {
        await page.getByRole("button", { name: "Начать вечернее" }).click();
        await page.getByRole("button", { name: "Поехали" }).click();
      }
      if (name === "словарь") await page.getByRole("button", { name: "Словарь" }).first().click();
      if (name === "статистика") await page.getByRole("button", { name: "Статистика" }).first().click();
      if (name === "настройки") await openSettings(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("нет ошибок в консоли за утреннее занятие", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать утреннее" }).click();
    const { playSession } = await import("./helpers");
    await playSession(page);
    expect(errors).toEqual([]);
  });
});

test.describe("навигация", () => {
  test("разделы открываются из меню, на главной нет настроек", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await expect(page.locator(".vsel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Экспорт" })).toHaveCount(0);
    for (const [tab, h1] of [["Словарь", "Словарь"], ["Статистика", "Статистика"], ["Настройки", "Настройки"]] as const) {
      await goTab(page, tab);
      await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
    }
    await goTab(page, "Главная");
    await expect(page.getByRole("button", { name: "Начать утреннее" })).toBeVisible();
  });

  test("во время занятия меню скрыто", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await page.getByRole("button", { name: "Начать утреннее" }).click();
    await expect(page.getByRole("navigation", { name: "Разделы" })).toHaveCount(0);
  });
});
