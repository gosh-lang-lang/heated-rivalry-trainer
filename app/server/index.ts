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
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_VOICE, TTS_VOICES, VOICE_SAMPLE } from "../src/core/tts.ts";
import { clientIp, json, readBody, sendFile } from "./http.ts";
import { createTtsRoutes } from "./tts-routes.ts";
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
const tts = createTtsRoutes(engine, {
  rateLimit: Number(process.env.TTS_RATE_LIMIT ?? 120),
  maxQueue: Number(process.env.TTS_MAX_QUEUE ?? 400),
});

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

    if (await tts(req, res, url.pathname)) return;

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
