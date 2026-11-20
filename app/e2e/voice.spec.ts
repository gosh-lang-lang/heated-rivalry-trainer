import { expect, test } from "@playwright/test";
import { DECK, goTab, openHome, openSettings, readState, setup, state } from "./helpers";

const SAMPLE = "Their animosity was intense. He gritted his teeth and kept playing.";

test.describe("голос", () => {
  test("по умолчанию — Heart; список: 2 группы, 10 голосов", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await openSettings(page);
    const sel = page.locator(".vsel");
    await expect(sel).toContainText("Heart");
    await expect(sel).toHaveAttribute("aria-expanded", "false");
    await sel.click();
    await expect(sel).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("radiogroup")).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(10);
    await expect(page.getByText("Американский акцент")).toBeVisible();
    await expect(page.getByText("Британский акцент")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Heart/ })).toHaveAttribute("aria-checked", "true");
  });

  test("▶ проигрывает образец выбранным голосом и не меняет выбор", async ({ page }) => {
    const log = await setup(page);
    await openHome(page);
    await openSettings(page);
    await page.locator(".vsel").click();
    await page.getByRole("button", { name: "Послушать George" }).click();
    await expect.poll(() => log.requests.at(-1)).toEqual({ text: SAMPLE, voice: "bm_george" });
    await expect(page.getByRole("radio", { name: /Heart/ })).toHaveAttribute("aria-checked", "true");
  });

  test("выбор голоса: сохраняется, список сворачивается, озвучка идёт новым голосом", async ({ page }) => {
    const log = await setup(page);
    await openHome(page);
    await openSettings(page);
    await page.locator(".vsel").click();
    await page.getByRole("radio", { name: /Emma/ }).click();
    await expect(page.locator(".vlist")).toHaveCount(0);
    await expect(page.locator(".vsel")).toContainText("Emma");
    // выбор — в личных настройках: в кэше устройства и на сервере (оттуда — на остальные устройства)
    expect((await readState(page)).settings.voice).toBe("bf_emma");
    await expect.poll(() => (log.server.state as { settings?: { voice: string } } | null)?.settings?.voice).toBe("bf_emma");

    await page.reload();
    await openSettings(page);
    await expect(page.locator(".vsel")).toContainText("Emma");

    // занятие говорит выбранным голосом
    await goTab(page, "Главная");
    await page.getByRole("button", { name: "Начать утреннее" }).click();
    await page.getByRole("button", { name: "Поехали" }).click();
    await expect.poll(() => log.requests.some((r) => r.text === DECK.words[0].en && r.voice === "bf_emma")).toBe(true);
  });

  test("голос, выбранный раньше только в этом браузере, переезжает в общие настройки", async ({ page }) => {
    const log = await setup(page, { voice: "bm_george" });
    await openHome(page);
    await openSettings(page);
    await expect(page.locator(".vsel")).toContainText("George");
    await expect.poll(() => (log.server.state as { settings?: { voice: string } } | null)?.settings?.voice).toBe("bm_george");
    expect(await page.evaluate(() => localStorage.getItem("hr2_tts_voice"))).toBeNull();
  });

  test("голос с другого устройства: выбор там новее — применяется здесь", async ({ page }) => {
    const log = await setup(page, { voice: "bm_george" }); // здесь когда-то выбирали George
    log.server.state = { ...state({ upd: 50 }), settings: { newPerDay: 12, voice: "bf_emma" }, settingsAt: { newPerDay: 0, voice: 40 } };
    await openHome(page);
    await openSettings(page);
    await expect(page.locator(".vsel")).toContainText("Emma");
  });

  test("новое слово озвучивается сервером, следующий шаг подгружается заранее", async ({ page }) => {
    const log = await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать утреннее" }).click();
    const audio = page.waitForRequest((r) => r.url().endsWith(".mp3"));
    await page.getByRole("button", { name: "Поехали" }).click();
    await audio;
    const texts = log.requests.map((r) => r.text);
    expect(texts).toContain(DECK.words[0].en);
    expect(texts).toContain(DECK.words[0].example); // пример к слову
    expect(texts).toContain(DECK.words[1].en); // следующее слово
    expect(log.requests.every((r) => r.voice === "af_heart")).toBe(true);
  });

  test("сервер озвучки недоступен — подсказка про системный голос", async ({ page }) => {
    await setup(page, { tts: "down" });
    await openHome(page);
    await openSettings(page);
    await page.locator(".vsel").click();
    await page.getByRole("button", { name: "Послушать Heart" }).click();
    await expect(page.getByText(/Сервер озвучки недоступен/)).toBeVisible();
  });
});
