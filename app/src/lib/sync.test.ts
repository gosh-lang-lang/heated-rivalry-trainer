import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setClock } from "../core/dates";
import { changeSetting, emptyState, mergeStates } from "../core/state";
import type { AppState, SessionResult } from "../core/types";
import { createSync, KEEPALIVE_MAX_BYTES, pushBody, type SyncApi } from "./sync";

describe("pushBody", () => {
  it("небольшой прогресс при уходе из приложения — keepalive", () => {
    expect(pushBody({ ...emptyState(), upd: 1 }, true).keepalive).toBe(true);
  });
  it("прогресс крупнее предела браузера для keepalive (64 КБ) — обычным запросом, иначе он не уйдёт вовсе", () => {
    const s = { ...emptyState(), upd: 1 };
    for (let i = 0; i < 1500; i++) s.srs[`word-${i}`] = { lvl: 3, due: "2027-01-12", intro: "2026-11-20", right: 7, wrong: 2 };
    const r = pushBody(s, true);
    expect(new Blob([r.body]).size).toBeGreaterThan(KEEPALIVE_MAX_BYTES);
    expect(r.keepalive).toBe(false);
  });
  it("без просьбы — не keepalive", () => {
    expect(pushBody({ ...emptyState(), upd: 1 }, false).keepalive).toBe(false);
  });
});

/* ---------- синхронизация (createSync) с подставным сервером ---------- */

const word = (lvl: number) => ({ lvl, due: "2026-11-22", intro: "2026-11-20", right: lvl, wrong: 0 });
const result = (srv?: number): SessionResult => ({ score: 5, total: 6, mins: 7, newN: 2, at: "2026-11-20T08:00:00.000Z", ...(srv ? { srv } : {}) });
const withTz = (s: AppState): AppState => ({ ...s, tz: "Europe/Moscow", tzAt: 1 });

/** Сервер в памяти: PUT сливает (как server/progress.ts, без раскладки дней), GET отдаёт; ответы можно задерживать. */
const fakeServer = (initial: AppState | null = null) => {
  let stored = initial;
  const pushes: { state: AppState; keepalive: boolean }[] = [];
  let gets = 0;
  let hold: (() => void) | null = null;
  let down = false;
  const api: SyncApi = {
    fetchRemote: async () => {
      gets++;
      return down ? undefined : stored;
    },
    pushRemote: async (s, keepalive) => {
      pushes.push({ state: s, keepalive });
      if (hold) await new Promise<void>((r) => (hold = r));
      if (down) return undefined;
      stored = withTz(stored ? mergeStates(stored, s) : s);
      return stored;
    },
  };
  return {
    api,
    pushes,
    get gets() {
      return gets;
    },
    get stored() {
      return stored;
    },
    set stored(s: AppState | null) {
      stored = s;
    },
    /** следующий PUT повиснет до release() */
    holdNext: () => (hold = () => {}),
    release: () => {
      const r = hold;
      hold = null;
      r?.();
    },
    setDown: (v: boolean) => (down = v),
  };
};

/** Устройство: текущий прогресс, принятые с сервера копии, идёт ли занятие. */
const device = (s: AppState) => {
  const d = { state: s, paused: false, adopted: [] as AppState[], clock: 0 };
  return {
    d,
    deps: {
      current: () => d.state,
      adopt: (n: AppState) => {
        d.adopted.push(n);
        d.state = n;
      },
      paused: () => d.paused,
      onClock: () => d.clock++,
    },
  };
};
const flushAsync = () => new Promise((r) => setTimeout(r, 0));

