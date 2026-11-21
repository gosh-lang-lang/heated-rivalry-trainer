import { defineConfig, devices } from "@playwright/test";

/** E2E_PORT / E2E_FRESH=1 — свой порт и всегда свой dev-сервер (deploy.sh проверяет чистую копию коммита). */
const PORT = Number(process.env.E2E_PORT ?? 5174);


/**
 * Регрессионные e2e-тесты. Озвучка (/api/tts) замокана в тестах — Kokoro-сервер не нужен.
 *   npm run e2e            — все проекты
 *   npm run e2e:ui         — с интерфейсом Playwright
 *   npx playwright test --project=iphone
 */
export default defineConfig({
  testDir: "e2e",
  // на машине GitHub (2 ядра) WebKit проходит урок из 38 заданий дольше 30 с — там запас втрое; локально — как было
  timeout: process.env.CI ? 90_000 : 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // вход по passkey: на каждый тест свой продакшен-сервер и своя база (e2e/auth-fixture.ts)
    { name: "auth-build", testMatch: /auth\.setup\.ts/ },
    {
      name: "auth",
      testMatch: /auth\.spec\.ts/,
      dependencies: ["auth-build"],
      use: { ...devices["Desktop Chrome"], serviceWorkers: "block" },
    },
    {
      name: "desktop-chrome",
      testIgnore: /auth\.(spec|setup)\.ts/,
      use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } },
    },
    // устройства пользователя — Apple: проверяем движок Safari на размере телефона
    { name: "iphone", testIgnore: /auth\.(spec|setup)\.ts/, use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI && !process.env.E2E_FRESH,
    timeout: 60_000,
  },
});
