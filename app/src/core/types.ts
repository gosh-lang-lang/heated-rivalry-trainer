/* Модель данных — совпадает с прототипом (PROJECT_BRIEF.md, раздел 2). */

export interface Batch {
  id: number;
  title: string;
  pages: string;
}

export interface Word {
  id: string;
  batch: number;
  picture: string;
  en: string;
  ipa: string;
  ru: string;
  note: string;
  example: string;
  exampleRu: string;
  /** точный фрагмент example, который прячется в задании «впиши» */
  blank: string;
  correctionOfMyTranslation: boolean;
  /**
   * Редкое (книжное) слово: та же лестница при знакомстве, но интервалы вдвое длиннее,
   * ошибка снижает уровень на 2, а не до 1, и вечером — не больше одного своего предложения.
   * Нет поля — ходовое.
   */
  rare?: boolean;
  /** оригинальная фраза из книги, где встретилось слово (с новых партий) */
  quote?: string;
  /** страница этой фразы */
  page?: string;
}

export interface BankSentence {
  en: string;
  ru: string;
  /** id слов */
  words: string[];
}

export interface WordsFile {
  version: number;
  batches: Batch[];
  words: Word[];
  sentences: BankSentence[];
}

export interface Deck {
  batches: Batch[];
  words: Word[];
  sentences: BankSentence[];
  byId: Record<string, Word>;
}

/* ---------- состояние пользователя ---------- */

export interface WordState {
  /** 0–6 */
  lvl: number;
  /** YYYY-MM-DD */
  due: string;
  /** YYYY-MM-DD — день знакомства */
  intro: string;
  right: number;
  wrong: number;
}

export interface SessionResult {
  score: number;
  total: number;
  mins: number;
  newN: number;
  at: string;
  /** только повторения (разминка утром и вечером): верно с первой попытки / всего — главная метрика темпа */
  revScore?: number;
  revTotal?: number;
}

export interface DayLog {
  morning?: SessionResult;
  evening?: SessionResult;
  extra?: SessionResult[];
  reread?: boolean;
}

export interface SentenceRecord {
  at: string;
  /** английские написания слов (как в прототипе) */
  words: string[];
  text: string;
  ok?: boolean;
  corrected?: string;
  comment?: string;
  pending?: boolean;
}

/** Личные настройки — общие для всех устройств пользователя (синхронизируются вместе с прогрессом). */
export interface Settings {
  newPerDay: number;
  /** голос озвучки (id из TTS_VOICES) */
  voice: string;
  /** оформление: классика, лёд со стеклом, лёд с хоккеистами */
  look: Look;
  /** день / ночь; system — как в системе устройства */
  theme: ThemePref;
  /** аватарка в «Я»: "" — буква имени; формат — core/avatar.ts */
  avatar: string;
}
export type Look = "classic" | "ice" | "match" | "cities-red" | "cities-black" | "away";
export type ThemePref = "system" | "light" | "dark";
/** Когда менялся каждый пункт настроек (ms; 0 — ни разу). Слияние — по пунктам, см. core/state.ts mergeStates. */
export type SettingsAt = Record<keyof Settings, number>;

export interface AppState {
  /** ms — для слияния «кто новее» */
  upd: number;
  /**
   * Когда прогресс сброшен (ms; 0 — никогда; командой progress:reset). Копия со старой меткой (кэш устройства
   * до сброса) при слиянии отдаёт слова, дни и предложения копии с новой — иначе сброшенное вернулось бы синхронизацией.
   */
  reset: number;
  settings: Settings;
  settingsAt: SettingsAt;
  srs: Record<string, WordState>;
  days: Record<string, DayLog>;
  sent: SentenceRecord[];
  /** незаконченная часть урока (core/session.ts SavedRun): «Продолжить» на главной и в «Пути»; null — нет */
  run: SavedRun | null;
  /** когда run последний раз менялся (ms; 0 — ни разу): при слиянии побеждает более поздний, в том числе «закончена» (null) */
  runAt: number;
}

/**
 * Незаконченная часть урока — сохраняется после каждого шага, чтобы вернуться к ней после ✕, закрытия приложения
 * или с другого устройства. Только части 1 и 2 (morning, evening); на другой календарный день устаревает.
 */
export interface SavedRun {
  kind: "morning" | "evening";
  /** день урока (ключ state.days); для части 2, перенесённой со вчера, — вчерашний */
  day: string;
  /** календарный день, когда занимались: сохранённое с прошлого дня не продолжают */
  date: string;
  /** зерно для вариантов ответа, пар и плиток каждого шага: продолжение открывает то же самое задание */
  seed: number;
  /** шаги (с добавленными повторами после ошибок), с какого продолжить (i), счёт и что уже засчитано (first) */
  steps: Step[];
  i: number;
  graded: number;
  right: number;
  revGraded: number;
  revRight: number;
  first: number[];
  newIds: string[];
  written: Record<number, SentenceRecord>;
  t0: number;
}

/* ---------- занятия ---------- */

/**
 * morning — часть 1 урока, evening — часть 2, extra — «ещё 6 новых»;
 * drill — «Пройти все слова» из словаря: тренировка, уровни, даты повтора и дни не меняются.
 */
export type SessionKind = "morning" | "evening" | "extra" | "drill";

interface StepBase {
  /** номер исходного шага; повтор после ошибки сохраняет k оригинала */
  k: number;
  retry?: boolean;
}

export type Step =
  | (StepBase & { t: "section"; pic: string; title: string; sub: string })
  | (StepBase & { t: "intro"; w: string })
  | (StepBase & { t: "pick" | "listen"; w: string; rev?: boolean })
  | (StepBase & { t: "type"; w: string; hint: boolean; rev?: boolean; eve?: boolean })
  | (StepBase & { t: "pairs"; ws: string[] })
  /** собери фразу по переводу (ru показан); rev — повторение уровня 2 */
  | (StepBase & { t: "build"; en: string; ru: string; w?: string; rev?: boolean })
  /** собери фразу на слух: фраза звучит, перевод — только после ответа (знакомство со словами, часть 1) */
  | (StepBase & { t: "build-listen"; en: string; ru: string; w?: string })
  | (StepBase & { t: "write"; ws: string[]; n: number })
  | (StepBase & { t: "speak"; n: number; w: string })
  | (StepBase & { t: "reread"; pages: string[] });

export type StepType = Step["t"];

export type Rng = () => number;
