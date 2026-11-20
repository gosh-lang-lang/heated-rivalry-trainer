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

export interface Settings {
  newPerDay: number;
}

export interface AppState {
  /** ms — для слияния «кто новее» */
  upd: number;
  settings: Settings;
  srs: Record<string, WordState>;
  days: Record<string, DayLog>;
  sent: SentenceRecord[];
}

/* ---------- занятия ---------- */

export type SessionKind = "morning" | "evening" | "extra";

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
  | (StepBase & { t: "build"; en: string; ru: string; w?: string })
  | (StepBase & { t: "write"; ws: string[]; n: number })
  | (StepBase & { t: "speak"; n: number; w: string })
  | (StepBase & { t: "reread"; pages: string[] });

export type StepType = Step["t"];

export type Rng = () => number;
