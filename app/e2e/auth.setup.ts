import { test } from "@playwright/test";
import { execFileSync } from "node:child_process";

/** Один раз перед тестами входа: собрать приложение, которое раздаёт продакшен-сервер. */
test("сборка приложения", () => {
  execFileSync("npx", ["vite", "build", "--logLevel", "error"], { stdio: "inherit" });
});
