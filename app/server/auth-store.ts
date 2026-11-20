/**
 * Хранилище входа: пользователи, passkey, одноразовые ссылки привязки, вызовы WebAuthn, сессии.
 * SQLite (node:sqlite). Секреты (токены ссылок и сессий) храним только как SHA-256 — утечка базы не даёт войти.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DeviceHint } from "../src/core/device.ts";

export const ENROLL_TTL_MS = 15 * 60 * 1000;
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Сессию продлеваем, когда до конца осталось меньше этого. */
const SESSION_REFRESH_MS = 15 * 24 * 60 * 60 * 1000;
/** «Когда был» обновляем не чаще раза в 5 минут — не пишем в базу на каждый запрос. */
export const SEEN_EVERY_MS = 5 * 60 * 1000;

/** Открытый id сессии для списка устройств: начало SHA-256 токена (в базе и так лежит только хэш) — по нему токен не восстановить. */
export const sessionIdOf = (token: string) => sha256(token).slice(0, 16);
const SESSION_ID_RE = /^[0-9a-f]{16}$/;

/** Подсказка браузера в колонке sessions.device: «t» — сенсорный экран, «s» — установленное приложение, «-» — ни того ни другого. */
export const encodeHint = (h: DeviceHint) => (h.touch ? "t" : "") + (h.standalone ? "s" : "") || "-";
export const decodeHint = (d: string | null): DeviceHint | null => (d ? { touch: d.includes("t"), standalone: d.includes("s") } : null);

