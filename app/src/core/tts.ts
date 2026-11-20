/** Общая логика озвучки для клиента и сервера (без DOM и без Node API). */

export type Accent = "us" | "gb";

export interface TtsVoice {
  id: string;
  name: string;
  accent: Accent;
  gender: "f" | "m";
  /** короткая характеристика */
  note?: string;
  /** рекомендуемый */
  best?: boolean;
}

/** Английские голоса Kokoro. a* — американский акцент, b* — британский. */
export const TTS_VOICES: TtsVoice[] = [
  { id: "af_heart", name: "Heart", accent: "us", gender: "f", note: "тёплый, самый естественный", best: true },
  { id: "af_bella", name: "Bella", accent: "us", gender: "f", note: "живой, выразительный" },
  { id: "af_nicole", name: "Nicole", accent: "us", gender: "f", note: "мягкий, почти шёпот" },
  { id: "am_michael", name: "Michael", accent: "us", gender: "m", note: "спокойный" },
  { id: "am_fenrir", name: "Fenrir", accent: "us", gender: "m", note: "низкий" },
  { id: "bf_emma", name: "Emma", accent: "gb", gender: "f", note: "чёткий" },
  { id: "bf_isabella", name: "Isabella", accent: "gb", gender: "f" },
  { id: "bm_george", name: "George", accent: "gb", gender: "m", note: "классический британский" },
  { id: "bm_fable", name: "Fable", accent: "gb", gender: "m", note: "рассказчик" },
  { id: "bm_lewis", name: "Lewis", accent: "gb", gender: "m" },
];

export const ACCENT_LABEL: Record<Accent, string> = { us: "Американский акцент", gb: "Британский акцент" };
export const voiceMeta = (v: TtsVoice) => `${v.accent === "us" ? "американский" : "британский"} · ${v.gender === "f" ? "женский" : "мужской"}`;

export const DEFAULT_VOICE = "af_heart";
/** Фраза для прослушивания голосов (сервер озвучивает её заранее всеми голосами). */
export const VOICE_SAMPLE = "Their animosity was intense. He gritted his teeth and kept playing.";
/** Чуть медленнее обычного — для изучающего язык. */
export const TTS_SPEED = 0.9;
export const MAX_TTS_CHARS = 400;

export const isTtsVoice = (v: unknown): v is string => typeof v === "string" && TTS_VOICES.some((x) => x.id === v);

/** Что реально произносить: «bend — bent» → «bend, bent», лишние пробелы убираем. */
export const spokenText = (t: string): string =>
  t
    .replace(/\s+[—–-]\s+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();

/** Проверка запроса на озвучку. Возвращает текст ошибки или null. */
export const ttsRequestError = (text: unknown, voice: unknown): string | null => {
  if (typeof text !== "string" || !spokenText(text)) return "нужен text";
  if (text.length > MAX_TTS_CHARS) return `text длиннее ${MAX_TTS_CHARS} символов`;
  if (voice !== undefined && !isTtsVoice(voice)) return "неизвестный голос";
  return null;
};

/** Строка, из которой сервер считает имя файла в кэше. Меняется голос, скорость или текст — новый файл. */
export const ttsCacheSource = (text: string, voice: string, speed = TTS_SPEED) => `v1|${voice}|${speed}|${spokenText(text)}`;
