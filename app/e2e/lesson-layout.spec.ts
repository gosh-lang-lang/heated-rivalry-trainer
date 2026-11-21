import { expect, test, type Page } from "@playwright/test";
import { DECK, openHome, setup, state } from "./helpers";

/**
 * Раскладка занятия: панель «Проверить» не прыгает после ответа, а на «Впиши пропущенное» с клавиатурой
 * (низкая видимая область) страница не прокручивается — задание, поле и кнопка влезают.
 */

type Box = { top: number; height: number };
/** Положение на экране; inPage — положение в задании (с учётом прокрутки самого задания: её делает палец, не раскладка). */
const box = (page: Page, sel: string, inPage = false) =>
  page.locator(sel).first().evaluate((e, inPage) => {
    const r = e.getBoundingClientRect();
    const scrolled = inPage ? (e.closest(".stage")?.scrollTop ?? 0) + window.scrollY : 0;
    return { top: Math.round(r.top + scrolled), height: Math.round(r.height) };
  }, inPage) as Promise<Box>;

/** Что не должно сдвинуться при проверке: панель, кнопка в ней и само задание. */
const layout = async (page: Page, content: string) => ({
  foot: await box(page, ".foot"),
  btn: await box(page, ".foot .frow .btn"),
  content: await box(page, content, true),
  scrollY: await page.evaluate(() => Math.round(window.scrollY)),
});

const byEn = (en: string) => DECK.words.find((w) => w.en === en)!;

/**
 * Начать часть 1 урока (6 новых слов) и пройти до «Впиши пропущенное», проверяя на каждом задании, что панель и задание
 * не сдвинулись после проверки. Ответы — по очереди неверно и верно. typed — сколько «Впиши» пройти (тоже с проверкой);
 * останавливаемся на следующем, не отвечая.
 */
const toTyping = async (page: Page, typed = 0, onStep?: (kind: string, ok: boolean) => void) => {
  await setup(page, { state: state({ settings: { newPerDay: 6 } }) });
  await openHome(page);
  await page.getByRole("button", { name: "Начать часть 1" }).click();
  let ok = true;
  for (let n = 0; n < 60; n++) {
    const lbl = ((await page.locator(".lbl").first().textContent({ timeout: 500 }).catch(() => null)) ?? "").trim();
    if (lbl.endsWith("Впиши пропущенное") && typed-- <= 0) return;
    if (!lbl || lbl === "Новое слово") {
      await page.locator("#next").click();
      continue;
    }
    ok = !ok; // по очереди: неверно, верно, неверно…
    if (lbl.endsWith("Выбери перевод")) {
      const w = byEn((await page.locator(".word h2").textContent())!.trim());
      const tiles = page.locator(".opts .tile");
      await (ok ? tiles.filter({ hasText: w.ru }) : tiles.filter({ hasNotText: w.ru }).first()).click();
    } else if (lbl.endsWith("Что ты слышишь?")) {
      const heard = (await page.locator(".spk.big").getAttribute("data-say"))!;
      const tiles = page.locator(".opts .tile");
      await (ok ? tiles.getByText(heard, { exact: true }) : tiles.filter({ hasNotText: heard }).first()).click();
    } else if (lbl === "Найди пары") {
      const before = await layout(page, ".pairs");
      const left = page.locator(".pairs .col").nth(0).locator(".tile");
      const right = page.locator(".pairs .col").nth(1).locator(".tile");
      for (const en of (await left.allTextContents()).map((t) => t.trim())) {
        await left.getByText(en, { exact: true }).click();
        await right.getByText(byEn(en).ru, { exact: true }).click();
      }
      await expect(page.locator(".fb")).toBeVisible();
      expect(await layout(page, ".pairs"), "пары: панель и задание на месте").toEqual(before);
      onStep?.(lbl, true);
      await page.locator("#next").click();
      continue;
    } else if (lbl.endsWith("Впиши пропущенное")) {
      const hint = (await page.locator(".hint").textContent())!.split(" · ")[0].trim();
      const w = DECK.words.find((x) => x.exampleRu === hint)!;
      const before = await layout(page, ".sent");
      await page.locator("input.inp").fill(ok ? w.blank : "zzzz");
      await page.locator("#chk").click();
      await expect(page.locator(ok ? ".foot.good" : ".foot.badf")).toBeVisible();
      expect(await layout(page, ".sent"), `впиши (${ok ? "верно" : "неверно"}): панель и задание на месте`).toEqual(before);
      onStep?.("Впиши пропущенное", ok);
      await page.locator("#next").click();
      continue;
    } else throw new Error(`неожиданный шаг до «Впиши»: «${lbl}»`);

    const before = await layout(page, ".opts");
    await page.locator("#chk").click();
    await expect(page.locator(".fb")).toBeVisible();
    await expect(page.locator(ok ? ".foot.good" : ".foot.badf")).toBeVisible();
    expect(await layout(page, ".opts"), `${lbl} (${ok ? "верно" : "неверно"}): панель и задание на месте`).toEqual(before);
    onStep?.(lbl, ok);
    await page.locator("#next").click();
  }
  throw new Error("не дошли до «Впиши пропущенное»");
};

