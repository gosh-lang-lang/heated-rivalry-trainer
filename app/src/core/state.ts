import { isAvatar, savedNumber } from "./avatar.ts";
import { clockNow, isTimeZone } from "./dates.ts";
import { DEFAULT_VOICE, isTtsVoice } from "./tts.ts";
import type { AppState, DayLog, Look, SavedRun, SentenceRecord, SessionResult, Settings, SettingsAt, Step, ThemePref, WordState } from "./types";

export const NEW_PER_DAY_OPTIONS = [6, 12, 18, 24] as const;

export const LOOK_IDS = ["classic", "ice", "match", "cities-red", "cities-black", "away"] as const satisfies readonly Look[];
export const THEME_PREFS = ["system", "light", "dark"] as const satisfies readonly ThemePref[];
export const isLook = (v: unknown): v is Look => LOOK_IDS.includes(v as Look);
export const isThemePref = (v: unknown): v is ThemePref => THEME_PREFS.includes(v as ThemePref);

export const emptyState = (): AppState => ({
  upd: 0,
  reset: 0,
  settings: { newPerDay: 12, voice: DEFAULT_VOICE, look: "ice", theme: "system", avatar: "", avatarNum: "" },
  settingsAt: { newPerDay: 0, voice: 0, look: 0, theme: 0, avatar: 0, avatarNum: 0 },
  srs: {},
  days: {},
  sent: [],
  run: null,
  runAt: 0,
  tz: "",
  tzAt: 0,
});
/** Все личные настройки: каждая сливается отдельно (mergeStates). Новая настройка — поле в Settings и здесь. */
const SETTING_KEYS = ["newPerDay", "voice", "look", "theme", "avatar", "avatarNum"] as const satisfies readonly (keyof Settings)[];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const cleanWordState = (v: unknown): WordState | null => {
  if (!isObj(v)) return null;
  const due = str(v.due),
    intro = str(v.intro);
  return {
    lvl: Math.max(0, Math.min(6, Math.round(num(v.lvl)))),
    due: DATE.test(due) ? due : "",
    intro: DATE.test(intro) ? intro : "",
    right: Math.max(0, num(v.right)),
    wrong: Math.max(0, num(v.wrong)),
  };
};

/** Типы шагов, которые умеет показать эта версия: сохранённая часть с незнакомым шагом (от новой версии) не продолжается. */
const STEP_TYPES = new Set<Step["t"]>(["section", "intro", "pick", "listen", "type", "pairs", "build", "build-listen", "write", "speak", "reread"]);
const isStep = (v: unknown): v is Step => isObj(v) && STEP_TYPES.has(v.t as Step["t"]) && typeof v.k === "number";
const nums = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []);

/** Сохранённая часть урока или null, если данных не хватает (обрезаны, от другой версии). */
const cleanRun = (v: unknown): SavedRun | null => {
  if (!isObj(v) || (v.kind !== "morning" && v.kind !== "evening")) return null;
  const day = str(v.day),
    date = str(v.date);
  if (!DATE.test(day) || !DATE.test(date) || !Array.isArray(v.steps) || !v.steps.length || !v.steps.every(isStep)) return null;
  const n = (x: unknown) => Math.max(0, Math.round(num(x)));
  return {
    kind: v.kind,
    day,
    date,
    seed: n(v.seed),
    steps: v.steps,
    i: Math.min(n(v.i), v.steps.length),
    graded: n(v.graded),
    right: n(v.right),
    revGraded: n(v.revGraded),
    revRight: n(v.revRight),
    first: nums(v.first),
    newIds: Array.isArray(v.newIds) ? v.newIds.filter((x): x is string => typeof x === "string") : [],
    written: isObj(v.written) ? (v.written as SavedRun["written"]) : {},
    t0: num(v.t0),
  };
};

/**
 * Приводит сырые данные (localStorage, db прототипа, файл экспорта) к AppState.
 * Бросает ошибку, если это явно не состояние тренажёра.
 */
