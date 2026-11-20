import { useState } from "react";
import { ruDate } from "../core/dates";
import { levelGroup } from "../core/srs";
import { plural } from "../core/text";
import type { AppState, Deck } from "../core/types";
import { Back } from "../lib/icons";
import { SpeakBtn } from "../ui";

const LEVELS = ["Новые", "Учу", "Знакомо", "Выучено"];

export function Words({ deck, state, onBack }: { deck: Deck; state: AppState; onBack: () => void }) {
  const [batch, setBatch] = useState(0); // 0 — все партии
  const [lvl, setLvl] = useState(-1); // -1 — все уровни
  const [q, setQ] = useState("");

  const grp = (id: string) => levelGroup(state.srs[id]?.lvl ?? 0);
  const needle = q.trim().toLowerCase();
  const shown = deck.words.filter(
    (w) =>
      (!batch || w.batch === batch) &&
      (lvl < 0 || grp(w.id) === lvl) &&
      (!needle || w.en.toLowerCase().includes(needle) || w.ru.toLowerCase().includes(needle)),
  );
  const byLvl = [0, 1, 2, 3].map((i) => deck.words.filter((w) => grp(w.id) === i).length);

  return (
    <>
      <div className="pagehead">
        <button className="x" aria-label="Назад" onClick={onBack}><Back /></button>
        <h1>Словарь</h1>
        <span className="ph-meta">{deck.words.length} {plural(deck.words.length, "слово", "слова", "слов")} · {deck.batches.length} {plural(deck.batches.length, "партия", "партии", "партий")}</span>
      </div>
      <div className="wrap words">
        <aside className="filters" aria-label="Фильтры словаря">
          <input className="inp find" type="search" placeholder="Найти слово" aria-label="Найти слово" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="fgroup fbatch">
            <div className="flabel">Партии</div>
            <div className="fl">
              <button aria-pressed={batch === 0} onClick={() => setBatch(0)}>Все партии<em>{deck.words.length}</em></button>
              {deck.batches.map((b) => (
                <button key={b.id} title={b.title} aria-pressed={batch === b.id} onClick={() => setBatch(batch === b.id ? 0 : b.id)}>
                  Партия {b.id}<em>{deck.words.filter((w) => w.batch === b.id).length}</em>
                </button>
              ))}
            </div>
          </div>
          <div className="fgroup">
            <div className="flabel">Уровень</div>
            <div className="fl">
              <button className="fall" aria-pressed={lvl < 0} onClick={() => setLvl(-1)}>Все уровни<em>{deck.words.length}</em></button>
              {LEVELS.map((n, i) => (
                <button key={n} aria-pressed={lvl === i} onClick={() => setLvl(lvl === i ? -1 : i)}>
                  <span className={`sw c${i}`} aria-hidden="true" />{n}<em>{byLvl[i]}</em>
                </button>
              ))}
            </div>
          </div>
        </aside>
        <div className="wlist">
          {deck.batches.map((b) => {
            const ws = shown.filter((w) => w.batch === b.id);
            if (!ws.length) return null;
            return (
              <section className="card" key={b.id}>
                <div className="bhead">
                  <span className="bno" aria-hidden="true">{b.id}</span>
                  <div>
                    <h3>{b.title}</h3>
                    <p className="mute sm" style={{ margin: "4px 0 6px" }}>{b.pages}</p>
                  </div>
                </div>
                <div className="whead" aria-hidden="true"><span /><span>Слово</span><span>Перевод</span><span>Уровень</span><span>Повтор</span><span /></div>
                {ws.map((w) => {
                  const s = state.srs[w.id];
                  const l = s?.lvl ?? 0;
                  return (
                    <details className="wrow" key={w.id}>
                      <summary>
                        <div className="em">{w.picture}</div>
                        <div className="wen"><b>{w.en}</b><span className="ipa">{w.ipa}</span>{w.rare && <span className="rare" title="Редкое книжное слово: повторяется вдвое реже">редкое</span>}</div>
                        <span className="mute sm wru">{w.ru}</span>
                        <div className="dots" title={`${LEVELS[levelGroup(l)]} · уровень ${l} из 6`}>{[1, 2, 3, 4, 5, 6].map((i) => <i key={i} className={i <= l ? "f" : ""} />)}</div>
                        <span className="wdue">{s?.due ? ruDate(s.due).slice(0, 5) : "—"}</span>
                        <SpeakBtn text={w.en} size="s" />
                      </summary>
                      <div className="det">
                        {w.note && <>{w.note}<br /></>}
                        <b style={{ color: "var(--ink)" }}>{w.example}</b> — {w.exampleRu}
                        {s?.due && <><br />Следующее повторение: {ruDate(s.due)}</>}
                        {w.rare && <><br />Редкое книжное слово: нужно узнавать при чтении, повторяется вдвое реже.</>}
                      </div>
                    </details>
                  );
                })}
              </section>
            );
          })}
          {!shown.length && (
            <div className="card empty">
              <p className="mute" style={{ margin: 0 }}>Таких слов пока нет.</p>
              <button className="link" onClick={() => { setBatch(0); setLvl(-1); setQ(""); }}>Сбросить фильтры</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
