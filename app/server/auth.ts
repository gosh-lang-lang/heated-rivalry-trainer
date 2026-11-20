/**
 * Вход по passkey (WebAuthn). Регистрации нет: пользователей создаёт `server/cli.ts`,
 * passkey привязывается только по одноразовой ссылке, выданной той же командой.
 *
 *   POST /api/auth/enroll/options { token }            → параметры создания passkey
 *   POST /api/auth/enroll/verify  { token, response }  → passkey сохранён, сессия открыта
 *   POST /api/auth/login/options                       → параметры входа (вызов — в cookie)
 *   POST /api/auth/login/verify   { response }         → сессия открыта
 *   POST /api/auth/logout
 *   GET  /api/auth/me                                  → { user } | 401
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLimiter } from "../src/core/ratelimit.ts";
import { CHALLENGE_TTL_MS, SESSION_TTL_MS, type AuthStore, type User } from "./auth-store.ts";

export interface AuthConfig {
  /** https://heated-rivalry-trainer.spill-the-tea.xyz */
  origin: string;
  /** домен, к которому привязаны passkey */
  rpID: string;
  rpName: string;
  /** https → cookie с префиксом __Host- и флагом Secure */
  secure: boolean;
}

export const authConfigFromEnv = (env = process.env): AuthConfig => {
  const origin = (env.AUTH_ORIGIN ?? "http://localhost:5173").replace(/\/$/, "");
  const u = new URL(origin);
  return { origin, rpID: env.AUTH_RP_ID ?? u.hostname, rpName: "Heated Rivalry", secure: u.protocol === "https:" };
};

type Json = (res: ServerResponse, code: number, body: unknown) => void;

const parseCookies = (req: IncomingMessage): Record<string, string> =>
  Object.fromEntries(
    String(req.headers.cookie ?? "")
      .split(";")
      .map((p) => p.trim().split("="))
      .filter((kv) => kv.length >= 2 && kv[0])
      .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]),
  );

const b64urlToBytes = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

