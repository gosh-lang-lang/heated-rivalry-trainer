/**
 * Прогресс пользователя на сервере — главная копия. Браузер держит только кэш (src/lib/sync.ts).
 * Та же база, что у входа (auth.db): один файл для бэкапа, прогресс удаляется вместе с пользователем.
 *
 *   GET /api/state                → { state: AppState | null, now }
 *   PUT /api/state { state, tz? } → { state, now }  — то, что теперь на сервере
 *   PUT /api/tz { tz }            → { state, now } | 429 { error, next }  — сменить часовой пояс уроков
 * now — часы сервера (ms): по ним устройство считает «сегодня» (core/dates.ts setClock).
 *
 * Присланное сливается с тем, что лежит (core/state.ts mergeStates): слова и дни —
 * по отдельности, личные настройки — по пунктам. Ничего, сделанное на одном устройстве, не затирается другим.
 * Какой день у пройденной части урока, решает сервер — по своим часам и поясу пользователя (core/serverday.ts
 * acceptState), а не по дню и времени, которые прислало устройство.
 *
 * Пояс пользователя (state.tz) — только серверный: при первой синхронизации — пояс устройства (tz в теле PUT),
 * дальше — только явно (PUT /api/tz) и не чаще раза в TZ_CHANGE_MS. Пока пояса нет — DEFAULT_TZ.
 */
import type { DatabaseSync } from "node:sqlite";
import { isTimeZone } from "../src/core/dates.ts";
import { acceptState, confirmLegacy } from "../src/core/serverday.ts";
import { emptyState, parseState, resetProgress, sameState } from "../src/core/state.ts";
import type { AppState } from "../src/core/types.ts";

/** Состояние одного пользователя — десятки КБ; запас на годы занятий. */
export const STATE_MAX_BYTES = 2 * 1024 * 1024;

/** Пояс, пока пользователь его не прислал (старая версия приложения): у обоих пользователей — Москва. */
export const DEFAULT_TZ = process.env.DEFAULT_TZ && isTimeZone(process.env.DEFAULT_TZ) ? process.env.DEFAULT_TZ : "Europe/Moscow";
/** Менять пояс — не чаще раза в сутки: иначе смена пояса сдвигала бы день, как перевод часов. */
export const TZ_CHANGE_MS = 24 * 3600_000;

export interface ProgressOptions {
  /** часы сервера (тесты подставляют свои) */
  now?: () => number;
  /** редкое ли слово (интервалы вдвое длиннее) — граница дат повтора в acceptState */
  rare?: (id: string) => boolean;
}

export const openProgress = (db: DatabaseSync, opts: ProgressOptions | (() => number) = {}) => {
  const { now = Date.now, rare } = typeof opts === "function" ? { now: opts } : opts;
  db.exec(`
    CREATE TABLE IF NOT EXISTS progress (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state TEXT NOT NULL,
      upd INTEGER NOT NULL,
      saved_at INTEGER NOT NULL
    );
  `);

  const read = (userId: number): AppState | null => {
    const row = db.prepare("SELECT state FROM progress WHERE user_id = ?").get(userId) as { state: string } | undefined;
    return row ? parseState(row.state) : null;
  };
  const write = (userId: number, s: AppState) =>
    db
      .prepare(
        `INSERT INTO progress (user_id, state, upd, saved_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, upd = excluded.upd, saved_at = excluded.saved_at`,
      )
      .run(userId, JSON.stringify(s), s.upd, now());
  const tx = <T>(f: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const r = f();
      db.exec("COMMIT");
      return r;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };

  return {
    /** Сохранённое (итоги, записанные до серверных дней, — подтверждёнными, core/serverday.ts confirmLegacy). */
    get: (userId: number): AppState | null => {
      const s = read(userId);
      return s && confirmLegacy(s);
    },
    now,
    /**
     * Сливает присланное с тем, что уже лежит; дни новых частей урока решает сервер (acceptState).
     * deviceTz — пояс устройства: берётся, только если у пользователя пояса ещё нет.
     * Возвращает итог и изменилось ли что-то на сервере.
     */
    put(userId: number, s: AppState, deviceTz?: string): { state: AppState; saved: boolean } {
      return tx(() => {
        const t = now();
        const before = read(userId);
        let stored = before;
        if (!stored?.tz && isTimeZone(deviceTz)) stored = { ...(stored ?? emptyState()), tz: deviceTz, tzAt: t };
        const merged = acceptState(stored, s, { now: t, tz: stored?.tz || DEFAULT_TZ, rare });
        const saved = !before || !sameState(before, merged);
        if (saved) write(userId, merged);
        return { state: merged, saved };
      });
    },
    /**
     * Сменить пояс уроков (явно, из настроек). Тот же пояс — ничего не меняется. Прошло меньше TZ_CHANGE_MS
     * с прошлой смены (или с первой записи) — отказ и когда можно (next, ms). Уже пройденные дни остаются, где были.
     */
    setTz(userId: number, tz: string): { state: AppState } | { error: string; next?: number } {
      if (!isTimeZone(tz)) return { error: "неизвестный часовой пояс" };
      return tx(() => {
        const t = now();
        const stored = read(userId) ?? emptyState();
        if (stored.tz === tz) return { state: confirmLegacy(stored) };
        if (stored.tz && t - stored.tzAt < TZ_CHANGE_MS) return { error: "часовой пояс можно менять раз в сутки", next: stored.tzAt + TZ_CHANGE_MS };
        const next = { ...stored, tz, tzAt: t };
        write(userId, next);
        return { state: confirmLegacy(next) };
      });
    },
    /**
     * Сбросить прогресс пользователя (слова, дни, предложения), настройки оставить. Метка reset — устройства с кэшем
     * до сброса при синхронизации получат пустой прогресс, а не вернут свой (core/state.ts mergeStates).
     */
    reset(userId: number): AppState {
      const next = resetProgress(read(userId) ?? emptyState(), now());
      write(userId, next);
      return next;
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
          return { name: row.name, upd: row.upd, savedAt: row.saved_at, bytes: row.bytes, words: Object.keys(s.srs).length, days: Object.keys(s.days).length, tz: s.tz };
        }),
  };
};

export type ProgressStore = ReturnType<typeof openProgress>;

/** Тело PUT → состояние (и пояс устройства, если прислан и верный) или текст ошибки. */
export const parseStateBody = (raw: string): { state: AppState; tz?: string } | string => {
  let body: { state?: unknown; tz?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return "нужен JSON { state }";
  }
  try {
    const s = parseState(body?.state);
    if (!(s.upd > 0)) return "нет метки времени upd";
    return isTimeZone(body.tz) ? { state: s, tz: body.tz } : { state: s };
  } catch (e) {
    return e instanceof Error ? e.message : "неверное состояние";
  }
};