export const parseState = (raw: unknown): AppState => {
  const v = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!isObj(v) || !isObj(v.srs)) throw new Error("В JSON нет поля srs — это не экспорт тренажёра.");
  const srs: AppState["srs"] = {};
  for (const [id, ws] of Object.entries(v.srs)) {
    const c = cleanWordState(ws);
    if (c) srs[id] = c;
  }
  const days: AppState["days"] = {};
  if (isObj(v.days)) for (const [k, d] of Object.entries(v.days)) if (DATE.test(k) && isObj(d)) days[k] = cleanDay(d);
  const settings = isObj(v.settings) ? v.settings : {};
  const at = isObj(v.settingsAt) ? v.settingsAt : {};
  const sent: SentenceRecord[] = Array.isArray(v.sent)
    ? (v.sent.filter((s) => isObj(s) && typeof s.text === "string") as unknown as SentenceRecord[])
    : [];
  return {
    upd: num(v.upd),
    reset: Math.max(0, num(v.reset)),
    settings: {
      newPerDay: num(settings.newPerDay, 12) || 12,
      voice: isTtsVoice(settings.voice) ? settings.voice : DEFAULT_VOICE,
      look: isLook(settings.look) ? settings.look : "ice",
      theme: isThemePref(settings.theme) ? settings.theme : "system",
      avatar: isAvatar(settings.avatar) ? settings.avatar : "",
      avatarNum: savedNumber(settings.avatarNum, settings.avatar),
    },
    settingsAt: Object.fromEntries(SETTING_KEYS.map((k) => [k, Math.max(0, num(at[k]))])) as SettingsAt,
    srs,
    days,
    sent,
    run: cleanRun(v.run),
    runAt: Math.max(0, num(v.runAt)),
    tz: isTimeZone(v.tz) ? v.tz : "",
    tzAt: isTimeZone(v.tz) ? Math.max(0, num(v.tzAt)) : 0,
  };
};

/** Итог занятия как есть, только метка сервера srv — число или её нет. */
const cleanResult = (v: unknown): SessionResult | undefined => {
  if (!isObj(v)) return undefined;
  const r = { ...v } as unknown as SessionResult;
  if (r.srv !== undefined && !(typeof r.srv === "number" && Number.isFinite(r.srv) && r.srv >= 0)) delete r.srv;
  return r;
};
const cleanDay = (v: Record<string, unknown>): DayLog => {
  const d = { ...v } as DayLog;
  for (const k of ["morning", "evening"] as const) {
    const r = cleanResult(v[k]);
    if (r) d[k] = r;
    else delete d[k];
  }
  if (Array.isArray(v.extra)) d.extra = v.extra.map(cleanResult).filter((r): r is SessionResult => !!r);
  else delete d.extra;
  return d;
};

/**
 * Слияние двух копий (устройство и сервер, две вкладки). Ничего сделанного на одном устройстве не теряется
 * из-за того, что на другом в это время занимались. Порядок аргументов не важен; повторное слияние ничего не меняет.
 *  - слова — по одному: побеждает версия, где на слово отвечали больше раз (каждый ответ увеличивает
 *    right или wrong — счётчик не зависит от часов устройств); поровну — знакомое слово, затем более новая копия;
 *  - дни — по полям: утро и вечер — более позднее занятие, дополнительные — все, «перечитал» — если хоть где-то;
 *    занятие, которое сервер переложил в другой день (подтверждённое, srv), остаётся только там: неподтверждённый
 *    двойник под старым днём отбрасывается; в одном дне подтверждённое побеждает неподтверждённое (core/serverday.ts);
 *  - часовой пояс (tz) — из копии, где его позже поставил сервер (tzAt);
 *  - свои предложения — все с обоих устройств; одно и то же — проверенная версия, а не ждущая проверки;
 *  - личные настройки — по пунктам: пункт, изменённый позже (settingsAt), побеждает;
 *  - незаконченная часть урока (run) — из копии, где она менялась позже (runAt): и сохранённая, и «закончена» (null);
 *  - upd — наибольший;
 *  - прогресс сброшен (reset) на одной копии позже, чем на другой — слова, дни и предложения только из неё:
 *    кэш устройства, сделанный до сброса, не возвращает сброшенное. Настройки сливаются как обычно.
 */
