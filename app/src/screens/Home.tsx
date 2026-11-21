import { useEffect, useState } from "react";
import type { View } from "../App";
import { addDays, greeting, nowDate } from "../core/dates";
import { hhmm, lessonStatus, resumeLabel, untilText, type LessonPart } from "../core/lesson";
import { MAX_REVIEW, newToday } from "../core/plans";
import { dueList, groups, isHard, levelGroup, streak, unseen } from "../core/srs";
import { plural } from "../core/text";
import type { AppState, Deck, SessionResult } from "../core/types";
import { Check, Flame, Rink } from "../lib/icons";
import { AWAY_CITIES, CITIES_SVG } from "../lib/scenes";
import { useVoices } from "../lib/speech";
import { ThemeToggle } from "../ui";
import { StreakSheet } from "./streak";

interface Props {
  deck: Deck;
  state: AppState;
  go: (v: View) => void;
  /** широкий экран: дашборд с боковой колонкой; на телефоне — только «сегодня» */
  wide?: boolean;
  /** как зовут вошедшего — для приветствия; null — просто «Доброе утро» */
  name?: string | null;
}

const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/**
 * Текущее время по часам сервера (core/dates.ts nowDate): перерисовка раз в минуту (на границе минуты) и при возвращении
 * в приложение — для отсчёта до части 2. Считается при каждой отрисовке: пришла поправка на сервер — «сегодня» верное сразу.
 */
export function useNow(): Date {
  const [, setNow] = useState(0);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      setNow((n) => n + 1);
      id = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    id = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    const onShow = () => document.visibilityState === "visible" && setNow((n) => n + 1);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);
  return nowDate();
}

/** Подпись начатой и не законченной части. */
const RESUME_SUB = "Начата сегодня — продолжишь с того же задания";

