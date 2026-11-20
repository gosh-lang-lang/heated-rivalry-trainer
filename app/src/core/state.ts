import type { AppState, SentenceRecord, WordState } from "./types";

export const NEW_PER_DAY_OPTIONS = [6, 12, 18, 24] as const;

export const emptyState = (): AppState => ({ upd: 0, settings: { newPerDay: 12 }, srs: {}, days: {}, sent: [] });

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
  const sent: SentenceRecord[] = Array.isArray(v.sent)
    ? (v.sent.filter((s) => isObj(s) && typeof s.text === "string") as unknown as SentenceRecord[])
    : [];
  return {
    upd: num(v.upd),
    settings: { newPerDay: num(settings.newPerDay, 12) || 12 },
    srs,
    days,
    sent,
  };
};

/** Слияние «кто новее» по upd (как в прототипе). */
export const pickNewer = (a: AppState, b: AppState): AppState => ((b.upd || 0) > (a.upd || 0) ? b : a);

export const exportState = (s: AppState, now = new Date()) =>
  JSON.stringify({ ...s, exportedAt: now.toISOString(), app: "hr2" }, null, 2);
