import { isAvatar } from "./avatar.ts";
import { DEFAULT_VOICE, isTtsVoice } from "./tts.ts";
import type { AppState, DayLog, Look, SentenceRecord, SessionResult, Settings, SettingsAt, ThemePref, WordState } from "./types";

export const NEW_PER_DAY_OPTIONS = [6, 12, 18, 24] as const;

export const LOOK_IDS = ["classic", "ice", "match", "cities-red", "cities-black", "away"] as const satisfies readonly Look[];
export const THEME_PREFS = ["system", "light", "dark"] as const satisfies readonly ThemePref[];
export const isLook = (v: unknown): v is Look => LOOK_IDS.includes(v as Look);
export const isThemePref = (v: unknown): v is ThemePref => THEME_PREFS.includes(v as ThemePref);

export const emptyState = (): AppState => ({
  upd: 0,
  reset: 0,
  settings: { newPerDay: 12, voice: DEFAULT_VOICE, look: "ice", theme: "system", avatar: "" },
  settingsAt: { newPerDay: 0, voice: 0, look: 0, theme: 0, avatar: 0 },
  srs: {},
  days: {},
  sent: [],
});
/** Все личные настройки: каждая сливается отдельно (mergeStates). Новая настройка — поле в Settings и здесь. */
const SETTING_KEYS = ["newPerDay", "voice", "look", "theme", "avatar"] as const satisfies readonly (keyof Settings)[];

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
  if (isObj(v.days)) for (const [k, d] of Object.entries(v.days)) if (DATE.test(k) && isObj(d)) days[k] = d as AppState["days"][string];
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
    },
    settingsAt: Object.fromEntries(SETTING_KEYS.map((k) => [k, Math.max(0, num(at[k]))])) as SettingsAt,
    srs,
    days,
    sent,
  };
};

/**
 * Слияние двух копий (устройство и сервер, две вкладки). Ничего сделанного на одном устройстве не теряется
 * из-за того, что на другом в это время занимались. Порядок аргументов не важен; повторное слияние ничего не меняет.
 *  - слова — по одному: побеждает версия, где на слово отвечали больше раз (каждый ответ увеличивает
 *    right или wrong — счётчик не зависит от часов устройств); поровну — знакомое слово, затем более новая копия;
 *  - дни — по полям: утро и вечер — более позднее занятие, дополнительные — все, «перечитал» — если хоть где-то;
 *  - свои предложения — все с обоих устройств; одно и то же — проверенная версия, а не ждущая проверки;
 *  - личные настройки — по пунктам: пункт, изменённый позже (settingsAt), побеждает;
 *  - upd — наибольший;
 *  - прогресс сброшен (reset) на одной копии позже, чем на другой — слова, дни и предложения только из неё:
 *    кэш устройства, сделанный до сброса, не возвращает сброшенное. Настройки сливаются как обычно.
 */
export const mergeStates = (a: AppState, b: AppState): AppState => {
  if (a.reset !== b.reset) {
    const [cur, old] = a.reset > b.reset ? [a, b] : [b, a];
    const s = mergeStates(cur, { ...old, reset: cur.reset, srs: {}, days: {}, sent: [] });
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

  const days: AppState["days"] = { ...older.days };
  for (const [d, log] of Object.entries(newer.days)) days[d] = days[d] ? mergeDay(log, days[d]) : log;

  return { upd: newer.upd, reset: newer.reset, settings, settingsAt, srs: sortKeys(srs), days: sortKeys(days), sent: mergeSent(newer.sent, older.sent) };
};

const answers = (w: WordState) => w.right + w.wrong;
/** n — из более новой копии (побеждает при полном равенстве). */
const pickWord = (n: WordState, o: WordState): WordState =>
  answers(n) !== answers(o) ? (answers(n) > answers(o) ? n : o) : !!n.intro !== !!o.intro ? (n.intro ? n : o) : n;

const laterResult = (n?: SessionResult, o?: SessionResult) => (!n ? o : !o ? n : o.at > n.at ? o : n);
const mergeDay = (n: DayLog, o: DayLog): DayLog => {
  const d: DayLog = { ...o, ...n };
  const morning = laterResult(n.morning, o.morning),
    evening = laterResult(n.evening, o.evening);
  if (morning) d.morning = morning;
  if (evening) d.evening = evening;
  if (n.extra || o.extra) {
    const byAt = new Map<string, SessionResult>();
    for (const r of [...(o.extra ?? []), ...(n.extra ?? [])]) byAt.set(r.at, r);
    d.extra = [...byAt.values()].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
  }
  if (n.reread || o.reread) d.reread = true;
  return d;
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
  return { ...s, reset, upd: Math.max(reset, s.upd + 1), srs: {}, days: {}, sent: [] };
};

/** Изменить пункт настроек (метка времени пункта — строго растёт, даже если часы ушли назад). */
export const changeSetting = <K extends keyof Settings>(s: AppState, key: K, value: Settings[K], now = Date.now()): AppState => ({
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
