import { LESSONS_PER_SEASON, inSeason, lessonCursor, lessonHistory, seasonOf, seasonProgress, seasonRewards, type LessonRecord, type SeasonReward } from "./curriculum";
import { dayOfIso } from "./dates";
import type { AppState, Deck, SessionResult } from "./types";

/** Карточка — за обе части урока. no — порядок наград, season/pos — место урока, subjectNo — сохранённый сюжет. */
export const SEASON = LESSONS_PER_SEASON;
export { inSeason, seasonOf, lessonComplete } from "./curriculum";

export type CardCategory = "Герой" | "Команда" | "Место" | "Сцена" | "Финал";

/** Сюжет карточки: кто или что на ней. art — ключ рисунка-заглушки (screens/cards.tsx). */
export interface CardSubject {
  cat: CardCategory;
  name: string;
  line: string;
  art: string;
}

/** Сезон 1 — по книге. Порядок = номер карточки в сезоне. */
export const SEASON1: CardSubject[] = [
  { cat: "Герой", name: "Шейн Холландер", line: "Звезда «Вояжёров». Играет так, будто на кону вся жизнь.", art: "shane" },
  { cat: "Герой", name: "Илья Розанов", line: "Заклятый соперник. Мастер подколок — banter.", art: "ilya" },
  { cat: "Место", name: "Раздевалка", line: "Здесь звучат самые громкие подколки.", art: "room" },
  { cat: "Команда", name: "«Вояжёры»", line: "Монреаль. Вековая история и столько же гордости.", art: "team" },
  { cat: "Сцена", name: "Вбрасывание", line: "Шайба падает — и всё начинается.", art: "faceoff" },
  { cat: "Команда", name: "«Рейдерс»", line: "Бостон. Чёрное с золотом и ни шагу назад.", art: "raiders" },
  { cat: "Место", name: "Арена", line: "Двадцать тысяч зрителей и один лёд на двоих.", art: "arena" },
  { cat: "Сцена", name: "Пресс-конференция", line: "Улыбаться в камеры и не сказать ни слова лишнего.", art: "press" },
  { cat: "Место", name: "Коттедж у озера", line: "Место, где можно не притворяться.", art: "cottage" },
  { cat: "Финал", name: "Финал сезона", line: "Десять уроков — один сезон. Кубок твой.", art: "cup" },
];

const GENERIC: [CardCategory, string][] = [
  ["Герой", "shane"],
  ["Команда", "team"],
  ["Место", "room"],
  ["Сцена", "faceoff"],
  ["Герой", "ilya"],
  ["Команда", "raiders"],
  ["Место", "arena"],
  ["Сцена", "press"],
  ["Место", "cottage"],
];

/** Золотое оформление сюжета (старые награды сохраняют его независимо от места урока). */
export const isGold = (subjectNo: number) => inSeason(subjectNo) === SEASON;

/** Сюжет карточки no: сезон 1 — по книге; дальше — общий, пока не придумали свои. */
export const cardSubject = (no: number): CardSubject => {
  const s = seasonOf(no),
    i = inSeason(no);
  if (s === 1) return SEASON1[i - 1];
  if (i === SEASON) return { cat: "Финал", name: `Финал сезона ${s}`, line: `Финальный урок сезона ${s} пройден.`, art: "cup" };
  const [cat, art] = GENERIC[i - 1];
  return { cat, name: `Сезон ${s} · карточка №${String(i).padStart(2, "0")}`, line: "Карточка за урок — на обороте его слова.", art };
};

export interface LessonCard extends CardSubject {
  /** номер карточки по порядку получения: 1, 2, … */
  no: number;
  season: number;
  /** Место урока в сезоне: 1…SEASON; пропущенная часть 2 оставляет пустое место. */
  pos: number;
  gold: boolean;
  /** Отдельный бонус за финальный урок; не зависит от сюжета старой карточки. */
  final: boolean;
  subjectNo: number;
  artSeason: number;
  artPos: number;
  /** день урока — ключ в state.days */
  day: string;
  /** номер урока (как на главной — сколько дней до него пройдена часть 1, плюс один) */
  lesson: number;
  /** когда урок стал пройденным (конец части 2), YYYY-MM-DD */
  got: string;
  part1: SessionResult;
  part2: SessionResult;
  /** верно с первой попытки за обе части, % */
  pct: number;
  /** минут за обе части */
  mins: number;
  /** id слов урока — выученных в день урока (в порядке колоды) */
  words: string[];
}


/** Все карточки в прежнем порядке наград; историю и результаты не переписываем. */
export const earnedCards = (state: AppState, deck: Deck): LessonCard[] => {
  const out: LessonCard[] = [];
  for (const l of lessonHistory(state, deck, "")) {
    if (!l.complete) continue;
    const no = out.length + 1;
    // До первого parseState старый импорт также показывает прежние сюжеты.
    const subjectNo = l.part2!.cardSubject ?? no;
    const p1 = l.part1, p2 = l.part2!;
    const total = p1.total + p2.total;
    out.push({
      ...cardSubject(subjectNo), no, subjectNo,
      season: l.season, pos: l.pos, final: l.final,
      artSeason: seasonOf(subjectNo), artPos: inSeason(subjectNo), gold: isGold(subjectNo),
      day: l.day, lesson: l.no, got: dayOfIso(p2.at) ?? l.day, part1: p1, part2: p2,
      pct: total ? Math.round(((p1.score + p2.score) / total) * 100) : 100,
      mins: p1.mins + p2.mins, words: l.words,
    });
  }
  return out;
};

/** Карточка урока дня `day`, если урок пройден. */
export const cardForDay = (cards: LessonCard[], day: string): LessonCard | null => cards.find((c) => c.day === day) ?? null;

/** Сезон текущего урока, включая перенесённую часть 2; количество карточек здесь не участвует. */
export const currentSeason = (days: AppState["days"], today: string): number => lessonCursor(days, today).season;

export interface SeasonView {
  cards: LessonCard[];
  season: number;
  got: LessonCard[];
  /** Позиция текущего урока в сезоне, а не порядковый номер награды. */
  next: number;
  nextLesson: number;
  todayDone: boolean;
  day: string;
  history: LessonRecord[];
  progress: ReturnType<typeof seasonProgress>;
  rewards: SeasonReward[];
}

export const seasonView = (state: AppState, deck: Deck, today: string): SeasonView => {
  const cards = earnedCards(state, deck);
  const cursor = lessonCursor(state.days, today);
  const history = lessonHistory(state, deck, today);
  return {
    cards, season: cursor.season, got: cards.filter((c) => c.season === cursor.season),
    next: cursor.pos, nextLesson: cursor.no, todayDone: cursor.todayDone, day: cursor.day,
    history, progress: seasonProgress(history, cursor.season), rewards: seasonRewards(history),
  };
};
