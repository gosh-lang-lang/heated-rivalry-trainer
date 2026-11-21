import { describe, expect, it } from "vitest";
import { addDays, dayIn } from "./dates";
import { acceptState, CARRY_DAYS, clampWords, confirmLegacy, hasPending, OFFLINE_MS, trustedTime } from "./serverday";
import { emptyState, mergeStates, sameState } from "./state";
import { streak } from "./srs";
import type { AppState, DayLog, SessionResult } from "./types";

/*
 * День занятия решает сервер (core/serverday.ts): часы и пояс устройства не двигают день.
 * Сервер в тестах — Москва, 21.11.2026 12:00, если не сказано иначе.
 */

const MSK = "Europe/Moscow";
const NY = "America/New_York";
const at = (iso: string) => new Date(iso).toISOString();
const msk = (day: string, hm: string) => at(`${day}T${hm}:00+03:00`);
const NOW = Date.parse(msk("2026-11-21", "12:00"));
const res = (iso: string, p: Partial<SessionResult> = {}): SessionResult => ({ score: 30, total: 38, mins: 15, newN: 12, at: iso, ...p });
const st = (days: AppState["days"], p: Partial<AppState> = {}): AppState => ({ ...emptyState(), upd: 100, days, ...p });
const clock = (now = NOW, tz = MSK) => ({ now, tz });
/** Сервер принял копию устройства (на сервере было stored). */
const accept = (incoming: AppState, stored: AppState | null = null, c = clock()) => acceptState(stored, incoming, c);
const keys = (s: AppState) => Object.keys(s.days);

describe("trustedTime — какое время сервер берёт для дня", () => {
  it("время устройства — если не в будущем и не старше 48 часов", () => {
    expect(trustedTime(msk("2026-11-21", "09:00"), NOW)).toBe(Date.parse(msk("2026-11-21", "09:00")));
    expect(trustedTime(new Date(NOW - OFFLINE_MS).toISOString(), NOW)).toBe(NOW - OFFLINE_MS);
  });
  it("из будущего, старше 48 часов или не разобрать — когда сервер получил", () => {
    expect(trustedTime(new Date(NOW + 60_000).toISOString(), NOW)).toBe(NOW);
    expect(trustedTime(new Date(NOW - OFFLINE_MS - 1).toISOString(), NOW)).toBe(NOW);
    expect(trustedTime("x", NOW)).toBe(NOW);
  });
});

describe("часы устройства переведены", () => {
  it("вперёд на 3 дня: часть 1 засчитана сегодня по серверу, слова — с сегодняшнего дня", () => {
    const device = st(
      { "2026-11-24": { morning: res(msk("2026-11-24", "11:55")) } },
      { srs: { w: { lvl: 1, intro: "2026-11-24", due: "2026-11-25", right: 1, wrong: 0 } } },
    );
    const s = accept(device);
    expect(keys(s)).toEqual(["2026-11-21"]);
    expect(s.days["2026-11-21"].morning).toMatchObject({ srv: NOW, at: msk("2026-11-24", "11:55") });
    expect(s.srs.w).toMatchObject({ intro: "2026-11-21", due: "2026-11-22" });
    expect(streak(s.days, "2026-11-21")).toBe(1);
  });

  it("назад на 3 дня (в пропущенный день): засчитано сегодня, пропуск не закрыт", () => {
    const stored = confirmLegacy(st({ "2026-11-17": { morning: res(msk("2026-11-17", "09:00")) } }));
    const device = st({ ...stored.days, "2026-11-18": { morning: res(msk("2026-11-18", "10:00")) } }, { srs: { w: { lvl: 1, intro: "2026-11-18", due: "2026-11-19", right: 1, wrong: 0 } } });
    const s = accept(device, stored);
    expect(keys(s)).toEqual(["2026-11-17", "2026-11-21"]);
    expect(s.srs.w).toMatchObject({ intro: "2026-11-21", due: "2026-11-22" });
    expect(streak(s.days, "2026-11-21")).toBe(1);
  });

  it("назад меньше чем на 48 часов — не отличить от занятия без сети: день по времени устройства", () => {
    const s = accept(st({ "2026-11-20": { morning: res(msk("2026-11-20", "13:00")) } }));
    expect(keys(s)).toEqual(["2026-11-20"]);
  });

  it("часть 2 в «завтра» устройства — в день сервера, к своей части 1", () => {
    const stored = accept(st({ "2026-11-21": { morning: res(msk("2026-11-21", "09:00")) } }));
    // устройство уже думает, что 22-е, и пишет часть 2 туда (без части 1 в этом дне)
    const device = st({ ...stored.days, "2026-11-22": { evening: res(msk("2026-11-22", "11:00")), reread: true } }, { upd: 200 });
    const s = accept(device, stored);
    expect(keys(s)).toEqual(["2026-11-21"]);
    expect(s.days["2026-11-21"]).toMatchObject({ morning: { at: msk("2026-11-21", "09:00") }, evening: { srv: NOW }, reread: true });
  });
});

