import { expect, test } from "@playwright/test";
import { afterMorning, DECK, goTab, MOCK_DEVICES, openHome, openSettings, openSettingsSection, setup, state, TODAY, ws, type SettingsSectionTitle } from "./helpers";

test.describe("главная", () => {
  test("новый пользователь: приветствие, 62 новых слова, серия 0", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Доброе утро, Евгений");
    await expect(page.locator(".chip")).toContainText("0 дней");
    await expect(page.locator(".legend")).toContainText("Новые62");
    await expect(page.getByText("всего слов: 62")).toBeVisible();
  });

  test("приветствие — по имени вошедшего, не прописанное в коде", async ({ page }) => {
    await setup(page);
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: { name: "svetlana", displayName: "Светлана" }, passkeys: 1 } }));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Доброе утро, Светлана");
    // без сети имя берётся у последнего вошедшего на этом устройстве
    await page.route("**/api/auth/me", (route) => route.abort("internetdisconnected"));
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Доброе утро, Светлана");
  });

  test("настройка «новых слов за урок» сохраняется", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await openSettingsSection(page, "Занятия");
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

test.describe("вёрстка", () => {
  for (const name of ["главная", "занятие", "словарь", "статистика", "настройки"]) {
    test(`без горизонтальной прокрутки: ${name}`, async ({ page }) => {
      await setup(page, { state: afterMorning(12) });
      await openHome(page);
      if (name === "занятие") {
        await page.getByRole("button", { name: "Начать часть 2" }).click();
        await page.getByRole("button", { name: "Поехали" }).click();
      }
      if (name === "словарь") await page.getByRole("button", { name: "Словарь" }).first().click();
      if (name === "статистика") await page.getByRole("button", { name: "Статистика" }).first().click();
      if (name === "настройки") await openSettings(page);
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);
      // и каждый раздел настроек
      if (name === "настройки")
        for (const s of ["Занятия", "Озвучка", "Оформление", "Вход и устройства"] as SettingsSectionTitle[]) {
          await openSettingsSection(page, s);
          expect(await overflow(), s).toBeLessThanOrEqual(0);
        }
    });
  }

  test("нет ошибок в консоли за часть 1", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
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
    await expect(page.getByRole("button", { name: "Начать часть 1" })).toBeVisible();
  });

  test("во время занятия меню скрыто", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await page.getByRole("button", { name: "Начать часть 1" }).click();
    await expect(page.getByRole("navigation", { name: "Разделы" })).toHaveCount(0);
  });
});

