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
    // на странице есть и выбор оформления — берём именно список голосов
    const list = page.getByRole("radiogroup", { name: "Голос озвучки" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("radio")).toHaveCount(10);
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
    await page.getByRole("button", { name: "Начать часть 1" }).click();
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
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    const audio = page.waitForRequest((r) => /\.mp3(\?|$)/.test(r.url()));
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

test.describe("кнопка «озвучить» в словаре", () => {
  const W = DECK.words[0];

  test("уже озвученное слово играет сразу — без запроса «озвучь»", async ({ page }) => {
    const log = await setup(page, { ready: [[W.en, "af_heart"]] });
    await openHome(page);
    await goTab(page, "Словарь");
    await page.locator(`.spk[data-say="${W.en}"]`).first().click();
    await expect.poll(() => log.played.length).toBe(1);
    expect(log.requests).toEqual([]);
  });

  test("ещё не озвученное — сервер озвучивает, второй раз — сразу файл", async ({ page }) => {
    const log = await setup(page);
    await openHome(page);
    await goTab(page, "Словарь");
    const btn = page.locator(`.spk[data-say="${W.en}"]`).first();
    await btn.click();
    await expect.poll(() => log.played.length).toBe(1);
    expect(log.requests).toEqual([{ text: W.en, voice: "af_heart" }]);
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await btn.click();
    await expect.poll(() => log.played.length).toBe(2);
    expect(log.requests).toHaveLength(1);
  });

  test("пока слово готовится и звучит — кнопка нажата, потом отжимается", async ({ page }) => {
    await setup(page, { ready: [[W.en, "af_heart"]] });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/\/api\/tts\/[0-9a-f]{20}\.mp3(\?.*)?$/, async (route) => {
      await gate; // «медленная сеть»: файл придёт, когда отпустим
      await route.fallback();
    });
    await openHome(page);
    await goTab(page, "Словарь");
    const btn = page.locator(`.spk[data-say="${W.en}"]`).first();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await expect(btn).toHaveAttribute("aria-busy", "true");
    await expect(btn.locator(".spin")).toBeVisible();
    release();
    await expect(btn).toHaveAttribute("aria-pressed", "false"); // отзвучало (0,05 с тишины)
    // другие кнопки при этом не нажимались
    await expect(page.locator('.spk[aria-pressed="true"]')).toHaveCount(0);
  });
});