describe("полночь в поясе пользователя", () => {
  const night = clock(Date.parse(msk("2026-11-21", "00:20")));

  it("за минуту до полуночи — тот день, даже если дошло после полуночи", () => {
    const s = accept(st({ "2026-11-20": { morning: res(msk("2026-11-20", "23:59")) } }), null, night);
    expect(keys(s)).toEqual(["2026-11-20"]);
  });

  it("через минуту после полуночи — новый день, хотя устройство в другом поясе записало вчера", () => {
    // ноутбук в Лондоне: там 21:01 20-го, но пользователь живёт по Москве
    const s = accept(st({ "2026-11-20": { morning: res(msk("2026-11-21", "00:01")) } }), null, night);
    expect(keys(s)).toEqual(["2026-11-21"]);
  });

  it("часть 1 до полуночи, часть 2 после — часть 2 в день урока (перенос), серия 1 день", () => {
    const stored = accept(st({ "2026-11-20": { morning: res(msk("2026-11-20", "23:30")) } }), null, night);
    const s = accept(st({ ...stored.days, "2026-11-20": { ...stored.days["2026-11-20"], evening: res(msk("2026-11-21", "00:15")) } }, { upd: 200 }), stored, night);
    expect(s.days["2026-11-20"].evening?.srv).toBe(Date.parse(msk("2026-11-21", "00:15")));
    expect(keys(s)).toEqual(["2026-11-20"]);
  });
});

describe("пояс пользователя", () => {
  it("тот же момент — разные дни в разных поясах; день решает пояс сервера, а не ключ устройства", () => {
    const t = at("2026-11-21T03:30:00Z"); // Москва: 06:30 21-го; Нью-Йорк: 22:30 20-го
    const c = (tz: string) => clock(Date.parse(at("2026-11-21T04:00:00Z")), tz);
    expect(keys(accept(st({ "2026-11-21": { morning: res(t) } }), null, c(NY)))).toEqual(["2026-11-20"]);
    expect(keys(accept(st({ "2026-11-20": { morning: res(t) } }), null, c(MSK)))).toEqual(["2026-11-21"]);
  });

  it("сменили пояс — пройденные дни остаются на месте, новые — по новому поясу", () => {
    const stored = accept(st({ "2026-11-20": { morning: res(msk("2026-11-20", "23:30")) } }), null, clock(Date.parse(msk("2026-11-21", "00:00"))));
    // через сутки пользователь в Нью-Йорке: прежние итоги шлются заново, к ним — новая часть 1
    const later = Date.parse(at("2026-11-22T02:00:00Z")); // НЙ: 21:00 21-го
    const device = st({ ...stored.days, "2026-11-22": { morning: res(at("2026-11-22T01:00:00Z")) } }, { upd: 200 });
    const s = accept(device, stored, clock(later, NY));
    expect(keys(s)).toEqual(["2026-11-20", "2026-11-21"]);
  });
});