export const mergeStates = (a: AppState, b: AppState): AppState => {
  if (a.reset !== b.reset) {
    const [cur, old] = a.reset > b.reset ? [a, b] : [b, a];
    const s = mergeStates(cur, { ...old, reset: cur.reset, srs: {}, days: {}, sent: [], run: null, runAt: 0 });
    return { ...s, upd: Math.max(a.upd, b.upd) };
  }
  const newer = b.upd > a.upd || (b.upd === a.upd && canonical(b) > canonical(a)) ? b : a;
  const older = newer === a ? b : a;

  const settings = { ...newer.settings };
  const settingsAt = { ...newer.settingsAt };
  for (const k of SETTING_KEYS)
    if (older.settingsAt[k] > newer.settingsAt[k]) {
      (settings as Record<string, unknown>)[k] = older.settings[k];
      settingsAt[k] = older.settingsAt[k];
    }

  const srs: AppState["srs"] = { ...older.srs };
  for (const [id, w] of Object.entries(newer.srs)) srs[id] = srs[id] ? pickWord(w, srs[id]) : w;

  const days = mergeDays(newer.days, older.days);
  const run = older.runAt > newer.runAt ? older : newer;
  const zone = older.tzAt > newer.tzAt ? older : newer;

  return {
    upd: newer.upd,
    reset: newer.reset,
    settings,
    settingsAt,
    srs: sortKeys(srs),
    days: sortKeys(days),
    sent: mergeSent(newer.sent, older.sent),
    run: run.run,
    runAt: run.runAt,
    tz: zone.tz,
    tzAt: zone.tzAt,
  };
};

const answers = (w: WordState) => w.right + w.wrong;
/** n — из более новой копии (побеждает при полном равенстве). */
const pickWord = (n: WordState, o: WordState): WordState =>
  answers(n) !== answers(o) ? (answers(n) > answers(o) ? n : o) : !!n.intro !== !!o.intro ? (n.intro ? n : o) : n;

type Kind = "morning" | "evening" | "extra";
/** «Имя» итога: вид занятия и время по часам устройства — одно и то же на всех устройствах и под любым днём. */
export const resultId = (kind: Kind, r: SessionResult) => `${kind}|${r.at}`;
const stamped = (r: SessionResult) => r.srv !== undefined;

/**
 * Какой из двух итогов в одном месте дня (часть 1 или 2) остаётся: подтверждённый сервером — раньше неподтверждённого
 * (сервер уже видел и неподтверждённый — устройство отправляет своё до того, как забрать чужое, lib/sync.ts);
 * оба подтверждены — позже по времени сервера; оба нет — позже по `at`. true — побеждает a.
 */
export const betterResult = (a: SessionResult, b: SessionResult): boolean => {
  if (stamped(a) !== stamped(b)) return stamped(a);
  if (stamped(a) && a.srv !== b.srv) return a.srv! > b.srv!;
  return a.at > b.at;
};

/** Все итоги дней: [день, вид, итог]. */
export const eachResult = (days: AppState["days"]): [string, Kind, SessionResult][] => {
  const out: [string, Kind, SessionResult][] = [];
  for (const [k, d] of Object.entries(days)) {
    if (d.morning) out.push([k, "morning", d.morning]);
    if (d.evening) out.push([k, "evening", d.evening]);
    for (const r of d.extra ?? []) out.push([k, "extra", r]);
  }
  return out;
};

