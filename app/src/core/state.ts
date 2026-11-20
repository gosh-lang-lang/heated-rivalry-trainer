import { DEFAULT_VOICE, isTtsVoice } from "./tts.ts";
import type { AppState, SentenceRecord, Settings, SettingsAt, WordState } from "./types";

export const NEW_PER_DAY_OPTIONS = [6, 12, 18, 24] as const;

export const emptyState = (): AppState => ({ upd: 0, settings: { newPerDay: 12, voice: DEFAULT_VOICE }, settingsAt: { newPerDay: 0, voice: 0 }, srs: {}, days: {}, sent: [] });
const SETTING_KEYS = ["newPerDay", "voice"] as const satisfies readonly (keyof Settings)[];

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
    settings: { newPerDay: num(settings.newPerDay, 12) || 12, voice: isTtsVoice(settings.voice) ? settings.voice : DEFAULT_VOICE },
    settingsAt: { newPerDay: Math.max(0, num(at.newPerDay)), voice: Math.max(0, num(at.voice)) },
    srs,
    days,
    sent,
  };
};

/**
 * Слияние двух копий (устройство и сервер, две вкладки).
 * Прогресс — целиком из более новой копии (upd). Настройки — по пунктам: у каждого пункта своя метка
 * времени, побеждает пункт, изменённый позже. Так занятие на одном устройстве не затирает настройку,
 * которую в это время поменяли на другом. Порядок аргументов не важен; повторное слияние ничего не меняет.
 */
export const mergeStates = (a: AppState, b: AppState): AppState => {
  const newer = b.upd > a.upd || (b.upd === a.upd && JSON.stringify(b) > JSON.stringify(a)) ? b : a;
  const older = newer === a ? b : a;
  const settings = { ...newer.settings };
  const settingsAt = { ...newer.settingsAt };
  for (const k of SETTING_KEYS)
    if (older.settingsAt[k] > newer.settingsAt[k]) {
      (settings as Record<string, unknown>)[k] = older.settings[k];
      settingsAt[k] = older.settingsAt[k];
    }
  return { ...newer, settings, settingsAt };
};

/** Изменить пункт настроек (метка времени пункта — строго растёт, даже если часы ушли назад). */
export const changeSetting = <K extends keyof Settings>(s: AppState, key: K, value: Settings[K], now = Date.now()): AppState => ({
  ...s,
  settings: { ...s.settings, [key]: value },
  settingsAt: { ...s.settingsAt, [key]: Math.max(now, s.settingsAt[key] + 1) } as SettingsAt,
});

/** Одинаковы ли копии (чтобы не отправлять и не перерисовывать без нужды). */
export const sameState = (a: AppState, b: AppState) => JSON.stringify(a) === JSON.stringify(b);