test.describe("тема день / ночь", () => {
  test("по умолчанию — как в системе; тумблер в шапке переключает и запоминает выбор", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await setup(page);
    await openHome(page);
    const tg = page.getByRole("switch", { name: "Ночная тема" });
    await expect(tg).toHaveAttribute("aria-checked", "true");
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const night = await bg();

    await tg.click();
    await expect(tg).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await bg()).not.toBe(night);

    // система по-прежнему тёмная, но выбор пользователя важнее
    await page.reload();
    await expect(page.getByRole("switch", { name: "Ночная тема" })).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test.describe("оформление", () => {
  test("три темы в настройках: выбор применяется сразу и запоминается; в «Матче» катаются хоккеисты", async ({ page }) => {
    await setup(page);
    await openHome(page);
    await openSettingsSection(page, "Оформление");
    const looks = page.getByRole("radiogroup", { name: "Оформление" });
    await expect(looks.getByRole("radio")).toHaveCount(3);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-glass", "ice"); // по умолчанию — «Лёд»
    await expect(page.locator(".rink-players")).toBeHidden();

    await looks.getByRole("radio", { name: /Классика/ }).click();
    await expect(html).toHaveAttribute("data-glass", "classic");
    await expect(looks.getByRole("radio", { name: /Классика/ })).toHaveAttribute("aria-checked", "true");

    await looks.getByRole("radio", { name: /Матч/ }).click();
    await expect(html).toHaveAttribute("data-glass", "ice");
    await expect(html).toHaveAttribute("data-players", "on");
    await expect(page.locator(".rink-players")).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-players", "on");
  });
});

test("оформление и день/ночь, выбранные раньше только в этом браузере, переезжают в общие настройки", async ({ page }) => {
  const log = await setup(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("hr2_look", "classic");
      localStorage.setItem("hr2_theme", "dark");
      sessionStorage.setItem("seeded", "1");
    }
  });
  await openHome(page);
  await expect(page.locator("html")).toHaveAttribute("data-glass", "classic");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() => (log.server.state as { settings?: { look: string; theme: string } } | null)?.settings)
    .toMatchObject({ look: "classic", theme: "dark" });
  expect(await page.evaluate(() => [localStorage.getItem("hr2_look"), localStorage.getItem("hr2_theme")])).toEqual([null, null]);
  // и после перезагрузки — из настроек
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-glass", "classic");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("вход: устройства — список, выйти на одном, везде кроме этого (с подтверждением)", async ({ page }) => {
  const hint = page.waitForRequest((r) => r.url().endsWith("/api/auth/device") && r.method() === "POST");
  await setup(page);
  const posts: { path: string; body: unknown }[] = [];
  let list = MOCK_DEVICES;
  await page.route("**/api/auth/sessions", (route) => route.fulfill({ json: list }));
  await page.route("**/api/auth/sessions/*", (route) => {
    const path = new URL(route.request().url()).pathname;
    posts.push({ path, body: route.request().postDataJSON() });
    list = path.endsWith("revoke-others")
      ? { ...list, sessions: list.sessions.filter((s) => s.current) }
      : { ...list, sessions: list.sessions.filter((s) => s.id !== (route.request().postDataJSON() as { id: string }).id) };
    return route.fulfill({ json: { ok: true } });
  });
  await openHome(page);
  // при запуске браузер сообщает о себе только два флага
  const sent = (await hint).postDataJSON() as Record<string, unknown>;
  expect(Object.keys(sent).sort()).toEqual(["standalone", "touch"]);
  expect(Object.values(sent).every((v) => typeof v === "boolean")).toBe(true);

  await openSettingsSection(page, "Вход и устройства");
  const devs = page.getByRole("list", { name: "Где выполнен вход" }).getByRole("listitem");
  await expect(devs).toHaveCount(3);
  await expect(devs.nth(0)).toContainText("iPhone · приложение");
  await expect(devs.nth(0)).toContainText("это устройство · сейчас");
  await expect(devs.nth(0).getByRole("button")).toHaveCount(0); // своё — обычной кнопкой «Выйти» внизу
  await expect(devs.nth(1)).toContainText("Mac · Chrome");
  await expect(devs.nth(1)).toContainText("вчера в 21:40");
  await expect(devs.nth(2)).toContainText("iPad · Safari");
  await expect(devs.nth(2)).toContainText("3 дня назад");
  await expect(page.locator(".account")).toContainText("Passkey: 1 (iCloud, на всех устройствах Apple)");

  // выйти на ноутбуке — сразу, без подтверждения
  await page.getByRole("button", { name: /^Выйти: Mac · Chrome/ }).click();
  await expect(devs).toHaveCount(2);
  expect(posts).toEqual([{ path: "/api/auth/sessions/revoke", body: { id: "b2b2b2b2b2b2b2b2" } }]);

  // «везде, кроме этого» — только после подтверждения
  await page.getByRole("button", { name: "Выйти везде, кроме этого" }).click();
  await expect(page.getByText("Выйти на другом устройстве?")).toBeVisible();
  await page.getByRole("button", { name: "Отмена" }).click();
  expect(posts).toHaveLength(1);
  await page.getByRole("button", { name: "Выйти везде, кроме этого" }).click();
  await page.getByRole("button", { name: "Да, выйти" }).click();
  await expect(devs).toHaveCount(1);
  expect(posts[1]).toEqual({ path: "/api/auth/sessions/revoke-others", body: {} });
  await expect(page.getByRole("button", { name: "Выйти везде, кроме этого" })).toHaveCount(0); // других устройств нет
  await expect(page.getByRole("button", { name: "Выйти", exact: true })).toBeVisible();
});
