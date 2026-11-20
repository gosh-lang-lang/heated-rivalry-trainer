/**
 * Сервер приложения. Всё, кроме входа, — только с сессией (вход по passkey, см. auth.ts).
 *   /api/auth/*                                        — вход (публично)
 *   POST /api/tts         { text, voice? } → { url }   — озвучить (или взять из кэша)
 *   GET  /api/tts/<key>.mp3                            — файл из кэша (неизменяемый)
 *   GET  /api/tts/voices                               — голоса и голос по умолчанию
 *   GET  /api/state  /  PUT /api/state { state }       — прогресс пользователя (см. progress.ts)
 *   GET  /api/health                                   — публично, только { ok }
 * В production (NODE_ENV=production) ещё и раздаёт собранное приложение из dist/:
 * /login (+ /auth/*, иконки) — публично, остальное — после входа.
 *
 * Переменные: PORT (8787), AUTH_ORIGIN (https://домен), AUTH_DB (server/cache/auth.db),
 * TTS_CACHE_DIR (server/cache/tts), TTS_DTYPE (fp32 | q8), TTS_WARM=0 — не прогревать колоду,
 * TTS_DISABLED=1 — без озвучки (тесты входа), AUTH_DEV_BYPASS=1 — без входа (только не в production).
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_VOICE, TTS_VOICES, ttsRequestError, VOICE_SAMPLE } from "../src/core/tts.ts";
import { createLimiter } from "../src/core/ratelimit.ts";
import { openAuthStore } from "./auth-store.ts";
import { cleanPath, isPublicAsset } from "./paths.ts";
import { openProgress, parseStateBody, STATE_MAX_BYTES } from "./progress.ts";
import { authConfigFromEnv, createAuth } from "./auth.ts";
import { createEngine, type TtsEngine } from "./tts.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 8787);
const PROD = process.env.NODE_ENV === "production";
const TTS_ON = process.env.TTS_DISABLED !== "1";
const engine: TtsEngine | null = TTS_ON
  ? createEngine(process.env.TTS_CACHE_DIR ?? join(ROOT, "server/cache/tts"), process.env.TTS_DTYPE === "q8" ? "q8" : "fp32")
  : null;
const DEV_BYPASS = !PROD && process.env.AUTH_DEV_BYPASS === "1";

/** Новые фразы (не из кэша) — не больше TTS_RATE_LIMIT в час с одного адреса; из кэша — без ограничений. */
const limiter = createLimiter(Number(process.env.TTS_RATE_LIMIT ?? 120), 60 * 60 * 1000);
/** Очередь генерации не растёт бесконечно. */
const MAX_QUEUE = Number(process.env.TTS_MAX_QUEUE ?? 400);
/** Адрес клиента: за Caddy — первый в X-Forwarded-For (до сервера доходит только Caddy). */
const clientIp = (req: IncomingMessage) =>
  String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress || "?";

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

