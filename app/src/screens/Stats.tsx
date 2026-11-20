import type { CSSProperties } from "react";
import { addDays, todayKey } from "../core/dates";
import { pct } from "../core/session";
import { groups, streak } from "../core/srs";
import { plural } from "../core/text";
import type { AppState, Deck, SessionResult } from "../core/types";
import { Back } from "../lib/icons";

export function Stats({ deck, state, onBack }: { deck: Deck; state: AppState; onBack: () => void }) {
  const t = todayKey();
  const rows: [string, SessionResult | undefined, SessionResult | undefined][] = [];
  for (let i = 13; i >= 0; i--) {
    const k = addDays(t, -i),
      d = state.days[k] ?? {};
    rows.push([k, d.morning, d.evening]);
  }
  const p = (x?: SessionResult) => (x && x.total ? pct(x) : 0);
  const hard = deck.words
    .filter((w) => state.srs[w.id]?.wrong)
    .sort((a, b) => state.srs[b.id].wrong - state.srs[a.id].wrong)
    .slice(0, 10);
  const g = groups(deck.words, state.srs);
  const sk = streak(state.days, t);

  return (
    <>
      <div className="pagehead">
        <button className="x" aria-label="Назад" onClick={onBack}><Back /></button>
        <h1>Статистика</h1>
      </div>
      <div className="wrap stats">
        <div className="stats3">
          <div className="streak"><b>{sk}</b>{plural(sk, "день", "дня", "дней")} подряд</div>
          <div><b>{g[1] + g[2] + g[3]}</b>в работе</div>
          <div><b>{g[3]}</b>выучено</div>
        </div>
        <div className="stats-grid">
        <section className="card chart">
          <h3>Последние 2 недели</h3>
          <p className="mute sm" style={{ margin: "4px 0" }}>Жёлтый — утро, синий — вечер, % верно с первой попытки</p>
          <div className="hchart">
          {rows.map(([k, m, e]) => (
            <div className="hrow" key={k} data-today={k === t || undefined}>
              <span>{k.slice(8)}<small>.{k.slice(5, 7)}</small></span>
              <div className="hb" title={`Утро ${m ? `${m.score}/${m.total}` : "—"}`}><i className="m" style={{ "--p": `${p(m)}%` } as CSSProperties} /></div>
              <div className="hb" title={`Вечер ${e ? `${e.score}/${e.total}` : "—"}`}><i className="e" style={{ "--p": `${p(e)}%` } as CSSProperties} /></div>
            </div>
          ))}
          </div>
        </section>
        <section className="card hard">
          <h3>Где ошибаюсь чаще</h3>
          {hard.length ? (
            hard.map((w) => (
              <div className="wrow" key={w.id}>
                <div className="em">{w.picture}</div>
                <div><b>{w.en}</b><span className="mute sm">{w.ru}</span></div>
                <span className="mute">{state.srs[w.id].wrong}×</span>
              </div>
            ))
          ) : (
            <p className="mute">Пока ошибок нет</p>
          )}
        </section>
        </div>
        <section className="card mysent">
          <h3>Мои предложения</h3>
          {state.sent.length ? (
            state.sent
              .slice(-12)
              .reverse()
              .map((s, i) => (
                <div className="sline" key={s.at + i}>
                  {s.pending ? (
                    <><b>{s.text}</b><div className="mute sm">Ждёт проверки</div></>
                  ) : s.ok ? (
                    <b>{s.text}</b>
                  ) : (
                    <><s>{s.text}</s><br /><b>{s.corrected ?? ""}</b></>
                  )}
                  {s.comment && <div className="mute sm">{s.comment}</div>}
                </div>
              ))
          ) : (
            <p className="mute">Появятся после вечернего занятия</p>
          )}
        </section>
      </div>
    </>
  );
}
