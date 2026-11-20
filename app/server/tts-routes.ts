/**
 * Маршруты озвучки (вход уже проверен в index.ts):
 *   POST /api/tts { text, voice? } → { url }   — озвучить (или взять из кэша)
 *   GET  /api/tts/<key>.mp3                    — файл из кэша (неизменяемый)
 *   GET  /api/tts/voices                       — голоса и голос по умолчанию
 * Новые фразы (не из кэша) — не больше rateLimit в час с одного адреса; из кэша — без ограничений.
 * Очередь генерации не растёт больше maxQueue.
 */
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLimiter } from "../src/core/ratelimit.ts";
import { DEFAULT_VOICE, TTS_VOICES, ttsRequestError } from "../src/core/tts.ts";
import { clientIp, json, readBody, sendFile } from "./http.ts";
import type { TtsEngine } from "./tts.ts";

export const createTtsRoutes = (engine: TtsEngine | null, opts: { rateLimit: number; maxQueue: number }) => {
  const limiter = createLimiter(opts.rateLimit, 60 * 60 * 1000);

  /** true — запрос обработан. */
  return async (req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> => {
    if (!pathname.startsWith("/api/tts")) return false;
    if (!engine) return json(res, 503, { error: "озвучка отключена" }), true;

    if (pathname === "/api/tts/voices") return json(res, 200, { default: DEFAULT_VOICE, voices: TTS_VOICES }), true;

    if (pathname === "/api/tts" && req.method === "POST") {
      let body: { text?: unknown; voice?: unknown };
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: "нужен JSON { text, voice? }" }), true;
      }
      const err = ttsRequestError(body?.text, body?.voice);
      if (err) return json(res, 400, { error: err }), true;
      const text = body.text as string,
        voice = (body.voice as string | undefined) ?? DEFAULT_VOICE;
      if (!engine.has(text, voice)) {
        const ip = clientIp(req),
          now = Date.now();
        if (engine.stats().queued >= opts.maxQueue) return json(res, 503, { error: "очередь озвучки переполнена" }), true;
        if (!limiter.take(ip, now)) {
          res.setHeader("retry-after", Math.ceil(limiter.retryAfter(ip, now) / 1000));
          return json(res, 429, { error: "слишком много новых фраз, попробуй позже" }), true;
        }
      }
      const key = await engine.ensure(text, voice, "hi");
      return json(res, 200, { url: `/api/tts/${key}.mp3` }), true;
    }

    const m = pathname.match(/^\/api\/tts\/([0-9a-f]{20})\.mp3$/);
    if (m && req.method === "GET") {
      const path = engine.file(m[1]);
      if (!existsSync(path)) return json(res, 404, { error: "нет такого файла" }), true;
      return sendFile(req, res, path, "audio/mpeg", "public, max-age=31536000, immutable"), true;
    }
    return false;
  };
};