export interface SessionRow {
  /** sessionIdOf(токен) */
  id: string;
  created_at: number;
  last_seen_at: number;
  user_agent: string | null;
  device: string | null;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export interface User {
  id: number;
  name: string;
  display_name: string;
  /** base64url — userID для WebAuthn (не раскрывает внутренний id) */
  webauthn_id: string;
}

export interface Credential {
  id: string;
  user_id: number;
  public_key: Uint8Array;
  counter: number;
  transports: string | null;
  device_type: string;
  backed_up: number;
  label: string | null;
  created_at: number;
  last_used_at: number | null;
}

export const openAuthStore = (path: string, now: () => number = Date.now) => {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      webauthn_id TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key BLOB NOT NULL,
      counter INTEGER NOT NULL,
      transports TEXT,
      device_type TEXT NOT NULL,
      backed_up INTEGER NOT NULL,
      label TEXT,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS enroll_tokens (
      hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      challenge TEXT
    );
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      challenge TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      user_agent TEXT,
      last_seen_at INTEGER,
      device TEXT
    );
  `);
  // базы до списка устройств: в sessions не было last_seen_at и device
  // (сервер и cli.ts могут открыть старую базу одновременно — «колонка уже есть» не ошибка)
  const addColumn = (table: string, col: string, sql: string) => {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (cols.includes(col)) return;
    try {
      db.exec(sql);
    } catch (e) {
      if (!String(e).includes("duplicate column")) throw e;
    }
  };
  addColumn("sessions", "last_seen_at", "ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER; UPDATE sessions SET last_seen_at = created_at;");
  addColumn("sessions", "device", "ALTER TABLE sessions ADD COLUMN device TEXT");

  const cleanup = () => {
    const t = now();
    db.prepare("DELETE FROM challenges WHERE expires_at < ?").run(t);
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(t);
    db.prepare("DELETE FROM enroll_tokens WHERE expires_at < ? AND used_at IS NULL").run(t - 24 * 3600 * 1000);
  };

  const userByName = (name: string) => db.prepare("SELECT * FROM users WHERE name = ?").get(name) as User | undefined;
  const userById = (id: number) => db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;

  return {
    db,
    cleanup,

    /* ---------- пользователи (только из командной строки) ---------- */
    addUser(name: string, displayName = name): User {
      if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(name)) throw new Error("имя: 2–32 символа, латиница в нижнем регистре, цифры, . _ -");
      if (userByName(name)) throw new Error(`пользователь ${name} уже есть`);
      db.prepare("INSERT INTO users (name, display_name, webauthn_id, created_at) VALUES (?, ?, ?, ?)").run(name, displayName, randomToken(16), now());
      return userByName(name)!;
    },
    userByName,
    userById,
    listUsers: () => db.prepare("SELECT * FROM users ORDER BY id").all() as unknown as User[],
    removeUser: (name: string) => db.prepare("DELETE FROM users WHERE name = ?").run(name).changes > 0,

    /* ---------- одноразовые ссылки привязки ---------- */
    /** Возвращает сам токен (показывается один раз); в базе — только хэш. */
    createEnrollToken(userId: number, ttlMs = ENROLL_TTL_MS): string {
      const token = randomToken();
      db.prepare("INSERT INTO enroll_tokens (hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, now() + ttlMs);
      return token;
    },
    /** Действующая (не просроченная и не использованная) ссылка → пользователь. */
    enrollTokenUser(token: string): User | undefined {
      if (typeof token !== "string" || token.length < 20 || token.length > 100) return undefined;
      const row = db.prepare("SELECT user_id FROM enroll_tokens WHERE hash = ? AND used_at IS NULL AND expires_at > ?").get(sha256(token), now()) as
        | { user_id: number }
        | undefined;
      return row ? userById(row.user_id) : undefined;
    },
    setEnrollChallenge(token: string, challenge: string) {
      db.prepare("UPDATE enroll_tokens SET challenge = ? WHERE hash = ?").run(challenge, sha256(token));
    },
    enrollChallenge(token: string): string | undefined {
      const row = db.prepare("SELECT challenge FROM enroll_tokens WHERE hash = ? AND used_at IS NULL AND expires_at > ?").get(sha256(token), now()) as
        | { challenge: string | null }
        | undefined;
      return row?.challenge ?? undefined;
    },
    /** Погасить ссылку. true — если она была действующей (защита от двойного использования). */
    useEnrollToken(token: string): boolean {
      return db.prepare("UPDATE enroll_tokens SET used_at = ? WHERE hash = ? AND used_at IS NULL AND expires_at > ?").run(now(), sha256(token), now()).changes === 1;
    },

    /* ---------- passkey ---------- */
    addCredential(c: Omit<Credential, "created_at" | "last_used_at">) {
      db.prepare(
        "INSERT INTO credentials (id, user_id, public_key, counter, transports, device_type, backed_up, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(c.id, c.user_id, c.public_key, c.counter, c.transports, c.device_type, c.backed_up, c.label, now());
    },
    credential: (id: string) => db.prepare("SELECT * FROM credentials WHERE id = ?").get(id) as Credential | undefined,
    credentialsOf: (userId: number) => db.prepare("SELECT * FROM credentials WHERE user_id = ? ORDER BY created_at").all(userId) as unknown as Credential[],
    allCredentials: () =>
      db.prepare("SELECT c.*, u.name AS user_name FROM credentials c JOIN users u ON u.id = c.user_id ORDER BY c.created_at").all() as unknown as (Credential & {
        user_name: string;
      })[],
    /** Для настроек: сколько passkey и сколько из них синхронизируются (связка ключей iCloud и т. п.). */
    passkeySummary(userId: number): { count: number; synced: number } {
      const r = db.prepare("SELECT count(*) AS n, COALESCE(sum(backed_up), 0) AS s FROM credentials WHERE user_id = ?").get(userId) as { n: number; s: number };
      return { count: Number(r.n), synced: Number(r.s) };
    },
    touchCredential(id: string, counter: number) {
      db.prepare("UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?").run(counter, now(), id);
    },
    removeCredential: (id: string) => db.prepare("DELETE FROM credentials WHERE id = ?").run(id).changes > 0,

    /* ---------- вызовы входа ---------- */
    createChallenge(challenge: string): string {
      const id = randomToken(18);
      db.prepare("INSERT INTO challenges (id, challenge, expires_at) VALUES (?, ?, ?)").run(id, challenge, now() + CHALLENGE_TTL_MS);
      return id;
    },
    /** Забрать вызов (одноразово). */
    takeChallenge(id: string): string | undefined {
      if (typeof id !== "string" || !id) return undefined;
      const row = db.prepare("SELECT challenge FROM challenges WHERE id = ? AND expires_at > ?").get(id, now()) as { challenge: string } | undefined;
      db.prepare("DELETE FROM challenges WHERE id = ?").run(id);
      return row?.challenge;
    },

    /* ---------- сессии ---------- */
    createSession(userId: number, userAgent = ""): string {
      const token = randomToken();
      const t = now();
      db.prepare("INSERT INTO sessions (hash, user_id, created_at, expires_at, user_agent, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        sha256(token),
        userId,
        t,
        t + SESSION_TTL_MS,
        userAgent.slice(0, 200),
        t,
      );
      return token;
    },
    /**
     * Пользователь по токену сессии; продлевает сессию, если она скоро истечёт,
     * и отмечает «когда был» (не чаще SEEN_EVERY_MS).
     */
    sessionUser(token: string | undefined): { user: User; refreshed: boolean } | undefined {
      if (!token || token.length > 100) return undefined;
      const h = sha256(token),
        t = now();
      const row = db.prepare("SELECT user_id, expires_at, last_seen_at FROM sessions WHERE hash = ? AND expires_at > ?").get(h, t) as
        | { user_id: number; expires_at: number; last_seen_at: number | null }
        | undefined;
      if (!row) return undefined;
      const user = userById(row.user_id);
      if (!user) return undefined;
      const refreshed = row.expires_at - t < SESSION_REFRESH_MS;
      const seen = row.last_seen_at === null || t - row.last_seen_at >= SEEN_EVERY_MS;
      if (refreshed || seen)
        db.prepare("UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE hash = ?").run(
          refreshed ? t + SESSION_TTL_MS : row.expires_at,
          seen ? t : row.last_seen_at,
          h,
        );
      return { user, refreshed };
    },
    /**
     * Подсказка браузера о себе (сенсорный экран, установленное приложение) и свежий User-Agent для текущей сессии.
     * Пишет, только если что-то изменилось. false — сессии нет.
     */
    setSessionDevice(token: string, userAgent: string, hint: DeviceHint): boolean {
      const h = sha256(token);
      const row = db.prepare("SELECT user_agent, device FROM sessions WHERE hash = ? AND expires_at > ?").get(h, now()) as
        | { user_agent: string | null; device: string | null }
        | undefined;
      if (!row) return false;
      const ua = userAgent.slice(0, 200),
        d = encodeHint(hint);
      if (row.user_agent !== ua || row.device !== d) db.prepare("UPDATE sessions SET user_agent = ?, device = ? WHERE hash = ?").run(ua, d, h);
      return true;
    },
    /** Действующие сессии пользователя — устройства, где выполнен вход; недавние первыми. */
    sessionsOf: (userId: number) =>
      db
        .prepare(
          "SELECT substr(hash, 1, 16) AS id, created_at, COALESCE(last_seen_at, created_at) AS last_seen_at, user_agent, device FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC, created_at DESC",
        )
        .all(userId, now()) as unknown as SessionRow[],
    /** Завершить сессию по открытому id — только свою (userId). true — была такая. */
    revokeSession(userId: number, id: string): boolean {
      if (typeof id !== "string" || !SESSION_ID_RE.test(id)) return false;
      return db.prepare("DELETE FROM sessions WHERE user_id = ? AND substr(hash, 1, 16) = ?").run(userId, id).changes > 0;
    },
    /** Завершить все сессии пользователя, кроме этой. Сколько завершено. */
    revokeOtherSessions: (userId: number, keepToken: string) =>
      Number(db.prepare("DELETE FROM sessions WHERE user_id = ? AND hash <> ?").run(userId, sha256(keepToken)).changes),
    deleteSession: (token: string) => db.prepare("DELETE FROM sessions WHERE hash = ?").run(sha256(token)),
    deleteSessionsOf: (userId: number) => db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId).changes,
    countSessions: (userId: number) => (db.prepare("SELECT count(*) n FROM sessions WHERE user_id = ? AND expires_at > ?").get(userId, now()) as { n: number }).n,
  };
};

export type AuthStore = ReturnType<typeof openAuthStore>;
