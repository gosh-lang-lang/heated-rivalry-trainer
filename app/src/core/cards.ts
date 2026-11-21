import { dayOfIso } from "./dates";
import { carriedDay, lessonNo } from "./lesson";
import { lessonWords } from "./plans";
import type { AppState, Deck, SessionResult } from "./types";

/*
 * Карточки-награды: одна за каждый пройденный урок (пройдены часть 1 и часть 2; перенесённая часть 2
 * пишет итог в день урока — урок становится пройденным, когда её сделали). Карточка N — N-й пройденный урок.
 * Сезон — SEASON карточек, последняя в сезоне — золотая «Финал сезона».
 * Всё выводится из state.days (и state.srs для слов урока) — отдельных полей нет, поэтому карточки
 * синхронизируются и сливаются вместе с прогрессом (mergeStates) без новых правил.
 */

/** Карточек (уроков) в сезоне. */
export const SEASON = 10;

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

/** Сезон карточки с номером no (1, 2, …). */
export const seasonOf = (no: number) => Math.floor((no - 1) / SEASON) + 1;
/** Место карточки в сезоне: 1…SEASON. */
export const inSeason = (no: number) => ((no - 1) % SEASON) + 1;
/** Золотая — последняя в сезоне. */
export const isGold = (no: number) => inSeason(no) === SEASON;

/** Сюжет карточки no: сезон 1 — по книге; дальше — общий, пока не придумали свои. */
export const cardSubject = (no: number): CardSubject => {
  const s = seasonOf(no),
    i = inSeason(no);
  if (s === 1) return SEASON1[i - 1];
  if (i === SEASON) return { cat: "Финал", name: `Финал сезона ${s}`, line: `Сезон ${s} пройден целиком.`, art: "cup" };
  const [cat, art] = GENERIC[i - 1];
  return { cat, name: `Сезон ${s} · №${String(i).padStart(2, "0")}`, line: "Карточка за урок — на обороте его слова.", art };
};

export interface LessonCard extends CardSubject {
  /** номер карточки по порядку получения: 1, 2, … */
  no: number;
  season: number;
  /** место в сезоне: 1…SEASON */
  pos: number;
  gold: boolean;
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


/** Урок дня пройден целиком: обе части. */
export const lessonComplete = (d: AppState["days"][string] | undefined): boolean => !!d?.morning && !!d?.evening;

/**
 * Все полученные карточки по порядку. Пройденные уроки идут по дням урока: перенесённую часть 2 можно сделать,
 * только пока не начат следующий урок, так что порядок дней и порядок прохождения совпадают.
 */
export const earnedCards = (state: AppState, deck: Deck): LessonCard[] => {
  const keys = Object.keys(state.days).sort();
  let lesson = 0;
  const out: LessonCard[] = [];
  for (const day of keys) {
    const d = state.days[day];
    if (!d?.morning) continue;
    lesson++;
    if (!d.evening) continue;
    const no = out.length + 1;
    const p1 = d.morning,
      p2 = d.evening;
    const score = p1.score + p2.score,
      total = p1.total + p2.total;
    out.push({
      ...cardSubject(no),
      no,
      season: seasonOf(no),
      pos: inSeason(no),
      gold: isGold(no),
      day,
      lesson,
      got: dayOfIso(p2.at) ?? day,
      part1: p1,
      part2: p2,
      pct: total ? Math.round((score / total) * 100) : 100,
      mins: p1.mins + p2.mins,
      words: lessonWords(deck, state.srs, day).map((w) => w.id),
    });
  }
  return out;
};

/** Карточка урока дня `day`, если урок пройден. */
export const cardForDay = (cards: LessonCard[], day: string): LessonCard | null => cards.find((c) => c.day === day) ?? null;

/** Сезон, который сейчас идёт: в нём следующая карточка (после 10-й — уже следующий сезон). */
export const currentSeason = (cards: LessonCard[]): number => seasonOf(cards.length + 1);

/** Что показывать на «Пути», в коллекции и в «Я»: текущий сезон, полученные в нём карточки и следующая. */
export interface SeasonView {
  /** все полученные карточки */
  cards: LessonCard[];
  /** текущий сезон */
  season: number;
  /** полученные в текущем сезоне */
  got: LessonCard[];
  /** место следующей карточки в сезоне (1…SEASON) — текущий урок на пути */
  next: number;
  /** номер урока, который даст следующую карточку */
  nextLesson: number;
  /** урок сегодня пройден целиком — следующий будет завтра */
  todayDone: boolean;
  /** день текущего урока: перенесённой части 2 — день урока, иначе сегодня (завтра, если сегодня всё) */
  day: string;
}

export const seasonView = (state: AppState, deck: Deck, today: string): SeasonView => {
  const cards = earnedCards(state, deck);
  const season = currentSeason(cards);
  const got = cards.filter((c) => c.season === season);
  // перенесённую часть 2 уже сделали сегодня — тот урок пройден, текущий — сегодняшний
  const c = carriedDay(state.days, today);
  const carry = c && !lessonComplete(state.days[c]) ? c : null;
  const todayDone = !carry && lessonComplete(state.days[today]);
  const day = carry ?? today;
  const n = lessonNo(state.days, day);
  return { cards, season, got, next: got.length + 1, nextLesson: todayDone ? n + 1 : n, todayDone, day };
};
