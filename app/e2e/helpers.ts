import { expect, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* ---------- данные ---------- */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface Word {
  id: string;
  batch: number;
  en: string;
  ru: string;
  example: string;
  exampleRu: string;
  blank: string;
}
export const DECK = JSON.parse(readFileSync(join(ROOT, "../words.json"), "utf8")) as {
  words: Word[];
  sentences: { en: string; ru: string; words: string[] }[];
  batches: { id: number; title: string; pages: string }[];
};
const byEn = (en: string) => {
  const w = DECK.words.find((x) => x.en === en);
  if (!w) throw new Error(`слово «${en}» не найдено в words.json`);
  return w;
};

/** «Сегодня» во всех тестах. */
export const TODAY = "2026-11-20";
export const NOW = new Date("2026-11-20T09:00:00+03:00");
export const addDays = (k: string, n: number) => {
  const [y, m, d] = k.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};

/* ---------- окружение ---------- */

export interface TtsLog {
  requests: { text: string; voice: string }[];
  /** мок сервера прогресса: что на нём лежит и сколько раз сохраняли */
  server: { state: { upd: number } | null; puts: number };
}

/**
 * Готовит страницу: фиксированное время, детерминированный Math.random, моки сервера озвучки и прогресса.
 * state — прогресс на устройстве (как до переезда на сервер: его заберёт вошедший пользователь),
 * remote — прогресс на сервере, sync: "down" — сервер прогресса недоступен. Вызывать до page.goto.
 */
export const setup = async (
  page: Page,
  opts: { state?: unknown; remote?: unknown; voice?: string; tts?: "ok" | "down"; sync?: "ok" | "down" } = {},
): Promise<TtsLog> => {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    ({ state, voice }) => {
      // повторяемый «случай»: одни и те же варианты ответов и порядок шагов
      let s = 12345;
      Math.random = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      if (sessionStorage.getItem("__seeded")) return; // перезагрузка внутри теста не сбрасывает прогресс
      sessionStorage.setItem("__seeded", "1");
      localStorage.clear();
      if (state) localStorage.setItem("hr2_state", JSON.stringify(state));
      if (voice) localStorage.setItem("hr2_tts_voice", voice);
    },
    { state: opts.state ?? null, voice: opts.voice ?? null },
  );

  // вход выполнен (настоящий вход проверяет e2e/auth.spec.ts на продакшен-сервере)
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: { name: "evgeny", displayName: "Евгений" }, passkeys: 1 } }));

  const log: TtsLog = { requests: [], server: { state: (opts.remote as { upd: number }) ?? null, puts: 0 } };
  // сервер прогресса — как server/progress.ts: более старое не перезаписывает новое
  await page.route("**/api/state", async (route) => {
    if (opts.sync === "down") return route.abort("connectionrefused");
    const srv = log.server;
    if (route.request().method() === "PUT") {
      const { state } = route.request().postDataJSON() as { state: { upd: number } };
      srv.puts++;
      if (!srv.state || state.upd > srv.state.upd) srv.state = state;
    }
    await route.fulfill({ json: { state: srv.state } });
  });

  await page.route("**/api/tts", async (route) => {
    if (opts.tts === "down") return route.abort("connectionrefused");
    const body = route.request().postDataJSON() as { text: string; voice: string };
    log.requests.push(body);
    await route.fulfill({ json: { url: `/api/tts/${"0".repeat(20)}.mp3` } });
  });
  await page.route("**/api/tts/*.mp3", (route) => route.fulfill({ body: silentWav(), contentType: "audio/wav" }));
  return log;
};

/** 0,05 с тишины — валидный аудиофайл для мока. */
const silentWav = () => {
  const n = 1200,
    b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
};

export const ttsRequest = (r: Request) => r.url().endsWith("/api/tts") && r.method() === "POST";

/* ---------- состояние ---------- */

export interface WS {
  lvl: number;
  due: string;
  intro: string;
  right: number;
  wrong: number;
}
export const ws = (p: Partial<WS> = {}): WS => ({ lvl: 1, due: addDays(TODAY, 1), intro: TODAY, right: 0, wrong: 0, ...p });
export const state = (p: Record<string, unknown> = {}) => ({ upd: 1, settings: { newPerDay: 12 }, srs: {}, days: {}, sent: [], ...p });
/** Первые n слов изучены сегодня утром. */
export const afterMorning = (n = 12) =>
  state({
    srs: Object.fromEntries(DECK.words.slice(0, n).map((w) => [w.id, ws()])),
    days: { [TODAY]: { morning: { score: 30, total: 38, mins: 14, newN: n, at: NOW.toISOString() } } },
  });

/** Прогресс в кэше устройства (вошедший в тестах — evgeny). */
export const readState = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("hr2_state:evgeny") ?? "null")) as Promise<{
    srs: Record<string, WS>;
    days: Record<string, Record<string, unknown>>;
    sent: { text: string; pending?: boolean; words: string[] }[];
    settings: { newPerDay: number };
  }>;

