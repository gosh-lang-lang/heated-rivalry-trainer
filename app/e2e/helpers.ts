import { expect, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { mergeStates, parseState } from "../src/core/state.ts";
import { ttsCacheSource } from "../src/core/tts.ts";
import { textWords, type PronResult } from "../src/core/pron.ts";

/** Ключ файла озвучки — как server/tts.ts cacheKey. */
export const ttsKey = (text: string, voice: string) => createHash("sha1").update(ttsCacheSource(text, voice)).digest("hex").slice(0, 20);

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

/** Мок GET /api/auth/sessions: телефон (это устройство), ноутбук — вчера вечером, планшет — 3 дня назад. */
export const MOCK_DEVICES = {
  sessions: [
    { id: "a1a1a1a1a1a1a1a1", name: "iPhone · приложение", kind: "phone", createdAt: +NOW - 9 * 864e5, lastSeenAt: +NOW, current: true },
    { id: "b2b2b2b2b2b2b2b2", name: "Mac · Chrome", kind: "computer", createdAt: +NOW - 20 * 864e5, lastSeenAt: +new Date("2026-11-19T21:40:00+03:00"), current: false },
    { id: "c3c3c3c3c3c3c3c3", name: "iPad · Safari", kind: "tablet", createdAt: +NOW - 30 * 864e5, lastSeenAt: +NOW - 3 * 864e5, current: false },
  ],
  passkeys: { count: 1, synced: 1 },
};

export interface TtsLog {
  /** фразы, которые «сервер» озвучил (их ещё не было): через POST /api/tts или через GET файла с текстом */
  requests: { text: string; voice: string }[];
  /** GET /api/tts/<ключ>.mp3 — какие файлы проигрывались */
  played: string[];
  /** мок сервера прогресса: что на нём лежит и сколько раз сохраняли */
  server: { state: { upd: number } | null; puts: number };
  /** записи, отправленные на оценку произношения: текст и размер (байт PCM) */
  pron: { text: string; bytes: number }[];
}

/**
 * Готовит страницу: фиксированное время, детерминированный Math.random, моки сервера озвучки и прогресса.
 * state — прогресс на устройстве (как до переезда на сервер: его заберёт вошедший пользователь),
 * remote — прогресс на сервере, sync: "down" — сервер прогресса недоступен, now — свои часы вместо NOW. Вызывать до page.goto.
 */
export const setup = async (
  page: Page,
  opts: {
    state?: unknown;
    remote?: unknown;
    voice?: string;
    tts?: "ok" | "down";
    sync?: "ok" | "down";
    now?: Date;
    /** фразы, уже озвученные на сервере (прогрев): [текст, голос] */
    ready?: [string, string][];
    /** микрофон: ok — подделка (тон, пока идёт запись), denied — запрет, none — нет микрофона */
    mic?: "ok" | "denied" | "none";
    /** сервер оценки произношения: down — недоступен */
    pron?: "ok" | "down";
  } = {},
): Promise<TtsLog> => {
  await page.clock.setFixedTime(opts.now ?? NOW);
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
  // микрофон-подделка: тон 300 Гц, пока его не заглушат (window.__micQuiet) — как будто человек говорит
  await page.addInitScript((mic) => {
    const w = window as unknown as { __micCalls: number; __micQuiet: (q: boolean) => void };
    w.__micCalls = 0;
    // через defineProperty на прототипе: в WebKit простое присваивание navigator.mediaDevices.getUserMedia не действует
    Object.defineProperty(MediaDevices.prototype, "getUserMedia", { configurable: true, writable: true, value: async () => {
      w.__micCalls++;
      if (mic === "denied") throw new DOMException("запрещено", "NotAllowedError");
      if (mic === "none") throw new DOMException("нет микрофона", "NotFoundError");
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const dest = ac.createMediaStreamDestination();
      osc.frequency.value = 300;
      gain.gain.value = 0.3;
      osc.connect(gain).connect(dest);
      osc.start();
      await ac.resume();
      w.__micQuiet = (q) => gain.gain.setValueAtTime(q ? 0 : 0.3, ac.currentTime);
      return dest.stream;
    } });
  }, opts.mic ?? "ok");

  // вход выполнен (настоящий вход проверяет e2e/auth.spec.ts на продакшен-сервере)
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: { name: "evgeny", displayName: "Евгений" }, passkeys: 1 } }));
  // устройства, где выполнен вход (настройки → «Вход»); настоящий список проверяет auth.spec.ts
  await page.route("**/api/auth/device", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/auth/sessions", (route) => route.fulfill({ json: MOCK_DEVICES }));

  const log: TtsLog = { requests: [], played: [], server: { state: (opts.remote as { upd: number }) ?? null, puts: 0 }, pron: [] };
  // сервер прогресса — как server/progress.ts: сливает присланное с тем, что лежит (core/state.ts mergeStates)
  await page.route("**/api/state", async (route) => {
    if (opts.sync === "down") return route.abort("connectionrefused");
    const srv = log.server;
    if (route.request().method() === "PUT") {
      const { state } = route.request().postDataJSON() as { state: { upd: number } };
      srv.puts++;
      srv.state = srv.state ? mergeStates(parseState(srv.state), parseState(state)) : parseState(state);
    }
    await route.fulfill({ json: { state: srv.state } });
  });

  // сервер озвучки — как server/tts.ts: файл с ключом sha1(ttsCacheSource) есть только у уже озвученных фраз
  const made = new Set((opts.ready ?? []).map(([t, v]) => ttsKey(t, v)));
  await page.route("**/api/tts", async (route) => {
    if (opts.tts === "down") return route.abort("connectionrefused");
    const body = route.request().postDataJSON() as { text: string; voice: string };
    log.requests.push(body);
    const key = ttsKey(body.text, body.voice ?? "af_heart");
    made.add(key);
    await route.fulfill({ json: { url: `/api/tts/${key}.mp3` } });
  });
  await page.route(/\/api\/tts\/[0-9a-f]{20}\.mp3(\?.*)?$/, (route) => {
    if (opts.tts === "down") return route.abort("connectionrefused");
    const u = new URL(route.request().url());
    const key = u.pathname.match(/([0-9a-f]{20})\.mp3$/)?.[1] ?? "";
    const t = u.searchParams.get("t"),
      v = u.searchParams.get("v") ?? "af_heart";
    if (!made.has(key) && t !== null && ttsKey(t, v) === key) {
      log.requests.push({ text: t, voice: v }); // файла не было — «сервер» озвучил его в этом же запросе
      made.add(key);
    }
    if (!made.has(key)) return route.fulfill({ status: 404, json: { error: "нет такого файла" } });
    log.played.push(key);
    return route.fulfill({ body: silentWav(), contentType: "audio/wav" });
  });
  await page.route("**/api/pron/warm", (route) => route.fulfill({ status: 204 }));
  // сервер оценки произношения: все слова хорошо (92%), а после setPron(page, …) — следующая запись по заказу
  await page.route(/\/api\/pron(\?.*)?$/, async (route) => {
    if (opts.pron === "down") return route.fulfill({ status: 503, json: { error: "оценка произношения отключена" } });
    const text = new URL(route.request().url()).searchParams.get("t") ?? "";
    const bytes = route.request().postDataBuffer()?.length ?? 0;
    const p = pronPlan.get(page) ?? [];
    const make = p.shift() ?? "good";
    log.pron.push({ text, bytes });
    await route.fulfill({ json: pronResult(text, make) });
  });
  return log;
};

