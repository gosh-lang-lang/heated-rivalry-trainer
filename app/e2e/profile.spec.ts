import { expect, test, type Page } from "@playwright/test";
import { addDays, DECK, goTab, openHome, readState, seasonState, setup, state, TODAY, ws } from "./helpers";

/**
 * Аватарка в «Я» (core/avatar.ts, screens/avatar.tsx) и значки в шапке: 🔥 — панель серии (screens/streak.tsx),
 * карточки — переход в «Коллекцию».
 */

const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });
const avatarSetting = async (page: Page) => ((await readState(page)) as unknown as { settings: { avatar: string } }).settings.avatar;

test.describe("аватарка", () => {
  test("по умолчанию буква; выбрать игрока — сразу в шапке, запоминается после перезагрузки", async ({ page }) => {
    await setup(page, { state: seasonState() });
    await openHome(page);
    await goTab(page, "Я");
    const ava = page.getByRole("button", { name: /^Аватарка: / });
    await expect(ava).toHaveAccessibleName("Аватарка: буква имени. Сменить");
    await expect(ava.locator(".ava")).toHaveText("Е");

    await ava.click();
    const s = sheet(page, "Аватарка");
    await expect(s).toBeVisible();
    await expect(s.getByRole("button", { name: "Буква Е" })).toHaveAttribute("aria-pressed", "true");
    await s.getByRole("button", { name: "Илья Розанов" }).click();
    await expect(s.getByRole("button", { name: "Илья Розанов" })).toHaveAttribute("aria-pressed", "true");
    await expect(s).toContainText("Сейчас: Илья Розанов");
    await s.getByRole("button", { name: "Готово" }).click();
    await expect(s).toBeHidden();
    await expect(ava).toHaveAccessibleName("Аватарка: Илья Розанов. Сменить");
    await expect(ava.locator(".ava svg")).toBeVisible();
    expect(await avatarSetting(page)).toBe("player:black");

    await page.reload();
    await goTab(page, "Я");
    await expect(page.getByRole("button", { name: "Аватарка: Илья Розанов. Сменить" })).toBeVisible();
  });

  test("свитер: цвет и номер (без номера — буква имени)", async ({ page }) => {
    await setup(page, { state: seasonState() });
    await openHome(page);
    await goTab(page, "Я");
    await page.getByRole("button", { name: /^Аватарка: / }).click();
    const s = sheet(page, "Аватарка");
    await s.getByRole("button", { name: "Свитер: красный" }).click();
    expect(await avatarSetting(page)).toBe("jersey:red:");
    await expect(s.locator(".av-now .ava text")).toHaveText("Е");

    await s.getByRole("textbox", { name: /Номер на свитере/ }).fill("07");
    await expect(s.getByRole("textbox", { name: /Номер на свитере/ })).toHaveValue("7");
    await expect(s.locator(".av-now .ava text")).toHaveText("7");
    expect(await avatarSetting(page)).toBe("jersey:red:7");
    await expect(s).toContainText("Сейчас: свитер, красный, № 7");

    await page.keyboard.press("Escape");
    await expect(s).toBeHidden();
    await expect(page.getByRole("button", { name: "Аватарка: свитер, красный, № 7. Сменить" })).toBeVisible();
  });

  test("номер на свитере не теряется: 43 → Шейн (и после перезагрузки) → снова свитер с 43", async ({ page }) => {
    await setup(page, { state: seasonState() });
    await openHome(page);
    await goTab(page, "Я");
    await page.getByRole("button", { name: /^Аватарка: / }).click();
    let s = sheet(page, "Аватарка");
    const num = () => s.getByRole("textbox", { name: /Номер на свитере/ });
    await s.getByRole("button", { name: "Свитер: красный" }).click();
    await num().fill("43");
    await expect(s).toContainText("Сейчас: свитер, красный, № 43");

    await s.getByRole("button", { name: "Шейн Холландер" }).click();
    await expect(s).toContainText("Сейчас: Шейн Холландер");
    await expect(num()).toHaveValue("43"); // поле не очищается
    await expect(s.getByRole("list", { name: "Свитер" }).locator(".ava text").first()).toHaveText("43"); // свитеры — с номером, не с буквой
    expect(await avatarSetting(page)).toBe("player:red");

    // номер хранится в настройках, а не в панели: и после перезагрузки
    await page.reload();
    await goTab(page, "Я");
    await page.getByRole("button", { name: "Аватарка: Шейн Холландер. Сменить" }).click();
    s = sheet(page, "Аватарка");
    await expect(num()).toHaveValue("43");
    await s.getByRole("button", { name: "Свитер: красный" }).click();
    await expect(s).toContainText("Сейчас: свитер, красный, № 43");
    await expect(s.locator(".av-now .ava text")).toHaveText("43");
    expect(await avatarSetting(page)).toBe("jersey:red:43");
  });

  test("из коллекции: открыты сюжеты полученных карточек, остальные — под замком", async ({ page }) => {
    await setup(page, { state: seasonState() }); // карточки 1–4: Шейн, Илья, Раздевалка, «Вояжёры»
    await openHome(page);
    await goTab(page, "Я");
    await page.getByRole("button", { name: /^Аватарка: / }).click();
    const s = sheet(page, "Аватарка");
    const coll = s.getByRole("list", { name: "Из коллекции" });
    await expect(coll.getByRole("button")).toHaveCount(8);
    await expect(coll.getByRole("button", { name: "Раздевалка" })).toBeEnabled();
    await expect(coll.getByRole("button", { name: "«Вояжёры»" })).toBeEnabled();
    await expect(coll.getByRole("button", { name: "Арена — откроется с карточкой № 07" })).toBeDisabled();
    await expect(coll.getByRole("button", { name: "Финал сезона — откроется с карточкой № 10" })).toBeDisabled();
    await coll.getByRole("button", { name: "Раздевалка" }).click();
    expect(await avatarSetting(page)).toBe("card:room");
    await s.getByRole("button", { name: "Закрыть" }).click();
    await expect(page.getByRole("button", { name: "Аватарка: Раздевалка. Сменить" })).toBeVisible();
  });
});