/* ---------- прохождение занятия ---------- */

export interface PlayOptions {
  /** сколько раз ответить неверно (по одному на шаг, с начала) */
  mistakes?: number;
  /** своё предложение для шага «Напиши» */
  sentence?: string;
  /** защита от бесконечного цикла */
  maxSteps?: number;
}

export interface PlayReport {
  steps: string[];
  wrong: string[];
}

/** Проходит занятие до экрана итога, отвечая по данным words.json. */
export const playSession = async (page: Page, o: PlayOptions = {}): Promise<PlayReport> => {
  let mistakes = o.mistakes ?? 0;
  const report: PlayReport = { steps: [], wrong: [] };
  const chk = page.locator("#chk");
  const next = page.locator("#next");

  for (let n = 0; n < (o.maxSteps ?? 300); n++) {
    if (await page.locator(".result").isVisible()) return report;
    const lbl = ((await page.locator(".lbl").first().textContent({ timeout: 300 }).catch(() => null)) ?? "").trim();
    const sect = lbl ? "" : ((await page.locator(".sect h2").first().textContent({ timeout: 300 }).catch(() => null)) ?? "").trim();
    const kind = lbl || sect;
    report.steps.push(kind);
    const wrongNow = () => mistakes > 0 && (mistakes--, report.wrong.push(kind), true);

    if (sect === "Перечитай страницы") {
      await page.getByRole("button", { name: "Перечитал" }).click();
      continue;
    }
    if (!lbl || lbl === "Новое слово") {
      await next.click();
      continue;
    }

    if (lbl.endsWith("Выбери перевод")) {
      const w = byEn((await page.locator(".word h2").textContent())!.trim());
      const tiles = page.locator(".opts .tile");
      const target = wrongNow() ? tiles.filter({ hasNotText: w.ru }).first() : tiles.filter({ hasText: w.ru });
      await target.click();
    } else if (lbl.endsWith("Что ты слышишь?")) {
      const heard = (await page.locator(".spk.big").getAttribute("data-say"))!;
      const tiles = page.locator(".opts .tile");
      const opts = (await tiles.allTextContents()).map((t) => t.trim());
      const right = opts.find((t) => t === heard);
      if (!right) throw new Error(`«Что ты слышишь?»: озвучено «${heard}», а варианты: ${JSON.stringify(opts)}`);
      await (wrongNow() ? tiles.filter({ hasNotText: right }).first() : tiles.getByText(right, { exact: true })).click();
    } else if (lbl.endsWith("Впиши пропущенное")) {
      const hint = (await page.locator(".hint").textContent())!.split(" · ")[0].trim();
      const w = DECK.words.find((x) => x.exampleRu === hint)!;
      await page.locator("input.inp").fill(wrongNow() ? "zzzz" : w.blank);
    } else if (lbl === "Найди пары") {
      const left = page.locator(".pairs .col").nth(0).locator(".tile");
      const right = page.locator(".pairs .col").nth(1).locator(".tile");
      for (const en of (await left.allTextContents()).map((t) => t.trim())) {
        await left.getByText(en, { exact: true }).click();
        await right.getByText(byEn(en).ru, { exact: true }).click();
      }
      await next.click();
      continue;
    } else if (lbl === "Собери фразу") {
      const ru = (await page.locator(".sent").first().textContent())!.trim();
      const en = DECK.sentences.find((s) => s.ru === ru)?.en ?? DECK.words.find((w) => w.exampleRu === ru)!.example;
      let toks = en.replace(/[.!?]$/, "").split(" ");
      if (wrongNow()) toks = [...toks].reverse();
      for (const t of toks) await page.locator(".pool .wt:not(.used)").getByText(t, { exact: true }).first().click();
    } else if (lbl === "Напиши своё предложение") {
      await page.locator("textarea.inp").fill(o.sentence ?? "I praise my team every day.");
    } else if (lbl === "Скажи вслух") {
      const phrase = (await page.locator(".card .sent").first().textContent())!.trim();
      await page.locator("textarea.inp").fill(wrongNow() ? "hello" : phrase);
    } else {
      throw new Error(`неизвестный шаг: «${lbl}»`);
    }
    await chk.click();
    await expect(next).toBeVisible();
    await next.click();
  }
  throw new Error("занятие не закончилось: " + report.steps.slice(-5).join(" → "));
};

/** Открыть главную и дождаться отрисовки. */
export const openHome = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Евгений");
};

/** Перейти в раздел через навигацию (нижний таб-бар на телефоне, верхнее меню на десктопе). */
export const goTab = async (page: Page, name: "Главная" | "Словарь" | "Статистика" | "Настройки") => {
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name, exact: true }).click();
};

/** Открыть «Настройки»: новые слова за утро, голос, перенос данных. */
export const openSettings = async (page: Page) => {
  await goTab(page, "Настройки");
  await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();
};
