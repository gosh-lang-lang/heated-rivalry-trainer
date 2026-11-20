import type { ReactNode } from "react";
import { todayKey } from "../core/dates";
import { lessonNo } from "../core/lesson";
import { pct, type Finished } from "../core/session";
import { streak } from "../core/srs";
import type { AppState } from "../core/types";

export function Result({ fin, state, onHome }: { fin: Finished; state: AppState; onHome: () => void }) {
  const { result: res, prev, kind, day } = fin;
  const n = lessonNo(fin.state.days, day);
  const title = kind === "morning" ? `Урок ${n} · часть 1 готова` : kind === "evening" ? `Урок ${n} · часть 2 готова` : "Занятие готово";
  const p = pct(res);
  let cmp: ReactNode = null;
  if (prev && prev.total) {
    const dd = p - pct(prev);
    cmp = dd > 0 ? <span className="up">+{dd}% к прошлому разу</span> : dd < 0 ? <span className="down">{dd}% к прошлому разу</span> : "Как в прошлый раз";
  }
  return (
    <>
      <main className="stage result">
        <div className="sect" style={{ paddingTop: 20 }}><div className="big">{p >= 90 ? "🏆" : p >= 70 ? "🥅" : "💪"}</div></div>
        <h2 style={{ fontSize: 30 }}>{title}</h2>
        <div className="score">{p}%</div>
        <p className="mute">
          {res.score} из {res.total} с первой попытки
          {cmp && <><br />{cmp}</>}
        </p>
        <div className="stats3">
          <div><b>{res.newN}</b>новых слов</div>
          <div><b>{res.mins}</b>мин</div>
          <div><b>{streak(state.days, todayKey())}</b>дней подряд</div>
        </div>
      </main>
      <div className="foot"><div className="in"><button className="btn wide" onClick={onHome}>На главную</button></div></div>
    </>
  );
}