/** Что «услышит» сервер оценки в следующих записях этой страницы. */
const pronPlan = new WeakMap<Page, PronMake[]>();
export type PronMake = "good" | "bad" | "silent";
export const setPron = (page: Page, ...next: PronMake[]) => pronPlan.set(page, [...(pronPlan.get(page) ?? []), ...next]);

/** Ответ сервера оценки: good — 92% и все слова зелёные; bad — 40%, первое длинное слово красное (θ → s); silent — тишина. */
export const pronResult = (text: string, make: PronMake): PronResult => {
  const ws = textWords(text);
  if (make === "silent") return { score: 0, ok: false, silent: true, words: ws.map((w) => ({ w, score: 0, mark: "weak", ipa: "", issues: [] })) };
  const badAt = make === "bad" ? Math.max(0, ws.findIndex((w) => w.length > 3)) : -1;
  return {
    score: make === "bad" ? 40 : 92,
    ok: make !== "bad",
    silent: false,
    words: ws.map((w, i) =>
      i === badAt
        ? { w, score: 30, mark: "weak", ipa: "θɪŋk", issues: [{ exp: "θ", got: "s" }] }
        : { w, score: 92, mark: "good", ipa: "", issues: [] },
    ),
  };
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
/** Первые n слов изучены сегодня: часть 1 урока пройдена в 09:00 (NOW). */
export const afterMorning = (n = 12) =>
  state({
    srs: Object.fromEntries(DECK.words.slice(0, n).map((w) => [w.id, ws()])),
    days: { [TODAY]: { morning: { score: 30, total: 38, mins: 14, newN: n, at: NOW.toISOString() } } },
  });

/**
 * Сезон в разгаре: уроки 1–4 пройдены целиком (16–19 ноября, по 12 слов, часть 2 — в 19:00), сегодня часть 1 урока 5
 * пройдена в 09:00 (NOW) — часть 2 лучше после 10:30. Карточек 4 из 10.
 */
export const seasonState = () => {
  const msk = (day: string, hm: string) => new Date(`${day}T${hm}:00+03:00`).toISOString();
  const srs: Record<string, WS> = {};
  const days: Record<string, unknown> = {};
  for (let i = 0; i < 5; i++) {
    const day = addDays(TODAY, i - 4);
    for (const w of DECK.words.slice(i * 12, i * 12 + 12)) srs[w.id] = ws({ intro: day, due: addDays(TODAY, 1) });
    days[day] = {
      morning: { score: 34, total: 38, mins: 16, newN: 12, at: msk(day, "09:00") },
      ...(i < 4 ? { evening: { score: 12, total: 12, mins: 14, newN: 0, at: msk(day, "19:00") } } : {}),
    };
  }
  return state({ srs, days });
};

/** Прогресс в кэше устройства (вошедший в тестах — evgeny). */
export const readState = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("hr2_state:evgeny") ?? "null")) as Promise<{
    srs: Record<string, WS>;
    days: Record<string, Record<string, unknown>>;
    sent: { text: string; pending?: boolean; words: string[] }[];
    settings: { newPerDay: number; voice: string };
    settingsAt: { newPerDay: number; voice: number };
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
    } else if (lbl === "Скажи слово" || lbl === "Скажи фразу" || lbl === "Скажи вслух") {
      if (wrongNow()) setPron(page, "bad"); // одна неудачная попытка — и «Дальше»: в счёт идёт ошибка
      await say(page);
      await next.click();
      continue;
    } else {
      throw new Error(`неизвестный шаг: «${lbl}»`);
    }
    await chk.click();
    await expect(next).toBeVisible();
    await next.click();
  }
  throw new Error("занятие не закончилось: " + report.steps.slice(-5).join(" → "));
};