test.describe("занятие: раскладка", () => {
  test("панель «Проверить» не меняет высоту после ответа — в каждом задании, верно и неверно", async ({ page }) => {
    const seen = new Set<string>();
    await toTyping(page, 2, (kind, ok) => void seen.add(`${kind.replace(/^Повторение · /, "")}:${ok}`));
    expect([...seen]).toEqual(
      expect.arrayContaining(["Выбери перевод:true", "Выбери перевод:false", "Найди пары:true", "Впиши пропущенное:true", "Впиши пропущенное:false"]),
    );
    expect([...seen].some((s) => s.startsWith("Что ты слышишь?"))).toBe(true);
  });

  test("«Впиши пропущенное» на низком экране: страница не прокручивается, поле и «Проверить» видны", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await toTyping(page);
    await expect(page.locator(".st-type .pic")).toBeVisible(); // подсказка-картинка, как у пользователя

    const fits = async (h: number) => {
      const m = await page.evaluate(() => {
        const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const se = document.scrollingElement!;
        return {
          scrollable: se.scrollHeight - se.clientHeight,
          scrollY: window.scrollY,
          sent: r(".sent").top,
          hint: r(".hint").bottom,
          inp: r("input.inp").bottom,
          chk: r("#chk").bottom,
          stageScroll: (() => {
            const st = document.querySelector(".stage")!;
            return st.scrollHeight - st.clientHeight;
          })(),
        };
      });
      expect(m.scrollable, "страница не прокручивается").toBeLessThanOrEqual(0);
      expect(m.scrollY).toBe(0);
      expect(m.sent).toBeGreaterThanOrEqual(0);
      for (const k of ["hint", "inp", "chk"] as const) expect(m[k], `${k} над нижним краем ${h}px`).toBeLessThanOrEqual(h);
      expect(m.stageScroll, "задание влезает целиком").toBeLessThanOrEqual(1);
    };

    // 1) низкий экран (телефон боком / клавиатура в браузере, который уменьшает страницу)
    await page.setViewportSize({ width: 375, height: 480 });
    await expect(page.locator(".st-type .pic")).toBeHidden(); // картинка-подсказка уступает место полю
    await fits(480);
    // прокрутить страницу нельзя
    await page.evaluate(() => window.scrollTo(0, 300));
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // 2) как на iPhone: страница прежней высоты, клавиатура закрыла низ — видимая область 421px
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => {
      const vv = window.visualViewport!;
      Object.defineProperty(vv, "height", { configurable: true, get: () => 421 });
      vv.dispatchEvent(new Event("resize"));
    });
    await expect(page.locator("html")).toHaveClass(/vv-kb/);
    expect((await box(page, ".app")).height).toBe(421);
    await fits(421);
    // «Не помню» — рядом с «Проверить», тоже над клавиатурой
    const dk = await box(page, ".foot .link");
    expect(dk.top + dk.height).toBeLessThanOrEqual(421);

    // ввёл и нажал «Проверить» — поле теряет фокус, клавиатура уходит
    await page.locator("input.inp").fill("zzzz");
    await page.locator("#chk").click();
    await expect(page.locator(".foot.badf")).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT");
  });
});
