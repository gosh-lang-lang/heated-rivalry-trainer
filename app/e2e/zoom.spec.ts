import { expect, test } from "@playwright/test";
import { openHome, setup } from "./helpers";

test("масштаб фиксирован на всех экранах тренажёра и на входе", async ({ page }) => {
  await setup(page);
  for (const path of ["/", "/login"]) {
    if (path === "/") await openHome(page);
    else await page.goto(path);

    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute("content", /minimum-scale=1, maximum-scale=1, user-scalable=no/);
    await expect(page.locator("html")).toHaveCSS("touch-action", "pan-x pan-y");
  }
});
