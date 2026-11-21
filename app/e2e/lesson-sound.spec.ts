import { expect, test, type Page } from "@playwright/test";
import { DECK, iosSound, openHome, playSession, recordTones, setup, sound, state, TONE_BAD, TONE_OK, tones, ttsKey } from "./helpers";

/*
 * Звук в задании (screens/Session.tsx): каждое задание само произносит слово или фразу ровно один раз, после ответа —
 * короткий тон (lib/tone.ts, Web Audio). Жалоба 21.11.2026: после верного ответа слово звучало второй раз.
 * «Собери на слух»: фраза звучит в начале, перевод — только после ответа.
 */

const played = async (page: Page, text: string) => (await sound(page)).played.filter((u) => u.includes(`${ttsKey(text, "af_heart")}.mp3`)).length;
/** Подождать дольше, чем озвучка после тона (AFTER_TONE_MS) и загрузка файла, — чтобы убедиться, что ничего не прозвучало. */
const settle = (page: Page) => page.waitForTimeout(900);

const start = async (page: Page) => {
  await iosSound(page);
  await recordTones(page);
  await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
  await openHome(page);
  await page.getByRole("button", { name: "Начать часть 1" }).click();
};

test.describe("звук в задании", () => {
  test("«Выбери перевод»: слово звучит в начале, после ответа — только тон; неверно — другой тон", async ({ page }) => {
    await start(page);
    await playSession(page, { until: "Выбери перевод" });
    const en = (await page.locator(".word h2").textContent())!.trim();
    const w = DECK.words.find((x) => x.en === en)!;
    // слово уже звучало на знакомстве; задание произносит его ещё раз, в начале
    await expect.poll(() => played(page, en)).toBe(2);
    const t0 = (await tones(page)).length;

    await page.locator(".opts .tile").filter({ hasText: w.ru }).click();
    await page.locator("#chk").click();
    await expect(page.locator(".fb")).toContainText("Отлично!");
    await settle(page);
    expect(await played(page, en)).toBe(2); // после ответа слово второй раз не звучит
    expect((await tones(page)).slice(t0)).toEqual([TONE_OK]);

    // следующее «Выбери перевод» — ошибка: тон «неверно», слово тоже не повторяется
    await page.locator("#next").click();
    const en2 = (await page.locator(".word h2").textContent())!.trim();
    await expect.poll(() => played(page, en2)).toBe(2);
    await page.locator(".opts .tile").filter({ hasNotText: DECK.words.find((x) => x.en === en2)!.ru }).first().click();
    await page.locator("#chk").click();
    await expect(page.locator(".fb")).toContainText("Правильный ответ:");
    await settle(page);
    expect(await played(page, en2)).toBe(2);
    expect((await tones(page)).slice(t0)).toEqual([TONE_OK, TONE_BAD]);
  });

  test("«Впиши пропущенное»: до ответа тихо, после — тон и пример целиком", async ({ page }) => {
    await start(page);
    await playSession(page, { until: "Впиши пропущенное" });
    const hint = (await page.locator(".hint").textContent())!.split(" · ")[0].trim();
    const w = DECK.words.find((x) => x.exampleRu === hint)!;
    await settle(page);
    const before = await played(page, w.example); // пример мог звучать по кнопке на знакомстве — здесь он сам не звучит
    expect(before).toBe(0);
    const t0 = (await tones(page)).length;
    await page.locator("input.inp").fill(w.blank);
    await page.locator("#chk").click();
    await expect.poll(() => played(page, w.example)).toBe(1);
    expect((await tones(page)).slice(t0)).toEqual([TONE_OK]);
  });

  test("«Собери на слух»: фраза звучит в начале, перевод скрыт до ответа; после — перевод и тон, фраза не повторяется", async ({ page }) => {
    await start(page);
    await playSession(page, { until: "Собери на слух" });
    const phrase = (await page.locator(".ear .spk").getAttribute("data-say"))!;
    const ru = DECK.sentences.find((s) => s.en === phrase)?.ru ?? DECK.words.find((x) => x.example === phrase)!.exampleRu;

    // фраза запрошена у сервера озвучки и прозвучала сама
    await expect.poll(() => played(page, phrase)).toBe(1);
    await expect(page.getByText(ru, { exact: true })).toHaveCount(0); // перевода нет
    await expect(page.getByRole("button", { name: "Не слышно — показать перевод" })).toBeVisible();

    // кнопка — послушать ещё раз
    await page.locator(".ear .spk").click();
    await expect.poll(() => played(page, phrase)).toBe(2);

    const t0 = (await tones(page)).length;
    for (const tk of phrase.replace(/[.!?]$/, "").split(" ")) await page.locator(".pool .wt:not(.used)").getByText(tk, { exact: true }).first().click();
    await page.locator("#chk").click();
    await expect(page.locator(".fb")).toContainText("Верно!");
    await expect(page.locator(".ear-ru")).toHaveText(ru); // перевод — после ответа
    await settle(page);
    expect(await played(page, phrase)).toBe(2); // после ответа фраза сама не звучит
    expect((await tones(page)).slice(t0)).toEqual([TONE_OK]);
  });

  test("«Собери на слух» без звука: «Не слышно — показать перевод» превращает задание в сборку по переводу", async ({ page }) => {
    await start(page);
    await playSession(page, { until: "Собери на слух" });
    const phrase = (await page.locator(".ear .spk").getAttribute("data-say"))!;
    const ru = DECK.sentences.find((s) => s.en === phrase)?.ru ?? DECK.words.find((x) => x.example === phrase)!.exampleRu;
    await page.getByRole("button", { name: "Не слышно — показать перевод" }).click();
    await expect(page.locator(".ear-ru")).toHaveText(ru);
    await expect(page.getByText("Собери фразу по переводу")).toBeVisible();
  });

  test("часть 1 целиком проходится с «Собери на слух» вместо «Собери фразу»", async ({ page }) => {
    await start(page);
    const r = await playSession(page);
    expect(r.steps.filter((s) => s === "Собери на слух")).toHaveLength(3);
    expect(r.steps.filter((s) => s.endsWith("Собери фразу"))).toHaveLength(0);
  });
});
