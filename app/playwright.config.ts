import { defineConfig, devices } from "@playwright/test";

const PORT = 5174;

/**
 * Регрессионные e2e-тесты. Озвучка (/api/tts) замокана в тестах — Kokoro-сервер не нужен.
 *   npm run e2e            — все проекты
 *   npm run e2e:ui         — с интерфейсом Playwright
 *   npx playwright test --project=iphone
 */
export default defineConfig({
  testDir: "e2e",
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
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } },
    },
    // устройства пользователя — Apple: проверяем движок Safari на размере телефона
    { name: "iphone", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
