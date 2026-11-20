import { useEffect, useState, type ReactNode } from "react";
import type { View } from "../App";
import { cardForDay, earnedCards, SEASON, type LessonCard } from "../core/cards";
import { todayKey } from "../core/dates";
import { lessonNo } from "../core/lesson";
import { pct, type Finished } from "../core/session";
import { streak } from "../core/srs";
import { plural } from "../core/text";
import type { AppState, Deck, SessionResult } from "../core/types";
import { Cards } from "../lib/icons";
import { CardBack, CardFront, cardNo } from "./cards";

/** «+12% к прошлому разу» — сравнение с прошлым таким же занятием. */
const compare = (res: SessionResult, prev: SessionResult | null): ReactNode => {
  if (!prev || !prev.total) return null;
  const dd = pct(res) - pct(prev);
  return dd > 0 ? <span className="up">+{dd}% к прошлому разу</span> : dd < 0 ? <span className="down">{dd}% к прошлому разу</span> : "Как в прошлый раз";
};

/**
 * Итог занятия. Часть 2 закрыла урок — момент награды: карточка урока влетает рубашкой вверх и переворачивается
 * лицом (0,4 с), потом блик и вибрация (0,8 с); при «уменьшить движение» — сразу лицом, без полёта.
 * Ниже — счёт, как всегда. Панели вкладок нет: итог — экран сосредоточенности.
 */
export function Result({ fin, state, deck, go, back }: { fin: Finished; state: AppState; deck: Deck; go: (v: View) => void; back?: View }) {
  const { result: res, prev, kind, day } = fin;
  const card = kind === "evening" ? cardForDay(earnedCards(state, deck), day) : null;
  if (card) return <Reward card={card} fin={fin} state={state} deck={deck} go={go} />;

  const n = lessonNo(fin.state.days, day);
  const drill = kind === "drill";
  const title = kind === "morning" ? `Урок ${n} · часть 1 готова` : kind === "evening" ? `Урок ${n} · часть 2 готова` : drill ? "Все слова пройдены" : "Занятие готово";
  const p = pct(res);
  const cmp = compare(res, prev);
  return (
    <>
      <main className="stage result">
        <div className="sect" style={{ paddingTop: 20 }}><div className="big">{p >= 90 ? "🏆" : p >= 70 ? "🥅" : "💪"}</div></div>
        <h2 style={{ fontSize: 30 }}>{title}</h2>
        <div className="score">{p}%</div>
        <p className="mute">
          {res.score} из {res.total} с первой попытки
          {cmp && <><br />{cmp}</>}
          {drill && <><br />Тренировка: уровни и даты повтора не изменились.</>}
        </p>
        <div className="stats3">
          {drill ? <div><b>{res.total}</b>заданий</div> : <div><b>{res.newN}</b>новых слов</div>}
          <div><b>{res.mins}</b>мин</div>
          <div><b>{streak(state.days, todayKey())}</b>дней подряд</div>
        </div>
      </main>
      <div className="foot"><div className="in"><button className="btn wide" onClick={() => go(back ?? { name: "home" })}>{back ? "К словам" : "На главную"}</button></div></div>
    </>
  );
}

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Звёздочки вокруг карточки: [x, y, размер, цвет, прозрачность] — от центра сцены. */
const SPARKS: [number, number, number, string, number][] = [
  [-157, -115, 22, "#f5b324", 1],
  [117, -141, 16, "#78a6ff", 1],
  [131, 75, 24, "#f5b324", 1],
  [-143, 111, 14, "#ff6b7c", 0.8],
  [97, -55, 10, "#fff", 1],
  [-125, -7, 10, "#f5b324", 0.7],
];

function Reward({ card, fin, state, deck, go }: { card: LessonCard; fin: Finished; state: AppState; deck: Deck; go: (v: View) => void }) {
  const { result: res, prev } = fin;
  const p = pct(res);
  const sk = streak(state.days, todayKey());
  const [phase, setPhase] = useState<"in" | "flip" | "done">(() => (reduced() ? "done" : "in"));
  useEffect(() => {
    if (phase === "done") return;
    const t1 = window.setTimeout(() => setPhase("flip"), 400);
    const t2 = window.setTimeout(() => {
      setPhase("done");
      try {
        navigator.vibrate?.(40);
      } catch {
        /* нет вибрации — и ладно */
      }
    }, 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []); // анимация — один раз при открытии

  return (
    <>
      <main className="stage result reward" data-phase={phase}>
        <p className="rw-kick">Урок {card.lesson} · часть 2 готова</p>
        <h2>Урок {card.lesson} пройден!</h2>
        <div className="rw-stage">
          <i className="rays" aria-hidden="true" />
          <i className="glow" aria-hidden="true" />
          {SPARKS.map(([x, y, s, c, o], i) => (
            <svg key={i} className="spark" style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, width: s, opacity: o }} viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 0c.9 5.4 4.6 9.1 10 10-5.4.9-9.1 4.6-10 10-.9-5.4-4.6-9.1-10-10C5.4 9.1 9.1 5.4 10 0z" fill={c} />
            </svg>
          ))}
          <div className="rw-fly">
            <div className="rw-flip" aria-label={`Карточка ${cardNo(card.pos)}: ${card.name}`} role="img">
              <div className="rw-face front"><CardFront card={card} className="rw-card" /></div>
              <div className="rw-face rear" aria-hidden="true"><CardBack card={card} deck={deck} className="rw-card" /></div>
            </div>
          </div>
        </div>
        <p className="rw-new"><span><Cards aria-hidden="true" /> Новая карточка · {cardNo(card.pos)} из {SEASON}</span></p>
        <div className="stats3">
          <div><b>{p}%</b>верно</div>
          <div><b>{card.words.length}</b>{plural(card.words.length, "новое слово", "новых слова", "новых слов")}</div>
          <div><b>{sk}</b>{plural(sk, "день", "дня", "дней")} подряд</div>
        </div>
        {compare(res, prev) && <p className="rw-cmp">{compare(res, prev)}</p>}
      </main>
      <div className="foot">
        <div className="in">
          <div className="frow">
            <button className="btn ghost" onClick={() => go({ name: "collection", season: card.season })}>В коллекцию</button>
            <button className="btn" onClick={() => go({ name: "home" })}>На главную</button>
          </div>
        </div>
      </div>
    </>
  );
}