export const createAuth = (store: AuthStore, cfg: AuthConfig, deps: { json: Json; readBody: (req: IncomingMessage) => Promise<string>; clientIp: (req: IncomingMessage) => string }) => {
  const SESSION = cfg.secure ? "__Host-hr_session" : "hr_session";
  const CHALLENGE = cfg.secure ? "__Host-hr_chal" : "hr_chal";
  const attrs = (maxAgeS: number) => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${cfg.secure ? "; Secure" : ""}`;
  const cookie = (name: string, value: string, maxAgeS: number) => `${name}=${encodeURIComponent(value)}; ${attrs(maxAgeS)}`;
  /** перебор ссылок и вызовов — не больше 60 запросов входа за 10 минут с адреса */
  const limiter = createLimiter(60, 10 * 60 * 1000);
  const { json } = deps;

  const startSession = (res: ServerResponse, req: IncomingMessage, user: User, extra: string[] = []) => {
    const token = store.createSession(user.id, String(req.headers["user-agent"] ?? ""));
    res.setHeader("set-cookie", [cookie(SESSION, token, SESSION_TTL_MS / 1000), ...extra]);
  };

  const publicUser = (u: User) => ({ name: u.name, displayName: u.display_name });

  /** Пользователь текущей сессии (и продление cookie, если сессия продлена). */
  const sessionUser = (req: IncomingMessage, res?: ServerResponse): User | undefined => {
    const token = parseCookies(req)[SESSION];
    const s = store.sessionUser(token);
    if (s?.refreshed && res && token) res.setHeader("set-cookie", cookie(SESSION, token, SESSION_TTL_MS / 1000));
    return s?.user;
  };

  /** Запрос пришёл с нашей страницы (защита от CSRF для POST). Без Origin — не браузер, пропускаем. */
  const sameOrigin = (req: IncomingMessage) => {
    const o = req.headers.origin;
    return !o || o === cfg.origin;
  };

  const body = async <T>(req: IncomingMessage): Promise<T | null> => {
    try {
      return JSON.parse(await deps.readBody(req)) as T;
    } catch {
      return null;
    }
  };

  const BAD_LINK = "Ссылка недействительна или устарела — попроси новую.";

  /** Обрабатывает /api/auth/*. Возвращает false, если путь не наш. */
  const handle = async (req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> => {
    if (!path.startsWith("/api/auth/")) return false;
    const route = `${req.method} ${path}`;

    if (route === "GET /api/auth/me") {
      const u = sessionUser(req, res);
      if (!u) return json(res, 401, { error: "нужен вход" }), true;
      return json(res, 200, { user: publicUser(u), passkeys: store.credentialsOf(u.id).length }), true;
    }

    if (req.method !== "POST") return json(res, 405, { error: "метод не поддерживается" }), true;
    if (!sameOrigin(req)) return json(res, 403, { error: "чужой источник запроса" }), true;
    if (!limiter.take(deps.clientIp(req), Date.now())) return json(res, 429, { error: "слишком много попыток, подожди немного" }), true;
    store.cleanup();

    switch (path) {
      case "/api/auth/enroll/options": {
        const b = await body<{ token?: string }>(req);
        const user = b?.token ? store.enrollTokenUser(b.token) : undefined;
        if (!user) return json(res, 400, { error: BAD_LINK }), true;
        const options = await generateRegistrationOptions({
          rpName: cfg.rpName,
          rpID: cfg.rpID,
          userName: user.name,
          userDisplayName: user.display_name,
          userID: b64urlToBytes(user.webauthn_id),
          attestationType: "none",
          excludeCredentials: store.credentialsOf(user.id).map((c) => ({ id: c.id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
          authenticatorSelection: { residentKey: "required", userVerification: "required" },
        });
        store.setEnrollChallenge(b!.token!, options.challenge);
        return json(res, 200, { options, user: publicUser(user) }), true;
      }

      case "/api/auth/enroll/verify": {
        const b = await body<{ token?: string; response?: RegistrationResponseJSON; label?: string }>(req);
        const token = b?.token ?? "";
        const user = store.enrollTokenUser(token);
        const challenge = store.enrollChallenge(token);
        if (!user || !challenge || !b?.response) return json(res, 400, { error: BAD_LINK }), true;
        let v;
        try {
          v = await verifyRegistrationResponse({
            response: b.response,
            expectedChallenge: challenge,
            expectedOrigin: cfg.origin,
            expectedRPID: cfg.rpID,
            requireUserVerification: true,
          });
        } catch (e) {
          return json(res, 400, { error: "Не удалось проверить passkey: " + (e instanceof Error ? e.message : "ошибка") }), true;
        }
        if (!v.verified) return json(res, 400, { error: "Passkey не прошёл проверку" }), true;
        // гасим ссылку атомарно: второй параллельный запрос с той же ссылкой сюда не пройдёт
        if (!store.useEnrollToken(token)) return json(res, 400, { error: BAD_LINK }), true;
        const c = v.registrationInfo.credential;
        store.addCredential({
          id: c.id,
          user_id: user.id,
          public_key: c.publicKey,
          counter: c.counter,
          transports: c.transports ? JSON.stringify(c.transports) : null,
          device_type: v.registrationInfo.credentialDeviceType,
          backed_up: v.registrationInfo.credentialBackedUp ? 1 : 0,
          label: (b.label ?? String(req.headers["user-agent"] ?? "")).slice(0, 120) || null,
        });
        startSession(res, req, user);
        return json(res, 200, { ok: true, user: publicUser(user) }), true;
      }

      case "/api/auth/login/options": {
        const options = await generateAuthenticationOptions({ rpID: cfg.rpID, userVerification: "required" });
        const id = store.createChallenge(options.challenge);
        res.setHeader("set-cookie", cookie(CHALLENGE, id, CHALLENGE_TTL_MS / 1000));
        return json(res, 200, { options }), true;
      }

      case "/api/auth/login/verify": {
        const b = await body<{ response?: AuthenticationResponseJSON }>(req);
        const challenge = store.takeChallenge(parseCookies(req)[CHALLENGE] ?? "");
        const clearChal = cookie(CHALLENGE, "", 0);
        if (!challenge) return res.setHeader("set-cookie", clearChal), json(res, 400, { error: "Вход устарел — нажми ещё раз" }), true;
        const cred = b?.response?.id ? store.credential(b.response.id) : undefined;
        if (!cred || !b?.response) return res.setHeader("set-cookie", clearChal), json(res, 400, { error: "Этот passkey здесь не зарегистрирован" }), true;
        let v;
        try {
          v = await verifyAuthenticationResponse({
            response: b.response,
            expectedChallenge: challenge,
            expectedOrigin: cfg.origin,
            expectedRPID: cfg.rpID,
            credential: {
              id: cred.id,
              publicKey: new Uint8Array(cred.public_key),
              counter: cred.counter,
              transports: cred.transports ? JSON.parse(cred.transports) : undefined,
            },
            requireUserVerification: true,
          });
        } catch (e) {
          return res.setHeader("set-cookie", clearChal), json(res, 400, { error: "Не удалось проверить вход: " + (e instanceof Error ? e.message : "ошибка") }), true;
        }
        if (!v.verified) return res.setHeader("set-cookie", clearChal), json(res, 400, { error: "Вход не подтверждён" }), true;
        store.touchCredential(cred.id, v.authenticationInfo.newCounter);
        const user = store.userById(cred.user_id)!;
        startSession(res, req, user, [clearChal]);
        return json(res, 200, { ok: true, user: publicUser(user) }), true;
      }

      case "/api/auth/logout": {
        const token = parseCookies(req)[SESSION];
        if (token) store.deleteSession(token);
        res.setHeader("set-cookie", cookie(SESSION, "", 0));
        return json(res, 200, { ok: true }), true;
      }
    }
    return json(res, 404, { error: "нет такого метода" }), true;
  };

  return { handle, sessionUser, sameOrigin, cookieNames: { SESSION, CHALLENGE } };
};

export type Auth = ReturnType<typeof createAuth>;
