import { expect, test, type Page } from "@playwright/test";
import { DECK, iosSound, openHome, setup, sound, state, ttsKey } from "./helpers";

/*
 * Озвучка по правилам iOS: звук начинается только после касания (e2e/helpers.ts iosSound).
 * Жалоба 21.11.2026 (iPhone, прод падал по памяти, /api/tts отвечал 502/504): «озвучка была всего в 2 случаях сама,
 * нажатие на кнопку ничего не даёт». Запасной системный голос стартовал после сетевой ошибки — не в касании —
 * и iOS его глушил; зависший сервер держал кнопку в «загрузке» без звука.
 */

const W0 = DECK.words[0],
  W1 = DECK.words[1];
const key = (text: string) => `${ttsKey(text, "af_heart")}.mp3`;
const played = async (page: Page, text: string) => (await sound(page)).played.filter((u) => u.includes(key(text))).length;
const spoken = async (page: Page, text: string) => (await sound(page)).spoken.filter((t) => t === text).length;
const speaker = (page: Page, text: string) => page.locator(`.spk[data-say="${text}"]`).first();

const startLesson = async (page: Page) => {
  await openHome(page);
  await page.getByRole("button", { name: "Начать часть 1" }).click();
  await page.getByRole("button", { name: "Поехали" }).click();
  await expect(page.locator(".word h2")).toHaveText(W0.en);
};

test.describe("озвучка на iPhone", () => {
  test("сервер работает: новое слово звучит само на каждом шаге и по кнопке", async ({ page }) => {
    await iosSound(page);
    await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await startLesson(page);
    await expect.poll(() => played(page, W0.en)).toBe(1);

    await page.locator("#next").click();
    await expect(page.locator(".word h2")).toHaveText(W1.en);
    await expect.poll(() => played(page, W1.en)).toBe(1);

    await speaker(page, W1.en).click();
    await expect.poll(() => played(page, W1.en)).toBe(2);
    expect((await sound(page)).spoken).toEqual([]); // системный голос не понадобился
  });

  test("сервер недоступен: слово говорит системный голос — само и по кнопке", async ({ page }) => {
    await iosSound(page);
    await setup(page, { tts: "down", state: state({ settings: { newPerDay: 6 } }) });
    await startLesson(page);
    // раньше: системный голос запускался после ошибки сети, не в касании, — iOS его глушил
    await expect.poll(() => spoken(page, W0.en)).toBe(1);

    await page.locator("#next").click();
    await expect.poll(() => spoken(page, W1.en)).toBe(1);
    await speaker(page, W1.en).click();
    await expect.poll(() => spoken(page, W1.en)).toBe(2);
  });

  test("сервер завис: через несколько секунд — системный голос, кнопка не крутится вечно", async ({ page }) => {
    test.slow();
    await iosSound(page);
    await setup(page, { tts: "hang", state: state({ settings: { newPerDay: 6 } }) });
    await startLesson(page);
    await expect(speaker(page, W0.en)).toHaveAttribute("aria-busy", "true"); // ждём сервер
    await expect.poll(() => spoken(page, W0.en), { timeout: 12_000 }).toBe(1);
    await expect(speaker(page, W0.en)).toHaveAttribute("aria-busy", "false");

    // сервер не отвечал — полминуты не ждём его: кнопка говорит сразу
    await speaker(page, W0.en).click();
    await expect.poll(() => spoken(page, W0.en), { timeout: 1_000 }).toBe(2);
  });
});