export function Home({ deck, state, go, wide = false, name = null }: Props) {
  const clock = useNow();
  const [streakOpen, setStreakOpen] = useState(false);
  const ls = lessonStatus(state, deck, clock);
  const t = ls.today;
  const nt = newToday(deck, state, t);
  const due = nt.due;
  const nu = unseen(deck.words, state.srs).length;
  const np = nt.n;
  const g = groups(deck.words, state.srs);
  const tot = deck.words.length;
  const sk = streak(state.days, t);
  const tomorrow = dueList(deck.words, state.srs, addDays(t, 1)).length;

  const doneTag = (r: SessionResult) => <span className="done-tag"><Check /> Готово · {r.score}/{r.total}</span>;

  /** Часть 1 — учим: повторения и новые слова. */
  const part1 = (p: LessonPart) => {
    const sub = p.done ? (
      doneTag(p.done)
    ) : p.resume ? (
      RESUME_SUB
    ) : due || np ? (
      <>
        {`${due ? `${Math.min(due, MAX_REVIEW)} на повторение · ` : ""}${np ? `${np} ${plural(np, "новое", "новых", "новых")}` : nu ? "без новых" : "новые слова закончились"} · ~15 мин`}
        {nt.why && <span className="why">{nt.why[0].toUpperCase() + nt.why.slice(1)}</span>}
        {p.secondary && <span className="why">Лучше после части 2 урока {p.n - 1}</span>}
      </>
    ) : nu ? (
      "На сегодня повторений нет"
    ) : (
      "Новых слов нет — пришли новую партию в чат"
    );
    return (
      <section key="p1" className={`card sess am${ls.focus === 1 ? " now" : ""}${p.done ? " done" : ""}`}>
        <div className="ic sun">{p.done ? <Check /> : <b className="pn" aria-hidden="true">1</b>}</div>
        <div className="stx"><h2>Урок {p.n} · часть 1 — учим</h2><div className="mute sm">{sub}</div></div>
        <div className="acts">
          {p.resume ? (
            <>
              <button className={`btn wide${p.secondary ? " ghost" : ""}`} onClick={() => go({ name: "session", kind: "morning" })}>{resumeLabel(p.resume)}</button>
              <button className="btn ghost wide" onClick={() => go({ name: "session", kind: "morning", restart: true })}>Начать заново</button>
            </>
          ) : p.can ? (
            <button className={`btn wide${p.secondary ? " ghost" : ""}`} onClick={() => go({ name: "session", kind: "morning" })}>Начать часть 1</button>
          ) : null}
          {p.done && nu && !due ? <button className="btn ghost wide" onClick={() => go({ name: "session", kind: "extra" })}>Ещё 6 новых слов</button> : null}
        </div>
      </section>
    );
  };

  /** Часть 2 — применяем: после паузы от конца части 1; перенесённая со вчера — первой. */
  const part2 = (p: LessonPart) => {
    const start = (label: string, ghost: boolean, restart = false) => (
      <button
        className={`btn wide${ghost ? " ghost" : ""}`}
        onClick={() => go({ name: "session", kind: "evening", ...(p.carried ? { day: p.day } : {}), ...(restart ? { restart } : {}) })}
      >
        {label}
      </button>
    );
    const sub = p.done ? (
      doneTag(p.done)
    ) : !p.can ? (
      "Сначала пройди часть 1"
    ) : p.resume ? (
      RESUME_SUB
    ) : p.advice === "late" ? (
      "Сегодня уже поздно — часть 2 лучше завтра первым делом"
    ) : p.advice === "wait" && p.after ? (
      <>
        Лучше после {hhmm(p.after)}
        <span className="why">{untilText(clock, p.after)} · можно и сейчас</span>
      </>
    ) : p.carried ? (
      <>
        Осталась с прошлого раза — начни с неё
        <span className="why">Проверка, своё предложение, говорение · ~15 мин</span>
      </>
    ) : (
      "Проверка, своё предложение, говорение · ~15 мин"
    );
    return (
      <section key="p2" className={`card sess pm${ls.focus === 2 ? " now" : ""}${p.advice === "wait" ? " wait" : ""}${p.done ? " done" : ""}`}>
        <div className="ic moon">{p.done ? <Check /> : <b className="pn" aria-hidden="true">2</b>}</div>
        <div className="stx"><h2>Урок {p.n} · часть 2 — применяем</h2><div className="mute sm">{sub}</div></div>
        <div className="acts">
          {p.resume ? (
            <>
              {start(resumeLabel(p.resume), false)}
              {start("Начать заново", true, true)}
            </>
          ) : p.can ? (
            p.advice === "late" ? start("Всё равно сейчас", true) : start("Начать часть 2", p.advice === "wait")
          ) : null}
        </div>
      </section>
    );
  };

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
  const today = clock.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  /** «Выезд»: урок — рейс на табло вылетов. Часть 1 — посадка, пауза до части 2 — пересадка, поздно — задержан. */
  const board = (() => {
    if (state.settings.look !== "away") return null;
    const cur = ls.cards.find((c) => c.part === ls.focus) ?? ls.cards.find((c) => c.can) ?? ls.cards[0];
    const late = !ls.focus && ls.cards.some((c) => c.can && c.advice === "late");
    const [st, cls] =
      ls.focus === 2 && cur.advice === "wait"
        ? [cur.after ? `Пересадка до ${hhmm(cur.after)}` : "Пересадка", "wait"]
        : ls.focus
          ? ["Посадка", "go"]
          : late
            ? ["Задержан до утра", "late"]
            : ["Прибыл", "done"];
    return (
      <dl className="hero-board" aria-label="Табло вылетов">
        <div><dt>Рейс</dt><dd>HR {String(cur.n).padStart(3, "0")}</dd></div>
        <div className="to"><dt>Куда</dt><dd>{AWAY_CITIES[(cur.n - 1) % AWAY_CITIES.length]}</dd></div>
        <div><dt>Выход</dt><dd>{cur.part}</dd></div>
        <div className="st"><dt>Статус</dt><dd className={cls}>{st}</dd></div>
      </dl>
    );
  })();

  const weekCard = (
    <section className="card week">
      <div className="wk-head">
        <h3>Неделя</h3>
        <span className="mute sm">{weekDone} из 14 частей</span>
      </div>
      <ol className="wk">
        {week.map((x) => (
          <li key={x.k} data-today={x.k === t || undefined}>
            <span className="wd">{x.wd}</span>
            <i className={`dot am${x.m ? " on" : ""}`} title={x.m ? "Часть 1 пройдена" : "Часть 1 —"} />
            <i className={`dot pm${x.e ? " on" : ""}`} title={x.e ? "Часть 2 пройдена" : "Часть 2 —"} />
            <span className="dn">{+x.k.slice(8)}</span>
          </li>
        ))}
      </ol>
      <p className="mute sm wk-legend"><i className="dot am on" /> часть 1 <i className="dot pm on" /> часть 2</p>
    </section>
  );

  return (
    <>
      <header className="hero">
        {state.settings.look.startsWith("cities") ? <i className="hero-city" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CITIES_SVG }} /> : <Rink />}
        <div className="hero-in">
          <div className="top">
            <span className="kick">Heated Rivalry · английский</span>
            {!wide && <span className="hdate">{today}</span>}
            <button className={`chip${sk ? "" : " zero"}`} aria-haspopup="dialog" aria-label={`${sk} ${plural(sk, "день", "дня", "дней")} подряд — подробнее о серии`} onClick={() => setStreakOpen(true)}><Flame aria-hidden="true" />{sk} {plural(sk, "день", "дня", "дней")}</button>
            {!wide && <ThemeToggle />}
          </div>
          <h1>{greeting(clock)}{name ? `, ${name}` : ""}</h1>
          <p>{ls.focus ? "Урок из двух частей по ~15 минут: сначала учим, потом применяем." : "На сегодня всё — отличная смена. До завтра!"}</p>
          {board}
        </div>
      </header>
      {streakOpen && <StreakSheet days={state.days} today={t} go={go} onClose={() => setStreakOpen(false)} />}
      <div className={`wrap home${ls.focus ? "" : " all-done"}`}>
        <div className="main-col">
          <div className="today">
            {ls.cards.map((p) => (p.part === 1 ? part1(p) : part2(p)))}
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
        <div><dt>Новых слов за урок</dt><dd>{state.settings.newPerDay}</dd></div>
        <div><dt>Голос</dt><dd>{v?.name ?? "—"}</dd></div>
      </dl>
      <button className="btn ghost" onClick={() => go({ name: "settings" })}>Изменить</button>
    </section>
  );
}
