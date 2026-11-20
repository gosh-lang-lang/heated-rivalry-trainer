/**
 * Сервер приложения.
 *   POST /api/tts         { text, voice? } → { url }   — озвучить (или взять из кэша)
 *   GET  /api/tts/<key>.mp3                            — файл из кэша (неизменяемый)
 *   GET  /api/tts/voices                               — голоса и голос по умолчанию
 *   GET  /api/health
 * В production (NODE_ENV=production) ещё и раздаёт собранное приложение из dist/.
 *
 * Переменные: PORT (8787), TTS_CACHE_DIR (server/cache/tts), TTS_DTYPE (fp32 | q8), TTS_WARM=0 — не прогревать колоду.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_VOICE, TTS_VOICES, ttsRequestError, VOICE_SAMPLE } from "../src/core/tts.ts";
import { createEngine } from "./tts.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 8787);
const PROD = process.env.NODE_ENV === "production";
const engine = createEngine(process.env.TTS_CACHE_DIR ?? join(ROOT, "server/cache/tts"), process.env.TTS_DTYPE === "q8" ? "q8" : "fp32");

const json = (res: ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage, limit = 8 * 1024) =>
  new Promise<string>((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const sendFile = (req: IncomingMessage, res: ServerResponse, path: string, type: string, cache: string) => {
  const st = statSync(path);
  const etag = `"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { etag, "cache-control": cache });
    return res.end();
  }
  res.writeHead(200, { "content-type": type, "content-length": st.size, etag, "cache-control": cache, "accept-ranges": "none" });
  createReadStream(path).pipe(res);
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};
const DIST = join(ROOT, "dist");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (url.pathname === "/api/health") return json(res, 200, { ok: true, ...engine.stats() });

    if (url.pathname === "/api/tts/voices") return json(res, 200, { default: DEFAULT_VOICE, voices: TTS_VOICES });

    if (url.pathname === "/api/tts" && req.method === "POST") {
      let body: { text?: unknown; voice?: unknown };
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: "нужен JSON { text, voice? }" });
      }
      const err = ttsRequestError(body.text, body.voice);
      if (err) return json(res, 400, { error: err });
      const key = await engine.ensure(body.text as string, (body.voice as string | undefined) ?? DEFAULT_VOICE, "hi");
      return json(res, 200, { url: `/api/tts/${key}.mp3` });
    }

    const m = url.pathname.match(/^\/api\/tts\/([0-9a-f]{20})\.mp3$/);
    if (m && req.method === "GET") {
      const path = engine.file(m[1]);
      if (!existsSync(path)) return json(res, 404, { error: "нет такого файла" });
      return sendFile(req, res, path, "audio/mpeg", "public, max-age=31536000, immutable");
    }

    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "нет такого метода" });

    // собранное приложение (production)
    if (PROD && req.method === "GET") {
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
      let path = join(DIST, rel);
      if (!path.startsWith(DIST) || !existsSync(path) || statSync(path).isDirectory()) path = join(DIST, "index.html");
      const hashed = path.includes(`${DIST}/assets/`);
      return sendFile(req, res, path, MIME[extname(path)] ?? "application/octet-stream", hashed ? "public, max-age=31536000, immutable" : "no-cache");
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: "ошибка озвучки" });
    else res.end();
  }
});

server.listen(PORT, () => console.log(`сервер: http://localhost:${PORT}${PROD ? "" : " (только /api — приложение через vite)"}`));

// прогрев: заранее озвучить колоду голосом по умолчанию, чтобы занятия не ждали генерации
if (process.env.TTS_WARM !== "0") {
  void engine.ready.then(() => {
    const deck = JSON.parse(readFileSync(join(ROOT, "../words.json"), "utf8")) as {
      words: { en: string; example: string }[];
      sentences: { en: string }[];
    };
    const texts = [...new Set([...deck.words.flatMap((w) => [w.en, w.example]), ...deck.sentences.map((s) => s.en)])];
    const t0 = Date.now();
    const samples = TTS_VOICES.map((v) => engine.ensure(VOICE_SAMPLE, v.id, "lo")); // образцы для выбора голоса — первыми
    Promise.allSettled([...samples, ...texts.map((t) => engine.ensure(t, DEFAULT_VOICE, "lo"))]).then((r) => {
      const failed = r.filter((x) => x.status === "rejected").length;
      console.log(`прогрев: ${texts.length} фраз за ${Math.round((Date.now() - t0) / 1000)} с${failed ? `, ошибок: ${failed}` : ""}`);
    });
  });
}
