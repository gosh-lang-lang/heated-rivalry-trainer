import type { View } from "../App";
import { addDays, todayKey } from "../core/dates";
import { eveningWords, MAX_REVIEW, newToday } from "../core/plans";
import { dueList, groups, isHard, levelGroup, streak, unseen } from "../core/srs";
import { plural } from "../core/text";
import type { AppState, Deck } from "../core/types";
import { Check, Flame, Moon, Rink, Sun } from "../lib/icons";
import { useVoices } from "../lib/speech";

interface Props {
  deck: Deck;
  state: AppState;
  go: (v: View) => void;
  /** широкий экран: дашборд с боковой колонкой; на телефоне — только «сегодня» */
  wide?: boolean;
}

const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export function Home({ deck, state, go, wide = false }: Props) {
  const t = todayKey();
  const d = state.days[t] ?? {};
  const nt = newToday(deck, state, t);
  const due = nt.due;
  const nu = unseen(deck.words, state.srs).length;
  const np = nt.n;
  const g = groups(deck.words, state.srs);
  const tot = deck.words.length;
  const sk = streak(state.days, t);
  const tomorrow = dueList(deck.words, state.srs, addDays(t, 1)).length;
  const m = d.morning,
    e = d.evening;
  const ew = eveningWords(deck, state.srs, t).length;

  const mSub = m ? (
    <span className="done-tag"><Check /> Готово · {m.score}/{m.total}</span>
  ) : due || np ? (
    <>
      {`${due ? `${Math.min(due, MAX_REVIEW)} на повторение · ` : ""}${np ? `${np} ${plural(np, "новое", "новых", "новых")}` : nu ? "без новых" : "новые слова закончились"} · ~15 мин`}
      {nt.why && <span className="why">{nt.why[0].toUpperCase() + nt.why.slice(1)}</span>}
    </>
  ) : nu ? (
    "На сегодня повторений нет"
  ) : (
    "Новых слов нет — пришли новую партию в чат"
  );
  const eSub = e ? (
    <span className="done-tag"><Check /> Готово · {e.score}/{e.total}</span>
  ) : ew ? (
    m ? "Проверка, своё предложение, говорение · ~15 мин" : "Лучше после утреннего занятия"
  ) : (
    "Сначала пройди утреннее занятие"
  );

  // какое занятие сейчас главное — его карточку выделяем
  const now: "m" | "e" | "" = !m && (due || np) ? "m" : !e && ew && m ? "e" : "";
  const week = Array.from({ length: 7 }, (_, i) => {
    const k = addDays(t, i - 6);
    const dd = state.days[k] ?? {};
    return { k, wd: WD[new Date(k + "T12:00:00").getDay()], m: !!dd.morning, e: !!dd.evening };
  });
  const weekDone = week.reduce((n, x) => n + +x.m + +x.e, 0);

  const hard = deck.words
    .filter((w) => isHard(state.srs[w.id]))
    .sort((a, b) => state.srs[b.id].wrong - state.srs[a.id].wrong)
    .slice(0, 4);
  const today = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  const weekCard = (
    <section className="card week">
      <div className="wk-head">
        <h3>Неделя</h3>
        <span className="mute sm">{weekDone} из 14 занятий</span>
      </div>
      <ol className="wk">
        {week.map((x) => (
          <li key={x.k} data-today={x.k === t || undefined}>
            <span className="wd">{x.wd}</span>
            <i className={`dot am${x.m ? " on" : ""}`} title={x.m ? "Утро пройдено" : "Утро —"} />
            <i className={`dot pm${x.e ? " on" : ""}`} title={x.e ? "Вечер пройден" : "Вечер —"} />
            <span className="dn">{+x.k.slice(8)}</span>
          </li>
        ))}
      </ol>
      <p className="mute sm wk-legend"><i className="dot am on" /> утро <i className="dot pm on" /> вечер</p>
    </section>
  );

  return (
    <>
      <header className="hero">
        <Rink />
        <div className="hero-in">
          <div className="top">
            <span className="kick">Heated Rivalry · английский</span>
            {!wide && <span className="hdate">{today}</span>}
            <span className="chip"><Flame />{sk} {plural(sk, "день", "дня", "дней")}</span>
          </div>
          <h1>{new Date().getHours() < 16 ? "Доброе утро" : "Добрый вечер"}, Евгений</h1>
          <p>{now ? "Два занятия по 15 минут: утром учим, вечером применяем." : "На сегодня всё — отличная смена. До завтра!"}</p>
        </div>
      </header>
      <div className={`wrap home${now ? "" : " all-done"}`}>
        <div className="main-col">
          <div className="today">
            <section className={`card sess am${now === "m" ? " now" : ""}${m ? " done" : ""}`}>
              <div className="ic sun"><Sun /></div>
              <div className="stx"><h2>Утро · учим</h2><div className="mute sm">{mSub}</div></div>
              <div className="acts">
                {!m && (due || np) ? <button className="btn wide" onClick={() => go({ name: "session", kind: "morning" })}>Начать утреннее</button> : null}
                {m && nu && !due ? <button className="btn ghost wide" onClick={() => go({ name: "session", kind: "extra" })}>Ещё 6 новых слов</button> : null}
              </div>
            </section>
            <section className={`card sess pm${now === "e" ? " now" : ""}${e ? " done" : ""}`}>
              <div className="ic moon"><Moon /></div>
              <div className="stx"><h2>Вечер · применяем</h2><div className="mute sm">{eSub}</div></div>
              <div className="acts">
                {!e && ew ? <button className={`btn wide${m ? "" : " ghost"}`} onClick={() => go({ name: "session", kind: "evening" })}>Начать вечернее</button> : null}
              </div>
            </section>
          </div>
          {!wide && weekCard}
          <section className="card mywords">
            <div className="mw-head">
              <h3>Мои слова</h3>
              <span className="mw-total" aria-hidden="true">{tot}</span>
              {!wide && <button className="link mw-all" onClick={() => go({ name: "words" })}>Все слова</button>}
            </div>
            <div className="lv">{g.map((n, i) => <i key={i} className={`c${i}`} style={{ width: `${(n / tot) * 100}%` }} />)}</div>
            <div className="legend">
              {["Новые", "Учу", "Знакомо", "Выучено"].map((n, i) => (
                <div key={n}><span className={`c${i}`} />{n}<b>{g[i]}</b></div>
              ))}
            </div>
            <p className="mute sm mw-foot">Завтра на повторение: {tomorrow} · всего слов: {tot}</p>
            {wide && (
              <ul className="bybatch">
                <li className="cap" aria-hidden="true"><span>Партии</span><span /><span>выучено</span></li>
                {deck.batches.map((b) => {
                  const ws = deck.words.filter((w) => w.batch === b.id);
                  const bg = [0, 0, 0, 0];
                  ws.forEach((w) => bg[levelGroup(state.srs[w.id]?.lvl ?? 0)]++);
                  return (
                    <li key={b.id}>
                      <span className="bt">{b.title}</span>
                      <span className="lv mini" aria-hidden="true">{bg.map((n, i) => <i key={i} className={`c${i}`} style={{ width: `${(n / ws.length) * 100}%` }} />)}</span>
                      <span className="bn">{bg[3]} / {ws.length}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        {wide && (
          <aside className="side">
            {weekCard}
            {hard.length > 0 && (
              <section className="card hardmini">
                <h3>Трудные слова</h3>
                <ul>
                  {hard.map((w) => (
                    <li key={w.id}><span className="em" aria-hidden="true">{w.picture}</span><span><b>{w.en}</b><small>{w.ru}</small></span><em>{state.srs[w.id].wrong}×</em></li>
                  ))}
                </ul>
              </section>
            )}
            <SettingsSummary state={state} go={go} />
          </aside>
        )}
      </div>
    </>
  );
}

/** Десктоп: коротко о текущих настройках и переход на страницу «Настройки». */
function SettingsSummary({ state, go }: { state: AppState; go: (v: View) => void }) {
  const { voices, current } = useVoices();
  const v = voices.find((x) => x.id === current) ?? voices[0];
  return (
    <section className="card setsum">
      <dl>
        <div><dt>Новых слов за утро</dt><dd>{state.settings.newPerDay}</dd></div>
        <div><dt>Голос</dt><dd>{v?.name ?? "—"}</dd></div>
      </dl>
      <button className="btn ghost" onClick={() => go({ name: "settings" })}>Изменить</button>
    </section>
  );
}
