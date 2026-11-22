// с расширением .ts: модуль запускает и сервер (node без сборки)
import { CARRY_DAYS } from "./curriculum.ts";
import { addDays, dayIn, daysBetween } from "./dates.ts";
import { interval } from "./srs.ts";
import { eachResult, emptyState, mergeStates, putResult, resultId } from "./state.ts";
import type { AppState, SessionResult } from "./types";

/*
 * Какой день у занятия — решает сервер, а не часы устройства.
 *
 * Устройство пишет итог части урока в state.days под своим днём и с `at` — временем по своим часам (поправленным
 * на сервер, core/dates.ts setClock). Сервер этому не верит: на итог, которого у него ещё не было, он ставит свою
 * метку srv (trustedTime) и сам выбирает день — srv в поясе пользователя (state.tz). Уже подтверждённые итоги
 * (есть в сохранённой копии) берутся из неё: ни день, ни метку прислать заново нельзя.
 *  - часть 1 и «ещё 6 новых» — день srv;
 *  - часть 2 — день урока (день её части 1), если он не позже дня srv и не раньше его на CARRY_DAYS
 *    (перенесённая часть 2 пишется в день урока), иначе — день srv; srv части 2 не раньше srv её части 1
 *    (обе части без сети: часть 1 старше 48 часов, часть 2 — нет — урок не разъезжается по двум дням);
 *  - слова: даты знакомства и повтора не позже, чем позволяет сегодня сервера (clampWords).
 */

/** Часть 2 переносится на следующий день — если урок был не раньше стольких дней назад (core/lesson.ts carriedDay). */
export { CARRY_DAYS } from "./curriculum.ts";

/** Насколько старый `at` сервер принимает: занимались без сети и отправили позже. */
export const OFFLINE_MS = 48 * 3600_000;

/**
 * Время, по которому сервер считает день итога: `at` устройства, если оно не в будущем и не старше OFFLINE_MS
 * по часам сервера, иначе — сейчас (когда сервер получил итог). Честное занятие без сети не теряется,
 * а переведённые часы не переносят занятие в другой день дальше, чем на двое суток назад.
 */
export const trustedTime = (at: string, now: number): number => {
  const t = Date.parse(at);
  return Number.isFinite(t) && t <= now && t >= now - OFFLINE_MS ? t : now;
};

/** Есть итоги, которых сервер ещё не видел (без srv). */
export const hasPending = (s: AppState): boolean => eachResult(s.days).some(([, , r]) => r.srv === undefined);

/**
 * Итоги, сохранённые до серверных дней: метка srv — их `at` (день остаётся тем, где он записан: серии и номера
 * уроков не меняются). Не разобрать время — 0.
 */
export const confirmLegacy = (s: AppState): AppState => {
  if (!hasPending(s)) return s;
  const stamp = (r: SessionResult): SessionResult => (r.srv !== undefined ? r : { ...r, srv: Math.max(0, Date.parse(r.at) || 0) });
  const days: AppState["days"] = {};
  for (const [k, d] of Object.entries(s.days))
    days[k] = { ...d, ...(d.morning && { morning: stamp(d.morning) }), ...(d.evening && { evening: stamp(d.evening) }), ...(d.extra && { extra: d.extra.map(stamp) }) };
  return { ...s, days };
};

export interface ServerClock {
  /** часы сервера, UTC ms */
  now: number;
  /** пояс пользователя (IANA) */
  tz: string;
  /** редкое ли слово (у редких интервалы длиннее); нет — граница по редким, она шире */
  rare?: (id: string) => boolean;
}

const stripSrv = (r: SessionResult): SessionResult => {
  const { srv: _, ...rest } = r;
  return rest;
};

/**
 * Принять копию с устройства: слить с сохранённой (stored; null — первая) так, чтобы дни решал сервер.
 * Пояс (tz, tzAt) и метка сброса остаются серверными; присланные метки srv не принимаются.
 */