/** Положить итог в день: дополнительные — все (по времени), часть 1 и 2 — побеждает betterResult; равные — положенный позже. */
export const putResult = (days: AppState["days"], day: string, kind: Kind, r: SessionResult) => {
  const d = (days[day] ??= {});
  if (kind === "extra") {
    const byAt = new Map((d.extra ?? []).map((x) => [x.at, x]));
    const prev = byAt.get(r.at);
    if (!prev || !betterResult(prev, r)) byAt.set(r.at, r);
    d.extra = [...byAt.values()].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
  } else if (!d[kind] || !betterResult(d[kind]!, r)) d[kind] = r;
};

const emptyDay = (d: DayLog) => !d.morning && !d.evening && !d.extra?.length && !d.reread && Object.keys(d).every((k) => ["morning", "evening", "extra", "reread"].includes(k));

/**
 * Дни двух копий (n — из более новой). Итог, который сервер переложил в другой день, у устройства лежит ещё и под
 * старым днём неподтверждённым — такой двойник (то же «имя», без srv, а где-то есть с srv) отбрасывается: занятие
 * остаётся там, куда его положил сервер. Остальные итоги раскладываются по дням (putResult; при равенстве —
 * из более новой копии), «перечитал» — если хоть где-то. Опустевший день (занятие уехало в другой) пропадает.
 */
const mergeDays = (n: AppState["days"], o: AppState["days"]): AppState["days"] => {
  const all = [...eachResult(o), ...eachResult(n)];
  const confirmed = new Set(all.filter(([, , r]) => stamped(r)).map(([, kind, r]) => resultId(kind, r)));
  const days: AppState["days"] = {};
  for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
    const { morning: _m, evening: _e, extra: _x, ...rest } = { ...o[k], ...n[k] };
    days[k] = rest;
    if (o[k]?.reread || n[k]?.reread) days[k].reread = true;
  }
  for (const [k, kind, r] of all) if (stamped(r) || !confirmed.has(resultId(kind, r))) putResult(days, k, kind, r);
  for (const k of Object.keys(days)) if (emptyDay(days[k])) delete days[k];
  return days;
};

const sentKey = (s: SentenceRecord) => `${s.at}\u0000${s.text}`;
/** Все предложения обеих копий по времени; одно и то же — проверенное (не pending) или из более новой копии. */
const mergeSent = (n: SentenceRecord[], o: SentenceRecord[]): SentenceRecord[] => {
  const m = new Map<string, SentenceRecord>();
  for (const s of o) m.set(sentKey(s), s);
  for (const s of n) {
    const prev = m.get(sentKey(s));
    m.set(sentKey(s), prev && !prev.pending && s.pending ? prev : s);
  }
  return [...m.values()].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
};

/** Ключи по порядку — чтобы одинаковые копии одинаково сериализовались (sameState). */
const sortKeys = <T>(r: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(r).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));

/** Сбросить прогресс (слова, дни, свои предложения), настройки оставить. now — метка сброса, строго больше прежней. */
export const resetProgress = (s: AppState, now = Date.now()): AppState => {
  const reset = Math.max(now, s.reset + 1);
  return { ...s, reset, upd: Math.max(reset, s.upd + 1), srs: {}, days: {}, sent: [], run: null, runAt: Math.max(now, s.runAt + 1) };
};

/**
 * Изменить пункт настроек (метка времени пункта — строго растёт, даже если часы ушли назад).
 * Метка — по часам сервера: иначе устройство со спешащими часами перебивало бы более позднюю смену на другом.
 */
export const changeSetting = <K extends keyof Settings>(s: AppState, key: K, value: Settings[K], now = clockNow()): AppState => ({
  ...s,
  settings: { ...s.settings, [key]: value },
  settingsAt: { ...s.settingsAt, [key]: Math.max(now, s.settingsAt[key] + 1) } as SettingsAt,
});

/** JSON с ключами объектов по порядку: одинаковые копии — одинаковая строка, как бы ни были собраны. */
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0))) : x,
  );

/** Одинаковы ли копии по содержанию (чтобы не отправлять и не перерисовывать без нужды). */
export const sameState = (a: AppState, b: AppState) => canonical(a) === canonical(b);
