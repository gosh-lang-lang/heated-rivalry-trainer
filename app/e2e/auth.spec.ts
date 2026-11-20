import type { Page } from "@playwright/test";
import { expect, test } from "./auth-fixture";

/**
 * Вход по passkey на продакшен-сервере (npm run e2e -- --project=auth).
 * Каждый тест — в своей среде: свой сервер, своя пустая база (auth-fixture.ts).
 * Passkey создаёт виртуальный authenticator Chromium (CDP WebAuthn) — как Touch ID, только без пальца.
 */

/** Виртуальный «Touch ID» для страницы. */
const addAuthenticator = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, authenticatorId };
};

test("без входа закрыто всё, кроме страницы входа", async ({ request }) => {
  const get = (path: string, html = true) => request.get(path, { maxRedirects: 0, headers: html ? { accept: "text/html" } : {} });
  for (const p of ["/", "/index.html", "/words"]) {
    const r = await get(p);
    expect(r.status(), p).toBe(302);
    expect(r.headers().location).toMatch(/^\/login/);
  }
  for (const p of ["/sw.js", "/api/tts/voices", "/api/auth/me"]) expect((await get(p, false)).status(), p).toBe(401);
  expect((await request.post("/api/tts", { data: { text: "hi" } })).status()).toBe(401);
  // обход через закодированные «..» не открывает приложение
  for (const p of ["/auth/%2e%2e/index.html", "/auth/..%2findex.html", "/auth/nope.js"]) {
    const r = await get(p);
    expect([302, 400, 401, 404], p).toContain(r.status());
    expect(await r.text(), p).not.toContain('id="root"');
  }
  const login = await get("/login");
  expect(login.status()).toBe(200);
  expect(await login.text()).toContain("Войти с passkey");
  // в коде страницы входа нет приложения
  const js = (await login.text()).match(/src="(\/auth\/[^"]+)"/)![1];
  const body = await (await get(js, false)).text();
  expect(body).not.toContain("Евгений");
  expect(body).not.toContain("animosity");
});

test("привязать passkey без ссылки нельзя", async ({ page, request }) => {
  expect((await request.post("/api/auth/enroll/options", { data: { token: "x".repeat(43) } })).status()).toBe(400);
  expect((await request.post("/api/auth/enroll/options", { data: {} })).status()).toBe(400);
  // запрос с чужого сайта отклоняется
  expect((await request.post("/api/auth/login/options", { headers: { origin: "https://evil.example" }, data: {} })).status()).toBe(403);
  await page.goto(`/login#enroll=${"y".repeat(43)}`);
  await expect(page.getByText("Ссылка недействительна или устарела")).toBeVisible();
});

test("привязка по одноразовой ссылке → приложение → выход → вход → отзыв passkey", async ({ page, browser, auth }) => {
  const { cli, origin: ORIGIN } = auth;
  cli("user:add", "evgeny", "Евгений");
  const link = cli("enroll", "evgeny").trim().split("\n").pop()!;
  expect(link).toMatch(new RegExp(`^${ORIGIN}/login#enroll=[\\w-]{40,}$`));
  await addAuthenticator(page);

  // привязка
  await page.goto(link);
  await expect(page.locator("#enroll-name")).toHaveText("Евгений");
  expect(page.url()).not.toContain("enroll="); // токен убран из адресной строки
  await page.getByRole("button", { name: "Создать passkey" }).click();
  await expect(page.getByText("Готово! Passkey сохранён")).toBeVisible();
  await page.getByRole("link", { name: "Открыть тренажёр" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Евгений");
  expect(cli("users")).toContain("evgeny\tЕвгений\tpasskey: 1");

  // ссылка одноразовая — второй раз не работает
  const other = await browser.newPage({ baseURL: ORIGIN });
  await other.goto(link);
  await expect(other.getByText("Ссылка недействительна или устарела")).toBeVisible();
  await other.close();

  // выход
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.locator(".account")).toContainText("привязано: 1");
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);

  // вход тем же passkey
  await page.getByRole("button", { name: "Войти с passkey" }).click();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(page.getByRole("button", { name: "Начать утреннее" })).toBeVisible();
  expect(cli("passkeys", "evgeny")).toMatch(/вход 20\d\d-/); // время последнего входа записано

  // возврат на страницу, с которой выкинуло
  await page.request.post("/api/auth/logout", { headers: { origin: ORIGIN }, data: {} });
  await page.goto("/words");
  await expect(page).toHaveURL(/\/login\?next=%2Fwords$/);
  await page.getByRole("button", { name: "Войти с passkey" }).click();
  await expect(page).toHaveURL(`${ORIGIN}/words`);

  // отзыв passkey: войти им больше нельзя
  const id = cli("passkeys", "evgeny").split("\t")[0].replace("…", "");
  expect(cli("passkey:remove", id)).toContain("отозван");
  await page.request.post("/api/auth/logout", { headers: { origin: ORIGIN }, data: {} });
  await page.goto("/login");
  await page.getByRole("button", { name: "Войти с passkey" }).click();
  await expect(page.locator("#login-msg")).toContainText("не зарегистрирован");
});

test("устройство без привязанного passkey войти не может", async ({ page }) => {
  await addAuthenticator(page); // пустой authenticator
  await page.goto("/login");
  await page.getByRole("button", { name: "Войти с passkey" }).click();
  await expect(page.locator("#login-msg")).not.toBeEmpty();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});