describe("переход на летнее время (America/New_York)", () => {
  const day = (iso: string) => dayIn(Date.parse(iso), NY);

  it("8 марта 2026 (весна, 2:00 → 3:00): полночь до и после перехода", () => {
    expect(day("2026-03-08T04:59:00Z")).toBe("2026-03-07"); // 23:59 EST
    expect(day("2026-03-08T05:00:00Z")).toBe("2026-03-08"); // 00:00 EST
    expect(day("2026-03-08T07:30:00Z")).toBe("2026-03-08"); // 03:30 EDT — сразу после перехода
    expect(day("2026-03-09T03:59:00Z")).toBe("2026-03-08"); // 23:59 EDT
    expect(day("2026-03-09T04:00:00Z")).toBe("2026-03-09"); // 00:00 EDT
  });

  it("1 ноября 2026 (осень, 2:00 → 1:00): час 1:xx дважды — один день, сутки 25 часов", () => {
    expect(day("2026-11-01T03:59:00Z")).toBe("2026-10-31"); // 23:59 EDT
    expect(day("2026-11-01T04:00:00Z")).toBe("2026-11-01"); // 00:00 EDT
    expect(day("2026-11-01T05:30:00Z")).toBe("2026-11-01"); // 01:30 EDT
    expect(day("2026-11-01T06:30:00Z")).toBe("2026-11-01"); // 01:30 EST — второй раз
    expect(day("2026-11-02T04:59:00Z")).toBe("2026-11-01"); // 23:59 EST
    expect(day("2026-11-02T05:00:00Z")).toBe("2026-11-02"); // 00:00 EST
  });

  it("занятия поздно вечером три дня подряд через переход — серия 3", () => {
    let s: AppState | null = null;
    for (const iso of ["2026-03-08T04:30:00Z", "2026-03-09T03:30:00Z", "2026-03-10T03:30:00Z"]) {
      const t = Date.parse(iso);
      const device = st({ ...(s?.days ?? {}), [dayIn(t, NY)]: { morning: res(iso) } }, { upd: t });
      s = accept(device, s, clock(t + 60_000, NY));
    }
    expect(keys(s!)).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"]);
    expect(streak(s!.days, "2026-03-09")).toBe(3);
  });

  it("осенью: занятие в 1:30 второго раза и в 23:30 того же дня — один день", () => {
    const a = accept(st({ "2026-11-01": { morning: res("2026-11-01T06:30:00Z") } }), null, clock(Date.parse("2026-11-01T06:31:00Z"), NY));
    const b = accept(st({ ...a.days, "2026-11-01": { ...a.days["2026-11-01"], evening: res("2026-11-02T04:30:00Z") } }, { upd: 200 }), a, clock(Date.parse("2026-11-02T04:31:00Z"), NY));
    expect(keys(b)).toEqual(["2026-11-01"]);
    expect(b.days["2026-11-01"].evening).toBeTruthy();
  });
});

