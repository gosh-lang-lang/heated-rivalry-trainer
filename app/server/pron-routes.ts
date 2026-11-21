/**
 * Маршрут оценки произношения (вход уже проверен в index.ts):
 *   POST /api/pron?t=<текст>  тело — запись: PCM 16 бит little-endian, моно, 16 кГц (application/octet-stream)
 *        → PronResult (src/core/pron.ts): оценка 0–100, по словам — оценка и звуки, которые прозвучали не так.
 *   POST /api/pron/warm — «разбудить» модель в начале занятия (её процесс запускается по требованию) → 204
 * Запись не сохраняется. Не больше rateLimit записей в час с одного адреса; одновременно — не больше maxBusy.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_PRON_SECONDS, PRON_RATE, pronTextError, scorePron, textWords } from "../src/core/pron.ts";
import { createLimiter } from "../src/core/ratelimit.ts";
import { clientIp, json, readBytes } from "./http.ts";
import { pcm16ToFloat, type PronEngine } from "./pron.ts";

/** Короче — тишина, модель не зовём. */
export const MIN_PRON_SECONDS = 0.15;

export const createPronRoutes = (engine: PronEngine | null, opts: { rateLimit: number; maxBusy: number }) => {
  const limiter = createLimiter(opts.rateLimit, 60 * 60 * 1000);

  /** true — запрос обработан. */
  return async (req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> => {
    if (pathname === "/api/pron/warm" && req.method === "POST") {
      // начало занятия с говорением: модель грузится, пока ученик знакомится со словами
      if (engine) engine.ready.catch(() => {});
      res.writeHead(204, { "cache-control": "no-store" });
      return res.end(), true;
    }
    if (pathname !== "/api/pron") return false;
    if (req.method !== "POST") return json(res, 405, { error: "метод не поддерживается" }), true;
    if (!engine) return json(res, 503, { error: "оценка произношения отключена" }), true;

    const text = new URL(req.url ?? "/", "http://x").searchParams.get("t");
    const err = pronTextError(text);
    if (err) return json(res, 400, { error: err }), true;

    let body: Uint8Array;
    try {
      body = await readBytes(req, MAX_PRON_SECONDS * PRON_RATE * 2);
    } catch {
      return json(res, 413, { error: `запись длиннее ${MAX_PRON_SECONDS} секунд` }), true;
    }
    if (body.length < MIN_PRON_SECONDS * PRON_RATE * 2) {
      const words = textWords(text!);
      return json(res, 200, scorePron(words, words.map(() => []), [])), true;
    }

    const ip = clientIp(req),
      now = Date.now();
    if (engine.busy() >= opts.maxBusy) return json(res, 503, { error: "сервер занят, попробуй ещё раз" }), true;
    if (!limiter.take(ip, now)) {
      res.setHeader("retry-after", Math.ceil(limiter.retryAfter(ip, now) / 1000));
      return json(res, 429, { error: "слишком много записей, попробуй позже" }), true;
    }
    return json(res, 200, await engine.assess(pcm16ToFloat(body), text!)), true;
  };
};
