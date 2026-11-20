import type { CSSProperties, ReactNode } from "react";
import type { View } from "../App";
import { achievements, type Achievement, type AchievementGroup } from "../core/achievements";
import { SEASON, seasonView, type SeasonView } from "../core/cards";
import { todayKey } from "../core/dates";
import type { AppState, Deck } from "../core/types";
import { Cards, Check, Gear, Right } from "../lib/icons";
import { CardFront, CardLocked, ruDay } from "./cards";
import { StatsContent } from "./Stats";

/** «Сезон 1 · следующая карточка — после части 2 урока 5». */
export const nextCardNote = (sv: SeasonView) =>
  `Сезон ${sv.season} · следующая карточка — ${sv.todayDone ? `после урока ${sv.nextLesson}, завтра` : `после части 2 урока ${sv.nextLesson}`}`;

/** Веер карточек сезона: последние полученные и следующая (пунктиром). */
export function Fan({ sv, size, max = 4 }: { sv: SeasonView; size: number; max?: number }) {
  const shown = sv.got.slice(-max);
  const rot = [-8, -3, 2, 7, 11];
  return (
    <div className="fan" aria-hidden="true">
      {shown.map((c, i) => (
        <span key={c.no} className="fc" style={{ "--r": `${rot[i]}deg` } as CSSProperties}>
          <CardFront card={c} size={size} />
        </span>
      ))}
      {sv.next <= SEASON && (
        <span className="fc" style={{ "--r": `${rot[shown.length]}deg` } as CSSProperties}>
          <CardLocked pos={sv.next} gold={sv.next === SEASON} next size={size} />
        </span>
      )}
    </div>
  );
}

const ROWS: [AchievementGroup, string][] = [
  ["streak", "Серия дней"],
  ["words", "Слова"],
  ["lessons", "Уроки"],
  ["special", "Особые"],
];

/** Крупная надпись и подпись баннера. */
const face = (a: Achievement): [ReactNode, string, boolean] => {
  switch (a.id) {
    case "first-card":
      return [<Cards />, "1-я карточка", true];
    case "first-sentence":
      return ["✍️", "своя фраза", true];
    case "season-1":
      return ["🏆", "сезон 1", true];
  }
  const label = a.group === "streak" ? "дней подряд" : a.group === "words" ? "слов" : a.goal === 1 ? "первый урок" : "уроков";
  return [a.goal, label, false];
};

/** Баннер под сводами арены: получено — в цветах команды с датой, нет — серый с полоской прогресса. */
function Banner({ a }: { a: Achievement }) {
  const [big, label, emo] = face(a);
  const have = Math.min(a.have, a.goal);
  const got = !!a.got;
  return (
    <li className={`ban ${a.group}${got ? " got" : ""}`} aria-label={`${typeof big === "number" ? big + " " : ""}${label}: ${got ? `получено ${ruDay(a.got!)}` : `${have} из ${a.goal}`}`}>
      <div className="ban-f" aria-hidden="true">
        <i className="rod" />
        <b className={emo ? "emo" : ""}>{big}</b>
        <span>{label}</span>
        {got ? <i className="stripes" /> : <span className="bp"><i style={{ width: `${Math.max(4, (have / a.goal) * 100)}%` }} /></span>}
      </div>
      <small aria-hidden="true">{got ? <><Check />{ruDay(a.got!)}</> : `${have} из ${a.goal}`}</small>
    </li>
  );
}

/**
 * «Я»: шапка с именем и шестерёнкой (настройки), веер коллекции (→ «Коллекция»), достижения баннерами,
 * ниже — статистика, как была на вкладке «Статистика».
 */
export function Me({ deck, state, go, name }: { deck: Deck; state: AppState; go: (v: View) => void; name: string | null }) {
  const today = todayKey();
  const sv = seasonView(state, deck, today);
  const list = achievements(state, sv.cards, today);
  const gotN = list.filter((a) => a.got).length;
  const first = Object.keys(state.days)
    .filter((k) => state.days[k]?.morning || state.days[k]?.evening)
    .sort()[0];
  const who = name ?? "Я";

  return (
    <>
      <div className="pagehead mehead">
        <span className="ava" aria-hidden="true">{who[0].toUpperCase()}</span>
        <div className="me-who">
          <h1>{who}</h1>
          <span className="mute">{first ? `учится с ${ruDay(first)} · урок ${sv.todayDone ? sv.nextLesson - 1 : sv.nextLesson}` : "первый урок — впереди"}</span>
        </div>
        <button className="hbtn" aria-label="Настройки" onClick={() => go({ name: "settings" })}><Gear /></button>
      </div>
      <div className="wrap me">
        <button className="card mecoll" aria-label={`Коллекция: ${sv.got.length} из ${SEASON}`} onClick={() => go({ name: "collection" })}>
          <span className="sec-h"><h3>Коллекция</h3><span className="more">{sv.got.length} из {SEASON} <Right /></span></span>
          <Fan sv={sv} size={5.2} />
          <span className="seasonbar"><i style={{ width: `${(sv.got.length / SEASON) * 100}%` }} /></span>
          <span className="mute sm cnote">{nextCardNote(sv)}</span>
        </button>
        <section className="ach" aria-labelledby="ach-h">
          <div className="sec-title"><h2 id="ach-h">Достижения</h2><span>{gotN} из {list.length}</span></div>
          {ROWS.map(([g, title]) => (
            <section className="achrow" key={g}>
              <h4>{title}</h4>
              <ol className="bans" aria-label={title}>
                {list.filter((a) => a.group === g).map((a) => <Banner key={a.id} a={a} />)}
              </ol>
            </section>
          ))}
        </section>
      </div>
      <div className="sec-title me-stats-h"><h2>Статистика</h2></div>
      <StatsContent deck={deck} state={state} />
    </>
  );
}