const store = openAuthStore(process.env.AUTH_DB ?? join(ROOT, "server/cache/auth.db"));
const authCfg = authConfigFromEnv();
const auth = createAuth(store, authCfg, { json, readBody: (req) => readBody(req), clientIp });
const progress = openProgress(store.db);
/** Без входа (AUTH_DEV_BYPASS) прогресс пишется локальному пользователю dev. */
const devUser = () => store.userByName("dev") ?? store.addUser("dev", "Разработчик");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (url.pathname === "/api/health") return json(res, 200, { ok: true });

    if (await auth.handle(req, res, url.pathname)) return;

    // всё остальное — только после входа
    const clean = cleanPath(url.pathname);
    if (!clean) return json(res, 400, { error: "некорректный путь" });
    const isPublic = PROD && isPublicAsset(clean);
    const user = DEV_BYPASS || isPublic ? null : auth.sessionUser(req, res);
    if (!DEV_BYPASS && !user && !isPublic) {
      if (url.pathname.startsWith("/api/") || req.method !== "GET" || !String(req.headers.accept ?? "").includes("text/html"))
        return json(res, 401, { error: "нужен вход" });
      const next = url.pathname === "/" ? "" : `?next=${encodeURIComponent(url.pathname + url.search)}`;
      res.writeHead(302, { location: `/login${next}`, "cache-control": "no-store" });
      return res.end();
    }
    if (req.method !== "GET" && req.method !== "HEAD" && !auth.sameOrigin(req)) return json(res, 403, { error: "чужой источник запроса" });

    if (url.pathname === "/api/state") {
      const who = user ?? (DEV_BYPASS ? devUser() : undefined);
      if (!who) return json(res, 401, { error: "нужен вход" });
      if (req.method === "GET") return json(res, 200, { state: progress.get(who.id) });
      if (req.method !== "PUT") return json(res, 405, { error: "метод не поддерживается" });
      let raw: string;
      try {
        raw = await readBody(req, STATE_MAX_BYTES);
      } catch {
        return json(res, 413, { error: "слишком большое состояние" });
      }
      const s = parseStateBody(raw);
      if (typeof s === "string") return json(res, 400, { error: s });
      return json(res, 200, { state: progress.put(who.id, s).state });
    }

    if (url.pathname.startsWith("/api/tts") && !engine) return json(res, 503, { error: "озвучка отключена" });

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
      const text = body.text as string,
        voice = (body.voice as string | undefined) ?? DEFAULT_VOICE;
      if (!engine!.has(text, voice)) {
        const ip = clientIp(req),
          now = Date.now();
        if (engine!.stats().queued >= MAX_QUEUE) return json(res, 503, { error: "очередь озвучки переполнена" });
        if (!limiter.take(ip, now)) {
          res.setHeader("retry-after", Math.ceil(limiter.retryAfter(ip, now) / 1000));
          return json(res, 429, { error: "слишком много новых фраз, попробуй позже" });
        }
      }
      const key = await engine!.ensure(text, voice, "hi");
      return json(res, 200, { url: `/api/tts/${key}.mp3` });
    }

    const m = url.pathname.match(/^\/api\/tts\/([0-9a-f]{20})\.mp3$/);
    if (m && req.method === "GET") {
      const path = engine!.file(m[1]);
      if (!existsSync(path)) return json(res, 404, { error: "нет такого файла" });
      return sendFile(req, res, path, "audio/mpeg", "public, max-age=31536000, immutable");
    }

    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "нет такого метода" });

    // собранное приложение (production)
    if (PROD && req.method === "GET") {
      let path = clean === "/login" ? join(DIST, "login.html") : join(DIST, clean);
      const missing = !path.startsWith(DIST + "/") || !existsSync(path) || statSync(path).isDirectory();
      if (missing && isPublic) return json(res, 404, { error: "not found" }); // публичное — без подмены на приложение
      if (missing) path = join(DIST, "index.html");
      const hashed = path.includes(`${DIST}/assets/`) || path.includes(`${DIST}/auth/`);
      return sendFile(req, res, path, MIME[extname(path)] ?? "application/octet-stream", hashed ? "public, max-age=31536000, immutable" : "no-cache");
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: "ошибка сервера" });
    else res.end();
  }
});

server.listen(PORT, () =>
  console.log(
    `сервер: http://localhost:${PORT}${PROD ? "" : " (только /api — приложение через vite)"} · вход: ${authCfg.origin}${DEV_BYPASS ? " (ОТКЛЮЧЁН — AUTH_DEV_BYPASS)" : ""}${TTS_ON ? "" : " · озвучка отключена"}`,
  ),
);
setInterval(() => store.cleanup(), 60 * 60 * 1000).unref();

// прогрев: заранее озвучить колоду голосом по умолчанию, чтобы занятия не ждали генерации
if (engine && process.env.TTS_WARM !== "0") {
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
