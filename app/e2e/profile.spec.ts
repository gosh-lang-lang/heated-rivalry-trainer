import { expect, test, type Page } from "@playwright/test";
import { goTab, openHome, readState, seasonState, setup } from "./helpers";

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
    await page.getByRole("button", { name: "5 дней подряд — подробнее о серии" }).click();
    const s = sheet(page, "Серия дней");
    await expect(s.locator(".sk-hero")).toContainText("5дней подряд");
    await expect(s).toContainText("Сегодня урок есть — серия продолжается. Завтра станет 6.");
    const week = s.getByRole("list", { name: "Последние 7 дней" });
    await expect(week.locator("li")).toHaveCount(7);
    await expect(week.locator("li.on")).toHaveCount(5);
    await expect(week.locator("li").last()).toHaveAccessibleName("сегодня — был урок");
    await expect(week.locator("li").first()).toHaveAccessibleName("суббота, 14 ноября — без урока");
    await expect(s.locator(".sk-stats")).toContainText("5дней — рекорд");
    await expect(s.locator(".sk-stats")).toContainText("2до достижения «7 дней»");
    await page.keyboard.press("Escape");
    await expect(s).toBeHidden();

    await page.getByRole("button", { name: "Карточек: 4 из 10 — открыть коллекцию" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Коллекция" })).toBeVisible();
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