/** Записать фразу в задании «Скажи»: нажать на микрофон (или «Ещё раз»), «сказать» и закончить «Готово». */
export const say = async (page: Page, start: "#rec" | "#again" = "#rec") => {
  await page.locator(start).click();
  await expect(page.locator("#rec")).toHaveAttribute("data-phase", "rec");
  await page.waitForTimeout(250);
  await page.locator("#chk").click(); // «Готово»
  await expect(page.locator("#next, #rec[data-phase=silent]").first()).toBeVisible();
};

/** Открыть главную и дождаться отрисовки. */
export const openHome = async (page: Page) => {
  // открыть заново, а не перезагрузить: переход на тот же адрес браузер может сделать с прежним состоянием истории,
  // а под подменёнными часами приложение не видит тип навигации (App.tsx reopened)
  if (page.url().startsWith("http")) await page.evaluate(() => history.replaceState(null, ""));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Евгений");
};

export type Tab = "Главная" | "Путь" | "Слова" | "Я";

/** Вкладка в навигации (нижний таб-бар на телефоне, верхнее меню на десктопе). */
export const tabButton = (page: Page, name: Tab) => page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name, exact: true });

/** Перейти в раздел через навигацию: «Главная · Путь · Слова · Я». */
export const goTab = async (page: Page, name: Tab) => {
  await tabButton(page, name).click();
};

/** Открыть «Настройки» — шестерёнкой в шапке «Я»; корень: список разделов (на десктопе рядом — первый раздел, «Занятия»). */
export const openSettings = async (page: Page) => {
  await goTab(page, "Я");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();
};

export type SettingsSectionTitle = "Занятия" | "Озвучка" | "Оформление" | "Вход и устройства";

/** Строка раздела на корне «Настроек»: её имя — название раздела и текущее значение («Занятия 12 новых слов за урок»). */
export const settingsRow = (page: Page, title: SettingsSectionTitle) => page.getByRole("button", { name: new RegExp(`^${title}`) });

/**
 * Открыть раздел настроек: вкладка «Настройки» → строка раздела. На телефоне раздел — своя страница (h1 — название),
 * на десктопе — правая колонка рядом со списком (h2).
 */
export const openSettingsSection = async (page: Page, title: SettingsSectionTitle) => {
  await openSettings(page);
  await settingsRow(page, title).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
};