describe("без сети: занимались, отправили позже", () => {
  it("через 3 часа — день по времени занятия (вечер 20-го дошёл ночью 21-го)", () => {
    const s = accept(st({ "2026-11-20": { morning: res(msk("2026-11-20", "22:00")) } }), null, clock(Date.parse(msk("2026-11-21", "01:00"))));
    expect(keys(s)).toEqual(["2026-11-20"]);
    expect(s.days["2026-11-20"].morning?.srv).toBe(Date.parse(msk("2026-11-20", "22:00")));
  });

  it("через 2 дня (больше 48 часов) — день, когда сервер получил", () => {
    const s = accept(st({ "2026-11-19": { morning: res(msk("2026-11-19", "11:00")) } }));
    expect(keys(s)).toEqual(["2026-11-21"]);
    expect(s.days["2026-11-21"].morning?.srv).toBe(NOW);
  });

  it("из «будущего» — сейчас по серверу", () => {
    const s = accept(st({ "2026-11-21": { morning: res(msk("2026-11-21", "12:05")) } }));
    expect(s.days["2026-11-21"].morning?.srv).toBe(NOW);
  });

  it("часть 1 и часть 2 урока без сети, отправлены через 2 дня — обе сегодня, вместе", () => {
    // часть 1 — 51 час назад (за окном), часть 2 — 41 час назад (в окне): часть 2 не раньше своей части 1
    const device = st({ "2026-11-19": { morning: res(msk("2026-11-19", "09:00")), evening: res(msk("2026-11-19", "19:00")) } });
    const s = accept(device);
    expect(keys(s)).toEqual(["2026-11-21"]);
    expect(s.days["2026-11-21"]).toMatchObject({ morning: { srv: NOW }, evening: { srv: NOW } });
  });

  it("часть 2, перенесённая со вчера, — в день урока; старше CARRY_DAYS — в свой день", () => {
    const stored = confirmLegacy(
      st({ "2026-11-19": { morning: res(msk("2026-11-19", "09:00")) }, "2026-11-17": { morning: res(msk("2026-11-17", "09:00")) } }),
    );
    expect(CARRY_DAYS).toBe(2);
    const ok = accept(st({ ...stored.days, "2026-11-19": { ...stored.days["2026-11-19"], evening: res(msk("2026-11-21", "10:00")) } }, { upd: 200 }), stored);
    expect(ok.days["2026-11-19"].evening).toBeTruthy();
    const old = accept(st({ ...stored.days, "2026-11-17": { ...stored.days["2026-11-17"], evening: res(msk("2026-11-21", "10:00")) } }, { upd: 200 }), stored);
    expect(old.days["2026-11-17"].evening).toBeUndefined();
    expect(old.days["2026-11-21"].evening).toBeTruthy();
  });
});

describe("два устройства", () => {
  it("телефон и ноутбук: часть 1 на одном, часть 2 на другом — один урок; повторная отправка ничего не меняет", () => {
    const phone = st({ "2026-11-21": { morning: res(msk("2026-11-21", "09:00")) } });
    const s1 = accept(phone, null);
    const laptop = st({ "2026-11-21": { morning: s1.days["2026-11-21"].morning, evening: res(msk("2026-11-21", "11:30"), { newN: 0 }) } }, { upd: 300 });
    const s2 = accept(laptop, s1);
    expect(s2.days["2026-11-21"]).toMatchObject({ morning: { srv: Date.parse(msk("2026-11-21", "09:00")) }, evening: { srv: Date.parse(msk("2026-11-21", "11:30")) } });
    // телефон со старым кэшем шлёт своё ещё раз — ничего не меняется
    expect(sameState(accept(phone, s2), s2)).toBe(true);
    expect(sameState(accept(laptop, s2), s2)).toBe(true);
  });

  it("сервер переложил итог — устройство, слив ответ, держит его в одном месте (без двойника под своим днём)", () => {
    const device = st({ "2026-11-24": { morning: res(msk("2026-11-24", "11:55")) } });
    const server = accept(device);
    const local = mergeStates(device, server);
    expect(keys(local)).toEqual(["2026-11-21"]);
    expect(hasPending(local)).toBe(false);
    // и снова на сервер — без изменений
    expect(sameState(accept(local, server), server)).toBe(true);
  });

  it("две части 1 в один день (оба без сети) — остаётся одна, та же на сервере и на устройствах", () => {
    const a = st({ "2026-11-21": { morning: res(msk("2026-11-21", "09:00")) } });
    const b = st({ "2026-11-21": { morning: res(msk("2026-11-21", "10:00")) } }, { upd: 50 });
    const s = accept(b, accept(a));
    expect(s.days["2026-11-21"].morning?.at).toBe(msk("2026-11-21", "10:00"));
    // у устройства a своя часть ещё не подтверждена — подтверждённая с сервера побеждает
    expect(mergeStates(a, s).days["2026-11-21"].morning?.at).toBe(msk("2026-11-21", "10:00"));
  });

  it("подделать нельзя: чужая метка srv не принимается, подтверждённый итог не переложить", () => {
    const s1 = accept(st({ "2026-11-21": { morning: res(msk("2026-11-21", "09:00")) } }));
    // тот же итог под другим днём и с выдуманной меткой
    const forged = st({ "2026-11-15": { morning: { ...s1.days["2026-11-21"].morning!, srv: Date.parse(msk("2026-11-15", "09:00")) } } }, { upd: 999 });
    expect(accept(forged, s1).days).toEqual(s1.days);
    // новый итог с меткой из прошлого — метку ставит сервер
    const fresh = st({ "2026-11-14": { evening: res(msk("2026-11-14", "09:00"), { srv: Date.parse(msk("2026-11-14", "09:00")) }) } }, { upd: 999 });
    const s2 = accept(fresh, s1);
    expect(s2.days["2026-11-14"]).toBeUndefined();
    expect(s2.days["2026-11-21"].evening?.srv).toBe(NOW);
  });

  it("пояс и сброс — серверные: присланные устройством не принимаются", () => {
    const stored = { ...accept(st({})), tz: MSK, tzAt: 5, reset: 7 };
    const s = accept(st({}, { tz: "Asia/Tokyo", tzAt: 10 ** 13, reset: 10 ** 13 }), stored);
    expect(s).toMatchObject({ tz: MSK, tzAt: 5, reset: 7 });
  });
});

