import type { View } from "../App";
import { SEASON, seasonView } from "../core/cards";
import { todayKey } from "../core/dates";
import type { AppState, Deck } from "../core/types";
import { Back, Lock } from "../lib/icons";
import { CardFront, CardLocked, cardNo } from "./cards";

/**
 * «Я» → «Коллекция»: вкладки сезонов (пройденные и текущий; следующий — закрыт), прогресс сезона, сетка из 10 карточек.
 * Полученные — в цвете (нажатие — карточка во весь экран), следующая — синий пунктир, остальные закрыты, финальная — золотая.
 */
export function Collection({ deck, state, go, season }: { deck: Deck; state: AppState; go: (v: View) => void; season?: number }) {
  const sv = seasonView(state, deck, todayKey());
  const shown = Math.min(Math.max(season ?? sv.season, 1), sv.season);
  const got = sv.cards.filter((c) => c.season === shown);
  const current = shown === sv.season;
  const pct = Math.round((got.length / SEASON) * 100);
  const seasons = Array.from({ length: sv.season }, (_, i) => i + 1);
  const view: View = { name: "collection", season: shown };

  return (
    <>
      <div className="pagehead set-head coll-head">
        <button className="sback" aria-label="Назад: Я" onClick={() => go({ name: "me" })}>
          <Back aria-hidden="true" />Я
        </button>
        <div className="coll-t">
          <h1>Коллекция</h1>
          <span className="ph-meta">{got.length} из {SEASON}</span>
        </div>
      </div>
      <div className="wrap coll">
        <div className="seg2" role="group" aria-label="Сезоны">
          {seasons.map((s) => {
            const n = sv.cards.filter((c) => c.season === s).length;
            return (
              <button key={s} aria-pressed={s === shown} onClick={() => go({ name: "collection", season: s })}>
                Сезон {s} <em>{n}/{SEASON}</em>
              </button>
            );
          })}
          <button disabled aria-label={`Сезон ${sv.season + 1} — закрыт`}>Сезон {sv.season + 1} <Lock aria-hidden="true" /></button>
        </div>
        <section className="card cprog">
          <div className="cp-top"><b>Карточка за каждый урок</b><span>{pct}%</span></div>
          <div className="seasonbar"><i style={{ width: `${pct}%` }} /></div>
          <p>
            {current
              ? `Следующая — ${cardNo(sv.next)}, ${sv.todayDone ? `после урока ${sv.nextLesson} (завтра)` : `после части 2 урока ${sv.nextLesson}`}. На обороте каждой — слова её урока.`
              : `Сезон ${shown} собран целиком. На обороте каждой карточки — слова её урока.`}
          </p>
        </section>
        <ol className="cgrid" aria-label={`Сезон ${shown}`}>
          {Array.from({ length: SEASON }, (_, i) => {
            const pos = i + 1;
            const c = got.find((x) => x.pos === pos);
            if (c)
              return (
                <li key={pos}>
                  <button className="cg-open" aria-label={`${cardNo(pos)}: ${c.name}`} onClick={() => go({ name: "card", no: c.no, from: view })}>
                    <CardFront card={c} />
                  </button>
                  <b>{c.name}</b>
                  <small>Урок {c.lesson} · {c.cat}</small>
                </li>
              );
            const gold = pos === SEASON;
            const next = current && pos === sv.next;
            const lesson = sv.nextLesson + (pos - sv.next);
            return (
              <li key={pos} className={next ? "nx" : "lk"} aria-label={`${cardNo(pos)}: ${next ? "следующая" : "закрыта"}`}>
                <CardLocked pos={pos} gold={gold} next={next} />
                {next ? (
                  <>
                    <b>{sv.todayDone ? "Завтра" : "Сегодня"}</b>
                    <small>{sv.todayDone ? `урок ${sv.nextLesson}` : "после части 2"}</small>
                  </>
                ) : gold ? (
                  <>
                    <b>Финал сезона</b>
                    <small>Урок {lesson}</small>
                  </>
                ) : (
                  <>
                    <b>Урок {lesson}</b>
                    <small>закрыта</small>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}
