/**
 * Прогресс пользователя на сервере — главная копия. Браузер держит только кэш (src/lib/sync.ts).
 * Та же база, что у входа (auth.db): один файл для бэкапа, прогресс удаляется вместе с пользователем.
 *
 *   GET /api/state            → { state: AppState | null }
 *   PUT /api/state { state }  → { state }  — то, что теперь на сервере
 *
 * Присланное сливается с тем, что лежит (core/state.ts mergeStates): слова, дни и свои предложения —
 * по отдельности, личные настройки — по пунктам. Ничего, сделанное на одном устройстве, не затирается другим.
 */
import type { DatabaseSync } from "node:sqlite";
import { mergeStates, parseState, sameState } from "../src/core/state.ts";
import type { AppState } from "../src/core/types.ts";

/** Состояние одного пользователя — десятки КБ; запас на годы занятий. */
export const STATE_MAX_BYTES = 2 * 1024 * 1024;

export const openProgress = (db: DatabaseSync, now: () => number = Date.now) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS progress (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state TEXT NOT NULL,
      upd INTEGER NOT NULL,
      saved_at INTEGER NOT NULL
    );
  `);

  const get = (userId: number): AppState | null => {
    const row = db.prepare("SELECT state FROM progress WHERE user_id = ?").get(userId) as { state: string } | undefined;
    return row ? parseState(row.state) : null;
  };

  return {
    get,
    /** Сливает присланное с тем, что уже лежит. Возвращает итог и изменилось ли что-то на сервере. */
    put(userId: number, s: AppState): { state: AppState; saved: boolean } {
      db.exec("BEGIN IMMEDIATE");
      try {
        const stored = get(userId);
        const merged = stored ? mergeStates(stored, s) : s;
        const saved = !stored || !sameState(stored, merged);
        if (saved)
          db.prepare(
            `INSERT INTO progress (user_id, state, upd, saved_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, upd = excluded.upd, saved_at = excluded.saved_at`,
          ).run(userId, JSON.stringify(merged), merged.upd, now());
        db.exec("COMMIT");
        return { state: merged, saved };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    /** Голоса озвучки, выбранные пользователями (для прогрева). */
    voices: (): string[] => [
      ...new Set(
        (db.prepare("SELECT state FROM progress").all() as { state: string }[]).map((r) => parseState(r.state).settings.voice),
      ),
    ],
    /** Для командной строки: кто когда сохранял. */
    summary: () =>
      db
        .prepare("SELECT u.name, p.upd, p.saved_at, length(p.state) AS bytes, p.state FROM progress p JOIN users u ON u.id = p.user_id ORDER BY u.id")
        .all()
        .map((r) => {
          const row = r as { name: string; upd: number; saved_at: number; bytes: number; state: string };
          const s = parseState(row.state);
          return { name: row.name, upd: row.upd, savedAt: row.saved_at, bytes: row.bytes, words: Object.keys(s.srs).length, days: Object.keys(s.days).length };
        }),
  };
};

export type ProgressStore = ReturnType<typeof openProgress>;

/** Тело PUT → состояние или текст ошибки. */
export const parseStateBody = (raw: string): AppState | string => {
  let body: { state?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return "нужен JSON { state }";
  }
  try {
    const s = parseState(body?.state);
    if (!(s.upd > 0)) return "нет метки времени upd";
    return s;
  } catch (e) {
    return e instanceof Error ? e.message : "неверное состояние";
  }
};