describe("старые данные (до серверных дней)", () => {
  const legacy = st({
    "2026-11-18": { morning: res(msk("2026-11-18", "09:00")), evening: res(msk("2026-11-18", "19:00")) },
    "2026-11-19": { morning: res(msk("2026-11-19", "09:00")) },
    "2026-11-20": { evening: res(msk("2026-11-21", "08:00")) }, // перенесённая часть 2: записана в день урока
  });

  it("confirmLegacy: метка — их собственное время, дни на месте, серия та же", () => {
    const c = confirmLegacy(legacy);
    expect(keys(c)).toEqual(keys(legacy));
    expect(c.days["2026-11-19"].morning?.srv).toBe(Date.parse(msk("2026-11-19", "09:00")));
    expect(hasPending(c)).toBe(false);
    expect(streak(c.days, "2026-11-21")).toBe(streak(legacy.days, "2026-11-21"));
    expect(confirmLegacy(c)).toBe(c);
  });

  it("устройство со старым кэшем шлёт ту же историю — она остаётся, где была", () => {
    const s = accept(legacy, legacy);
    expect(keys(s)).toEqual(keys(legacy));
    expect(streak(s.days, "2026-11-21")).toBe(3);
  });
});

describe("clampWords — даты слов от сегодня сервера", () => {
  const today = "2026-11-21";
  it("повтор не дальше интервала уровня (редкое — вдвое), знакомство не в будущем", () => {
    const out = clampWords(
      {
        a: { lvl: 2, intro: "2026-11-25", due: "2026-12-30", right: 3, wrong: 0 },
        rare: { lvl: 2, intro: "2026-11-10", due: "2026-11-27", right: 3, wrong: 0 },
        ok: { lvl: 1, intro: "2026-11-21", due: "2026-11-22", right: 1, wrong: 0 },
      },
      {},
      new Map(),
      today,
      (id) => id === "rare",
    );
    expect(out.a).toMatchObject({ intro: today, due: addDays(today, 3) });
    expect(out.rare.due).toBe("2026-11-27"); // 21 + 6
    expect(out.ok).toMatchObject({ intro: today, due: "2026-11-22" });
  });
  it("слово, которое не менялось, не трогает", () => {
    const w = { lvl: 1, intro: "2026-11-25", due: "2026-12-30", right: 1, wrong: 0 };
    expect(clampWords({ w }, { w }, new Map(), today).w).toBe(w);
  });
});

describe("«перечитал»", () => {
  it("в будущем дне устройства не принимается", () => {
    const s = accept(st({ "2026-11-23": { reread: true } as DayLog }));
    expect(s.days["2026-11-23"]).toBeUndefined();
  });
});