export const acceptState = (stored: AppState | null, incoming: AppState, clock: ServerClock): AppState => {
  const base = stored ? confirmLegacy(stored) : null;
  const { now, tz } = clock;
  const today = dayIn(now, tz);

  // что сервер уже подтвердил: «имя» итога → где лежит и с какой меткой
  const known = new Map<string, { day: string; r: SessionResult }>();
  for (const [day, kind, r] of eachResult(base?.days ?? {})) known.set(resultId(kind, r), { day, r });

  const days: AppState["days"] = {};
  const placed = new Map<string, { day: string; srv: number }>(); // «имя» итога части 1 → его день и метка у сервера
  const moved = new Map<string, string>(); // день устройства → день сервера для новых частей 1 и «ещё 6»
  const place = (k: string, kind: "morning" | "extra", r: SessionResult) => {
    const id = resultId(kind, r);
    const hit = known.get(id);
    let day: string, srv: number;
    if (hit) putResult(days, (day = hit.day), kind, hit.r), (srv = hit.r.srv ?? 0);
    else {
      srv = trustedTime(r.at, now);
      putResult(days, (day = dayIn(srv, tz)), kind, { ...stripSrv(r), srv });
      if (day !== k && (kind === "morning" || !moved.has(k))) moved.set(k, day);
    }
    placed.set(id, { day, srv });
  };
  // сначала части 1 и «ещё 6»: часть 2 привязана к дню своей части 1
  for (const [k, d] of Object.entries(incoming.days)) {
    if (d.morning) place(k, "morning", d.morning);
    for (const r of d.extra ?? []) place(k, "extra", r);
  }
  const hasMorning = (k: string) => !!days[k]?.morning || !!base?.days[k]?.morning;
  for (const [k, d] of Object.entries(incoming.days)) {
    let day = k;
    if (d.evening) {
      const hit = known.get(resultId("evening", d.evening));
      if (hit) putResult(days, (day = hit.day), "evening", hit.r);
      else {
        const part1 = d.morning ? placed.get(resultId("morning", d.morning))! : null;
        const srv = Math.max(trustedTime(d.evening.at, now), part1?.srv ?? 0);
        const done = dayIn(srv, tz);
        const lesson = part1?.day ?? k;
        day = lesson <= done && lesson >= addDays(done, -CARRY_DAYS) && hasMorning(lesson) ? lesson : done;
        putResult(days, day, "evening", { ...stripSrv(d.evening), srv });
      }
    }
    // «перечитал» — туда же, куда легла часть 2 этого дня; будущие дни (часы устройства впереди) не принимаются
    if (d.reread && day <= today) (days[day] ??= {}).reread = true;
  }

  const reset = base ? Math.min(incoming.reset, base.reset) : 0; // сбрасывает прогресс только сервер (progress:reset)
  const own = { ...incoming, reset, days, tz: base?.tz ?? "", tzAt: base?.tzAt ?? 0 };
  const merged = mergeStates(base ?? emptyState(), own);
  const srs = clampWords(merged.srs, base?.srs ?? {}, moved, today, clock.rare);
  // сервер поправил даты слов — его копия строго новее присланной: иначе при равном upd устройство при слиянии
  // оставило бы свои даты (кто «новее», решал бы порядок строк), и копии не сошлись бы никогда
  const changed = Object.keys(srs).some((id) => srs[id] !== merged.srs[id]);
  return changed ? { ...merged, srs, upd: merged.upd + 1 } : { ...merged, srs };
};

/**
 * Даты слов, изменённых этой копией (у сервера было иначе или не было), — от сегодня сервера:
 *  - слово знакомилось в части урока, которую сервер переложил в другой день, — день знакомства тот же, что у части,
 *    дата повтора сдвигается вместе с ним;
 *  - знакомство не позже сегодня, повтор не позже сегодня + интервал уровня слова.
 * Раньше — можно: это только приближает повторение.
 */
export const clampWords = (
  srs: AppState["srs"],
  before: AppState["srs"],
  moved: ReadonlyMap<string, string>,
  today: string,
  rare: (id: string) => boolean = () => true,
): AppState["srs"] => {
  const out: AppState["srs"] = {};
  for (const [id, w] of Object.entries(srs)) {
    const old = before[id];
    if (old && old.lvl === w.lvl && old.due === w.due && old.intro === w.intro && old.right === w.right && old.wrong === w.wrong) {
      out[id] = w;
      continue;
    }
    let { intro, due } = w;
    const to = intro && !old?.intro ? moved.get(intro) : undefined;
    if (to) {
      if (due) due = addDays(due, daysBetween(intro, to));
      intro = to;
    }
    if (intro > today) intro = today;
    const max = addDays(today, interval(w.lvl, rare(id)) ?? 0);
    if (due > max) due = max;
    out[id] = intro === w.intro && due === w.due ? w : { ...w, intro, due };
  }
  return out;
};
