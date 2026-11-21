import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_PRON_SECONDS, PRON_RATE, type PronResult } from "../src/core/pron.ts";
import { json } from "./http.ts";
import { createPronEngine, type PronEngine } from "./pron.ts";
import { createPronRoutes } from "./pron-routes.ts";

const open: Server[] = [];
afterEach(() => open.splice(0).forEach((s) => s.close()));

/** Модель-подделка: всегда «слышит» think, читает слова по словарю. */
const engine = (): PronEngine & { heard: number } => {
  const log = { heard: 0 };
  const e = createPronEngine({
    ready: Promise.resolve(),
    hear: async () => (log.heard++, ["θ", "ɪ", "ŋ", "k"].map((u) => ({ u }))),
    ipa: async (t) => [t.split(" ").map((w) => ({ think: "θɪŋk", sink: "sɪŋk" } as Record<string, string>)[w.toLowerCase()] ?? "ə").join(" ")],
  });
  return {
    ...e,
    get ready() {
      return e.ready;
    },
    get heard() {
      return log.heard;
    },
  };
};

const start = async (eng: PronEngine | null, opts: { rateLimit?: number; maxBusy?: number } = {}) => {
  const handle = createPronRoutes(eng, { rateLimit: opts.rateLimit ?? 100, maxBusy: opts.maxBusy ?? 4 });
  const server = createServer(async (req, res) => {
    if (!(await handle(req, res, new URL(req.url!, "http://x").pathname))) json(res, 404, { error: "мимо" });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  open.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = (text: string | null, seconds = 1, method = "POST") =>
    fetch(`${base}/api/pron${text === null ? "" : `?t=${encodeURIComponent(text)}`}`, {
      method,
      headers: { "content-type": "application/octet-stream" },
      body: method === "POST" ? new Uint8Array(Math.round(seconds * PRON_RATE) * 2) : undefined,
    });
  return { send };
};

describe("API оценки произношения", () => {
  it("запись и текст → оценка по словам", async () => {
    const { send } = await start(engine());
    const r = await send("think");
    expect(r.status).toBe(200);
    const body = (await r.json()) as PronResult;
    expect(body).toMatchObject({ score: 100, ok: true, silent: false, words: [{ w: "think", mark: "good", ipa: "θɪŋk" }] });
    const bad = (await (await send("sink")).json()) as PronResult;
    expect(bad.score).toBe(80); // один согласный из четырёх звуков (гласная весит вдвое: 1 из 5)
    expect(bad.words[0].issues).toEqual([{ exp: "s", got: "θ" }]);
  });

  it("слишком короткая запись — «тишина», модель не зовём", async () => {
    const e = engine();
    const { send } = await start(e);
    expect(await (await send("think", 0.05)).json()).toMatchObject({ silent: true, score: 0 });
    expect(e.heard).toBe(0);
  });

  it("неправильные запросы: без текста — 400, длинная запись — 413, не POST — 405", async () => {
    const { send } = await start(engine());
    expect((await send(null)).status).toBe(400);
    expect((await send("  ")).status).toBe(400);
    expect((await send("x ".repeat(200))).status).toBe(400);
    expect((await send("think", MAX_PRON_SECONDS + 1)).status).toBe(413);
    expect((await send("think", 1, "GET")).status).toBe(405);
  });

  it("оценка отключена — 503", async () => {
    const { send } = await start(null);
    expect((await send("think")).status).toBe(503);
  });

  it("лимит записей в час с адреса — 429 с retry-after", async () => {
    const { send } = await start(engine(), { rateLimit: 2 });
    expect((await send("think")).status).toBe(200);
    expect((await send("think")).status).toBe(200);
    const r = await send("think");
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("сервер занят — 503, запись не ставится в очередь", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = createPronEngine({
      ready: Promise.resolve(),
      hear: async () => (await gate, [{ u: "θ" }]),
      ipa: async () => ["θ"],
    });
    const { send } = await start(slow, { maxBusy: 1 });
    const first = send("think");
    await new Promise((r) => setTimeout(r, 50));
    expect((await send("think")).status).toBe(503);
    release();
    expect((await first).status).toBe(200);
  });
});
