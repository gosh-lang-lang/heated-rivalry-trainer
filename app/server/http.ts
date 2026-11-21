/** Общие помощники HTTP для сервера и его частей. */
import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

export const json = (res: ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

export const readBody = (req: IncomingMessage, limit = 8 * 1024) =>
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

/** Тело запроса как байты; больше `limit` — ошибка "too large". */
export const readBytes = (req: IncomingMessage, limit: number) =>
  new Promise<Uint8Array>((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.resume();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on("error", reject);
  });

export const sendFile = (req: IncomingMessage, res: ServerResponse, path: string, type: string, cache: string) => {
  const st = statSync(path);
  const etag = `"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { etag, "cache-control": cache });
    return res.end();
  }
  res.writeHead(200, { "content-type": type, "content-length": st.size, etag, "cache-control": cache, "accept-ranges": "none" });
  createReadStream(path).pipe(res);
};

/** Адрес клиента: за Caddy — первый в X-Forwarded-For (до сервера доходит только Caddy). */
export const clientIp = (req: IncomingMessage) =>
  String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress || "?";