describe("createSync", () => {
  beforeEach(() => setClock({ offset: 0 }));
  afterEach(() => vi.useRealTimers());

  it("ничего не меняли (upd 0) — не отправляем", async () => {
    const srv = fakeServer();
    const { deps } = device(emptyState());
    await createSync(deps, srv.api).push();
    expect(srv.pushes).toHaveLength(0);
  });

  it("пока идёт отправка, новые изменения ждут и уходят одной отправкой — самые свежие", async () => {
    const srv = fakeServer();
    const { d, deps } = device(withTz({ ...emptyState(), upd: 1, srs: { a: word(1) } }));
    const sync = createSync(deps, srv.api);
    srv.holdNext();
    const first = sync.push();
    d.state = { ...d.state, upd: 2, srs: { ...d.state.srs, b: word(1) } };
    void sync.push();
    d.state = { ...d.state, upd: 3, srs: { ...d.state.srs, c: word(1) } };
    void sync.push();
    expect(srv.pushes).toHaveLength(1);
    srv.release();
    await first;
    await flushAsync();
    expect(srv.pushes).toHaveLength(2);
    expect(Object.keys(srv.pushes[1].state.srs).sort()).toEqual(["a", "b", "c"]);
    expect(srv.stored!.srs.c).toEqual(word(1));
  });

  it("отложенная отправка: десять изменений подряд — одна отправка через 800 мс", async () => {
    vi.useFakeTimers();
    const srv = fakeServer();
    const { deps } = device(withTz({ ...emptyState(), upd: 5 }));
    const sync = createSync(deps, srv.api);
    for (let i = 0; i < 10; i++) sync.schedule();
    await vi.advanceTimersByTimeAsync(799);
    expect(srv.pushes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(srv.pushes).toHaveLength(1);
    expect(srv.pushes[0].keepalive).toBe(false);
  });

  it("уходим из приложения: отложенное уходит сразу и keepalive; без отложенного — ничего", async () => {
    vi.useFakeTimers();
    const srv = fakeServer();
    const { deps } = device(withTz({ ...emptyState(), upd: 5 }));
    const sync = createSync(deps, srv.api);
    sync.flush();
    expect(srv.pushes).toHaveLength(0);
    sync.schedule();
    sync.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(srv.pushes).toEqual([expect.objectContaining({ keepalive: true })]);
    await vi.advanceTimersByTimeAsync(1000); // таймер снят — второй отправки нет
    expect(srv.pushes).toHaveLength(1);
  });

  it("на сервере новее (занимались на другом устройстве) — принимаем слитое", async () => {
    const other = withTz({ ...emptyState(), upd: 9, srs: { a: word(3), b: word(2) } });
    const srv = fakeServer(other);
    const { d, deps } = device(withTz({ ...emptyState(), upd: 4, srs: { a: word(1) } }));
    await createSync(deps, srv.api).pull();
    expect(d.state.srs).toEqual(other.srs);
    expect(srv.pushes).toHaveLength(0); // у сервера всё есть
  });

  it("посреди занятия с сервера берём только настройки — прогресс занятия не подменяем", async () => {
    const other = withTz(changeSetting({ ...emptyState(), upd: 9, srs: { a: word(3) } }, "voice", "bf_emma", 9));
    const srv = fakeServer(other);
    const mine = withTz({ ...emptyState(), upd: 4, srs: { a: word(1) } });
    const { d, deps } = device(mine);
    d.paused = true;
    await createSync(deps, srv.api).pull();
    expect(d.state.settings.voice).toBe("bf_emma");
    expect(d.state.srs).toEqual(mine.srs);
  });

  it("у устройства есть то, чего нет на сервере (занимались без сети), — после забора отправляем", async () => {
    const srv = fakeServer(withTz({ ...emptyState(), upd: 3, srs: { a: word(1) } }));
    const { deps } = device(withTz({ ...emptyState(), upd: 8, srs: { a: word(1), b: word(2) } }));
    await createSync(deps, srv.api).pull();
    await flushAsync();
    expect(srv.pushes).toHaveLength(1);
    expect(srv.stored!.srs.b).toEqual(word(2));
  });

  it("есть итог, который сервер ещё не раскладывал по дням, — сначала отправка, а не забор", async () => {
    const srv = fakeServer();
    const { d, deps } = device(withTz({ ...emptyState(), upd: 6, days: { "2026-11-20": { morning: result() } } }));
    await createSync(deps, srv.api).pull();
    expect(srv.pushes).toHaveLength(1);
    expect(srv.gets).toBe(0);
    // посреди занятия — обычный забор (раскладка подождёт отправки после занятия)
    d.paused = true;
    await createSync(deps, srv.api).pull();
    expect(srv.gets).toBe(1);
  });

  it("сервер недоступен — прогресс устройства не трогаем и не теряем", async () => {
    const srv = fakeServer();
    srv.setDown(true);
    const mine = withTz({ ...emptyState(), upd: 8, srs: { a: word(2) }, days: { "2026-11-20": { morning: result(1) } } });
    const { d, deps } = device(mine);
    const sync = createSync(deps, srv.api);
    await sync.pull();
    await sync.push();
    expect(d.adopted).toHaveLength(0);
    expect(d.state).toBe(mine);
  });

  it("часы сервера заметно сдвинулись за время запроса — приложение пересчитывает «сегодня»", async () => {
    const srv = fakeServer();
    const api: SyncApi = {
      ...srv.api,
      fetchRemote: async () => {
        setClock({ offset: 3 * 3600_000 }); // как learnClock по ответу сервера
        return null;
      },
    };
    const { d, deps } = device(withTz({ ...emptyState(), upd: 0 }));
    await createSync(deps, api).pull();
    expect(d.clock).toBe(1);
  });
});