test.describe("значки в шапке", () => {
  test("«Путь»: 🔥 — панель серии с неделей и рекордом; карточки — в коллекцию", async ({ page }) => {
    await setup(page, { state: seasonState() }); // уроки 16–20 ноября каждый день: серия 5, сегодня часть 1 есть
    await openHome(page);
    await goTab(page, "Путь");
    // сегодня пройдена только часть 1: огонь налит наполовину, в подписи — «одна часть из двух»
    const chip = page.getByRole("button", { name: "5 дней подряд — подробнее о серии. Сегодня пройдена одна часть из двух" });
    await expect(chip.locator("svg.sf")).toHaveAttribute("data-parts", "1");
    await chip.click();
    const s = sheet(page, "Серия дней");
    await expect(s.locator(".sk-hero")).toContainText("5дней подряд");
    await expect(s.locator(".sk-hero svg.sf")).toHaveAttribute("data-parts", "1");
    await expect(s).toContainText("Одна часть есть — день засчитан, серия 5. Пройди вторую — урок закроется");
    const week = s.getByRole("list", { name: "Последние 7 дней" });
    await expect(week.locator("li")).toHaveCount(7);
    await expect(week.locator("li.on")).toHaveCount(5);
    await expect(week.locator("li").last()).toHaveAccessibleName("сегодня — одна часть урока");
    await expect(week.locator("li").nth(-2)).toHaveAccessibleName(/— урок закрыт$/);
    await expect(week.locator("li").last().locator("svg.sf")).toHaveAttribute("data-parts", "1");
    await expect(week.locator("li").nth(-2).locator("svg.sf")).toHaveAttribute("data-parts", "2");
    await expect(week.locator("li").first()).toHaveAccessibleName("суббота, 14 ноября — без урока");
    await expect(s.locator(".sk-stats")).toContainText("5дней — рекорд");
    await expect(s.locator(".sk-stats")).toContainText("2до достижения «7 дней»");
    await page.keyboard.press("Escape");
    await expect(s).toBeHidden();

    await page.getByRole("button", { name: "Карточек: 4 из 10 — открыть коллекцию" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Коллекция" })).toBeVisible();
  });

  const res = (h: string) => ({ score: 30, total: 32, mins: 14, newN: 6, at: `${TODAY}T${h}:00:00.000Z` });
  const learned = () => Object.fromEntries(DECK.words.slice(0, 6).map((w) => [w.id, ws({ intro: TODAY, due: addDays(TODAY, 1) })]));

  test("огонь серии: пройдена часть 1 — налит наполовину, в панели кнопка «Начать часть 2»", async ({ page }) => {
    await setup(page, { state: state({ srs: learned(), days: { [addDays(TODAY, -1)]: { morning: res("06") }, [TODAY]: { morning: res("06") } } }) });
    await openHome(page);
    const chip = page.locator("button.chip");
    await expect(chip).toHaveAccessibleName("2 дня подряд — подробнее о серии. Сегодня пройдена одна часть из двух");
    await expect(chip.locator("svg.sf")).toHaveAttribute("data-parts", "1");
    await expect(chip.locator("svg.sf")).not.toHaveClass(/sf-ignite/);
    await chip.click();
    const s = sheet(page, "Серия дней");
    await s.getByRole("button", { name: "Начать часть 2 — применяем" }).click();
    await expect(s).toBeHidden();
    await expect(page.locator(".sect h2")).toHaveText("Проверка без подсказок");
  });

  test("огонь серии: обе части — горит целиком и «зажигается» один раз в день", async ({ page }) => {
    await setup(page, { state: state({ srs: learned(), days: { [TODAY]: { morning: res("06"), evening: res("09") } } }) });
    await openHome(page);
    const chip = page.locator("button.chip");
    await expect(chip).toHaveAccessibleName("1 день подряд — подробнее о серии. Сегодня урок закрыт");
    await expect(chip.locator("svg.sf")).toHaveAttribute("data-parts", "2");
    await expect(chip.locator("svg.sf")).toHaveClass(/sf-ignite/);
    await page.reload();
    await expect(page.locator("button.chip svg.sf")).toHaveAttribute("data-parts", "2");
    await expect(page.locator("button.chip svg.sf")).not.toHaveClass(/sf-ignite/);
    await page.locator("button.chip").click();
    const s = sheet(page, "Серия дней");
    await expect(s).toContainText("Урок закрыт — обе части пройдены. Завтра серия станет 2.");
    await expect(s.getByRole("button", { name: /Начать часть 2/ })).toHaveCount(0);
  });

  test("окно поверх страницы держит фокус; Esc закрывает только его, фокус — обратно на значок", async ({ page, isMobile }) => {
    test.skip(isMobile, "клавиатура — на десктопе");
    await setup(page, { state: seasonState() });
    await openHome(page);
    await goTab(page, "Путь");
    const chip = page.getByRole("button", { name: "5 дней подряд — подробнее о серии" });
    await chip.click();
    const s = sheet(page, "Серия дней");
    await expect(s).toBeVisible();
    await expect(page.locator("#root")).toHaveJSProperty("inert", true);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      // фокус — в окне (или в интерфейсе браузера после последней кнопки, как у нативного <dialog>), но не на странице под ним
      expect(await page.evaluate(() => !!document.activeElement?.closest("#root")), `Tab №${i + 1}`).toBe(false);
    }
    await page.keyboard.press("Escape");
    await expect(s).toBeHidden();
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    await expect(chip).toBeFocused();
    await expect(page.getByRole("region", { name: "Текущий урок" })).toBeVisible(); // пузырь урока остался
  });

  test("главная: серия 0 — подсказка, как начать; «Достижения серии» ведут в «Я»", async ({ page }) => {
    await setup(page);
    await openHome(page);
    const chip = page.getByRole("button", { name: "0 дней подряд — подробнее о серии" });
    await expect(chip).toHaveClass(/zero/);
    await chip.click();
    const s = sheet(page, "Серия дней");
    await expect(s).toContainText("Серии пока нет. Пройди часть 1 урока сегодня");
    await expect(s.getByRole("list", { name: "Последние 7 дней" }).locator("li.on")).toHaveCount(0);
    await s.getByRole("button", { name: "Достижения серии" }).click();
    await expect(s).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "Достижения" })).toBeVisible();
  });
});
