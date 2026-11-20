import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_VOICE, MAX_TTS_CHARS, TTS_VOICES } from "../src/core/tts.ts";
import { json } from "./http.ts";
import { cacheKey, createQueue, type TtsEngine } from "./tts.ts";
import { createTtsRoutes } from "./tts-routes.ts";

const open: { server: Server; dir: string }[] = [];
afterEach(() => open.splice(0).forEach(({ server, dir }) => (server.close(), rmSync(dir, { recursive: true, force: true }))));

/** Сервер только с маршрутами озвучки; генерация — подделка (Kokoro не нужен). */
const start = async (opts: { rateLimit?: number; maxQueue?: number; engine?: (dir: string) => TtsEngine | null } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "hr-tts-api-"));
  const generated: string[] = [];
  const engine = opts.engine ? opts.engine(dir) : createQueue(dir, async (t, v) => (generated.push(`${v}:${t}`), new TextEncoder().encode(`mp3:${v}:${t}`)));
  const handle = createTtsRoutes(engine, { rateLimit: opts.rateLimit ?? 100, maxQueue: opts.maxQueue ?? 100 });
  const server = createServer(async (req, res) => {
    if (!(await handle(req, res, new URL(req.url!, "http://x").pathname))) json(res, 404, { error: "мимо" });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  open.push({ server, dir });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const say = (body: unknown, ip = "1.1.1.1") =>
    fetch(`${base}/api/tts`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { base, say, generated };
};

describe("API озвучки", () => {
  it("озвучивает и отдаёт MP3; повтор — из кэша, с ETag и вечным кэшем браузера", async () => {
    const { base, say, generated } = await start();
    const r = await say({ text: "Hello there", voice: "bf_emma" });
    expect(r.status).toBe(200);
    const { url } = (await r.json()) as { url: string };
    expect(url).toMatch(/^\/api\/tts\/[0-9a-f]{20}\.mp3$/);

    const f = await fetch(base + url);
    expect(f.status).toBe(200);
    expect(f.headers.get("content-type")).toBe("audio/mpeg");
    expect(f.headers.get("cache-control")).toContain("immutable");
    expect(await f.text()).toBe("mp3:bf_emma:Hello there");
    expect((await fetch(base + url, { headers: { "if-none-match": f.headers.get("etag")! } })).status).toBe(304);

    expect(((await (await say({ text: "Hello there", voice: "bf_emma" })).json()) as { url: string }).url).toBe(url);
    expect(generated).toEqual(["bf_emma:Hello there"]);
  });

  it("без голоса — голос по умолчанию", async () => {
    const { say, generated } = await start();
    expect((await say({ text: "hi" })).status).toBe(200);
    expect(generated).toEqual([`${DEFAULT_VOICE}:hi`]);
  });

  it("неправильные запросы — 400, генерации нет", async () => {
    const { say, generated } = await start();
    for (const body of ["не json", "null", {}, { text: "" }, { text: "   " }, { text: 5 }, { text: "x".repeat(MAX_TTS_CHARS + 1) }, { text: "hi", voice: "robot" }])
      expect((await say(body)).status, JSON.stringify(body)).toBe(400);
    expect(generated).toEqual([]);
  });

  it("файлы: только имя-ключ; несуществующий — 404; чужие пути — мимо", async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/tts/${"a".repeat(20)}.mp3`)).status).toBe(404);
    for (const p of ["/api/tts/%2e%2e%2fx.mp3", "/api/tts/ABC.mp3", "/api/tts/x.mp3"])
      expect(await (await fetch(base + p)).json()).toEqual({ error: "мимо" });
    expect((await fetch(`${base}/api/tts`)).status).toBe(404); // GET /api/tts — не метод
  });

  it("голоса: список и голос по умолчанию", async () => {
    const { base } = await start();
    const v = (await (await fetch(`${base}/api/tts/voices`)).json()) as { default: string; voices: unknown[] };
    expect(v.default).toBe(DEFAULT_VOICE);
    expect(v.voices).toEqual(TTS_VOICES);
  });

  it("лимит новых фраз с одного адреса: 429 с Retry-After; кэш и другие адреса — без лимита", async () => {
    const { say } = await start({ rateLimit: 2 });
    expect((await say({ text: "one" })).status).toBe(200);
    expect((await say({ text: "two" })).status).toBe(200);
    const r = await say({ text: "three" });
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(3500);
    expect((await say({ text: "one" })).status).toBe(200); // уже озвучено
    expect((await say({ text: "three" }, "2.2.2.2")).status).toBe(200);
  });

  it("переполненная очередь — 503, а готовое по-прежнему отдаётся", async () => {
    let queued = 0;
    const { say } = await start({
      maxQueue: 1,
      engine: (dir) => {
        const q = createQueue(dir, async () => new Uint8Array([1]));
        return { ...q, stats: () => ({ queued, generated: 0 }) };
      },
    });
    expect((await say({ text: "ready" })).status).toBe(200);
    queued = 1;
    expect((await say({ text: "new" })).status).toBe(503);
    expect((await say({ text: "ready" })).status).toBe(200);
  });

  it("озвучка отключена — 503 на всё под /api/tts", async () => {
    const { base, say } = await start({ engine: () => null });
    expect((await say({ text: "hi" })).status).toBe(503);
    expect((await fetch(`${base}/api/tts/voices`)).status).toBe(503);
  });

  it("файл с текстом и голосом: нет — озвучить и отдать в том же запросе; есть — сразу, без генерации", async () => {
    const { base, generated } = await start();
    const url = (t: string, v: string, key = cacheKey(t, v)) => `${base}/api/tts/${key}.mp3?t=${encodeURIComponent(t)}&v=${v}`;
    const r = await fetch(url("Hello there", "bm_lewis"));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("mp3:bm_lewis:Hello there");
    expect((await fetch(url("Hello there", "bm_lewis"))).status).toBe(200);
    expect(generated).toEqual(["bm_lewis:Hello there"]);
    // ключ — только от этого текста и голоса: под чужим ключом ничего не озвучить
    expect((await fetch(url("Hello there", "bm_lewis", "a".repeat(20)))).status).toBe(400);
    expect((await fetch(url("Hello", "robot", cacheKey("Hello", "robot")))).status).toBe(400);
    expect((await fetch(url("x".repeat(500), "af_heart"))).status).toBe(400);
    // без текста — как раньше: нет файла — 404
    expect((await fetch(`${base}/api/tts/${cacheKey("Nope", "af_heart")}.mp3`)).status).toBe(404);
    expect(generated).toHaveLength(1);
  });

  it("файл с текстом подчиняется тому же лимиту новых фраз", async () => {
    const { base } = await start({ rateLimit: 1 });
    const get = (t: string) => fetch(`${base}/api/tts/${cacheKey(t, "af_heart")}.mp3?t=${encodeURIComponent(t)}&v=af_heart`, { headers: { "x-forwarded-for": "9.9.9.9" } });
    expect((await get("one")).status).toBe(200);
    expect((await get("two")).status).toBe(429);
    expect((await get("one")).status).toBe(200); // уже есть
  });
});
