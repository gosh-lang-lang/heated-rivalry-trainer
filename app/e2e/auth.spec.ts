import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./auth-fixture";
import { DECK } from "./helpers";

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
  for (const p of ["/sw.js", "/api/tts/voices", "/api/auth/me", "/api/state"]) expect((await get(p, false)).status(), p).toBe(401);
  expect((await request.post("/api/tts", { data: { text: "hi" } })).status()).toBe(401);
  expect((await request.put("/api/state", { data: { state: { upd: 1, srs: {} } } })).status()).toBe(401);
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

/** Привязать passkey по ссылке на новом «устройстве» (свой контекст браузера и свой authenticator) и открыть приложение. */
const newDevice = async (browser: Browser, origin: string, link: string, before?: (page: Page) => Promise<void>) => {
  const ctx = await browser.newContext({ baseURL: origin, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await addAuthenticator(page);
  if (before) {
    await before(page);
    await page.goto("about:blank"); // ссылка отличается от /login только #фрагментом — без этого страница не перезагрузится
  }
  await page.goto(link);
  await page.getByRole("button", { name: "Создать passkey" }).click();
  await page.getByRole("link", { name: "Открыть тренажёр" }).click();
  await expect(page.getByRole("button", { name: "Начать утреннее" })).toBeVisible();
  return page;
};
const settings = async (page: Page) => {
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();
};
const perDay = (page: Page, n: number) => page.getByRole("button", { name: String(n), exact: true });

test("прогресс на сервере: переезжает из браузера, виден на другом устройстве, у каждого свой", async ({ browser, auth }) => {
  const { cli, origin } = auth;
  cli("user:add", "evgeny", "Евгений");
  cli("user:add", "anna", "Анна");
  const link = (name: string) => cli("enroll", name).trim().split("\n").pop()!;

  // ноутбук: прогресс жил только в браузере (до переезда на сервер)
  const old = { upd: 100, settings: { newPerDay: 18 }, srs: { sacred: { lvl: 3, due: "2026-11-25", intro: "2026-11-10", right: 5, wrong: 1 } }, days: {}, sent: [] };
  const laptop = await newDevice(browser, origin, link("evgeny"), async (page) => {
    await page.goto("/login");
    await page.evaluate((s) => localStorage.setItem("hr2_state", JSON.stringify(s)), old);
  });
  await settings(laptop);
  await expect(perDay(laptop, 18)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => cli("progress")).toMatch(/^evgeny\tслов: 1\t/);

  // телефон: тот же пользователь, чистый браузер — прогресс приходит с сервера
  const phone = await newDevice(browser, origin, link("evgeny"));
  await settings(phone);
  await expect(perDay(phone, 18)).toHaveAttribute("aria-pressed", "true");
  await perDay(phone, 24).click();
  await expect.poll(async () => ((await (await phone.request.get("/api/state")).json()) as { state: { settings: { newPerDay: number } } }).state.settings.newPerDay).toBe(24);

  // ноутбук снова открыли — видно сделанное на телефоне
  await laptop.reload();
  await settings(laptop);
  await expect(perDay(laptop, 24)).toHaveAttribute("aria-pressed", "true");

  // старое состояние не затирает новое
  const stale = await laptop.request.put("/api/state", { headers: { origin }, data: { state: { ...old, settings: { newPerDay: 6 } } } });
  expect(((await stale.json()) as { state: { settings: { newPerDay: number } } }).state.settings.newPerDay).toBe(24);
  // запись с чужого сайта отклоняется
  expect((await laptop.request.put("/api/state", { headers: { origin: "https://evil.example" }, data: { state: { ...old, upd: Date.now() * 2 } } })).status()).toBe(403);

  // другой пользователь прогресса Евгения не видит
  const anna = await newDevice(browser, origin, link("anna"));
  expect(((await (await anna.request.get("/api/state")).json()) as { state: unknown }).state).toBeNull();
  await settings(anna);
  await expect(perDay(anna, 12)).toHaveAttribute("aria-pressed", "true");

  // удалили пользователя — прогресс удалён вместе с ним
  cli("user:remove", "evgeny");
  expect(cli("progress")).not.toContain("evgeny");
  for (const p of [laptop, phone, anna]) await p.context().close();
});

test("личные настройки одинаковы на всех устройствах и не затираются чужим занятием", async ({ browser, auth }) => {
  const { cli, origin } = auth;
  cli("user:add", "evgeny", "Евгений");
  const link = () => cli("enroll", "evgeny").trim().split("\n").pop()!;
  const laptop = await newDevice(browser, origin, link());
  const phone = await newDevice(browser, origin, link());

  // ноутбук: идёт утреннее занятие (настройки на нём — старые)
  await laptop.getByRole("button", { name: "Начать утреннее" }).click();
  await laptop.getByRole("button", { name: "Поехали" }).click();

  // телефон: выбрали голос и число новых слов
  await settings(phone);
  await phone.locator(".vsel").click();
  await phone.getByRole("radio", { name: /Emma/ }).click();
  await perDay(phone, 24).click();
  await expect(phone.locator(".vsel")).toContainText("Emma");
  await phone.getByRole("radiogroup", { name: "Оформление" }).getByRole("radio", { name: /Матч/ }).click();
  await phone.getByRole("switch", { name: "Ночная тема" }).click(); // система — светлая, выбрали ночь
  await expect(phone.locator("html")).toHaveAttribute("data-theme", "dark");
  await phone.waitForTimeout(1500); // ушло на сервер

  // ноутбук продолжает занятие — его прогресс новее, но настройки телефона не трогает
  await laptop.locator("#next").click();
  await laptop.locator("#next").click();
  await laptop.getByRole("button", { name: "Выйти" }).click();
  await laptop.waitForTimeout(1500);

  // везде — выбор с телефона, а прогресс занятия ноутбука сохранён
  for (const page of [phone, laptop]) {
    await page.reload();
    await settings(page);
    await expect(page.locator(".vsel"), "голос").toContainText("Emma");
    await expect(perDay(page, 24), "новых слов").toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("radio", { name: /Матч/ }), "оформление").toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html"), "оформление").toHaveAttribute("data-players", "on");
    await expect(page.getByRole("switch", { name: "Ночная тема" }), "день/ночь").toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html"), "день/ночь").toHaveAttribute("data-theme", "dark");
  }
  await expect.poll(() => cli("progress")).toMatch(/^evgeny\tслов: 3\t/);

  // новое устройство сразу получает те же настройки
  const tablet = await newDevice(browser, origin, link());
  await settings(tablet);
  await expect(tablet.locator(".vsel")).toContainText("Emma");
  await expect(perDay(tablet, 24)).toHaveAttribute("aria-pressed", "true");
  await expect(tablet.locator("html")).toHaveAttribute("data-players", "on");
  await expect(tablet.locator("html")).toHaveAttribute("data-theme", "dark");
  for (const p of [laptop, phone, tablet]) await p.context().close();
});

test("прогресс с двух устройств складывается, а не затирает друг друга", async ({ browser, auth }) => {
  const { cli, origin } = auth;
  cli("user:add", "evgeny", "Евгений");
  const link = () => cli("enroll", "evgeny").trim().split("\n").pop()!;
  const laptop = await newDevice(browser, origin, link());
  const phone = await newDevice(browser, origin, link()); // открыт до занятия на ноутбуке — его кэш устареет

  // ноутбук: начал утреннее, познакомился с тремя словами, вышел
  await laptop.getByRole("button", { name: "Начать утреннее" }).click();
  await laptop.getByRole("button", { name: "Поехали" }).click();
  await laptop.locator("#next").click();
  await laptop.locator("#next").click();
  await laptop.getByRole("button", { name: "Выйти" }).click();
  await expect.poll(() => cli("progress")).toMatch(/^evgeny\tслов: 3\t/);
  const laptopWords = Object.keys(((await (await laptop.request.get("/api/state")).json()) as { state: { srs: object } }).state.srs);

  // телефон без связи позанимался на своём старом кэше и потом отправил: другое слово, своё предложение, перечитал главы
  const stale = await phone.evaluate(() => JSON.parse(localStorage.getItem("hr2_state:evgeny")!));
  const other = DECK.words.find((w) => !laptopWords.includes(w.id))!.id;
  const fromPhone = {
    ...stale,
    upd: Date.now() + 5_000,
    srs: { [other]: { lvl: 2, due: "2026-12-01", intro: "2026-11-20", right: 2, wrong: 0 } },
    days: { "2026-11-20": { reread: true } },
    sent: [{ at: "2026-11-20T20:00:00.000Z", words: ["endure"], text: "I endure the cold.", pending: true }],
  };
  const r = await phone.request.put("/api/state", { headers: { origin }, data: { state: fromPhone } });
  expect(r.status()).toBe(200);

  // на сервере — и то, и другое
  const merged = ((await r.json()) as { state: { srs: Record<string, unknown>; days: Record<string, { reread?: boolean }>; sent: unknown[] } }).state;
  expect(Object.keys(merged.srs).sort()).toEqual([...laptopWords, other].sort());
  expect(merged.days["2026-11-20"]?.reread).toBe(true);
  expect(merged.sent).toHaveLength(1);

  // и на обоих устройствах после обновления
  for (const page of [laptop, phone]) {
    await page.reload();
    await expect(page.locator(".legend")).toContainText("Учу4");
  }
  for (const p of [laptop, phone]) await p.context().close();
});
