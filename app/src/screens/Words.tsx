import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { View } from "../App";
import { todayKey } from "../core/dates";
import { HARD_WRONG, isHard, levelGroup } from "../core/srs";
import { plural } from "../core/text";
import type { AppState, Deck, Word, WordState } from "../core/types";
import { dueText, groupKey, groupTitle, type LessonGroup, type LessonKey, weekdayDay, wordLessons } from "../core/vocab";
import { Back } from "../lib/icons";
import { SpeakBtn } from "../ui";

const LEVELS = ["Новые", "Учу", "Знакомо", "Выучено"];

/**
 * Что было выбрано в словаре: урок, уровень, поиск и прокрутка. Живёт, пока открыто приложение, — со страницы слова
 * возвращаемся на то же место списка.
 */
const memo: { lesson: LessonKey | "all"; lvl: number; q: string; y: number; restore: boolean } = { lesson: "all", lvl: -1, q: "", y: 0, restore: false };

const lessonsMeta = (groups: LessonGroup[]) => groups.filter((g) => g.no !== null).length;

/** Подпись группы: «вт, 24 ноября · сегодня · 12 слов» или «ещё не начаты · 8 слов». */
const groupSub = (g: LessonGroup, today: string) => {
  const n = `${g.words.length} ${plural(g.words.length, "слово", "слова", "слов")}`;
  if (!g.day) return `ещё не начаты · ${n}`;
  return `${weekdayDay(g.day, today)}${g.day === today ? " · сегодня" : ""} · ${n}`;
};

/** Полоска уровня: 6 делений, заполнено по уровню слова. */
function LevelDots({ lvl }: { lvl: number }) {
  return (
    <div className="dots" title={`${LEVELS[levelGroup(lvl)]} · уровень ${lvl} из 6`} aria-label={`Уровень ${lvl} из 6`} role="img">
      {[1, 2, 3, 4, 5, 6].map((i) => <i key={i} className={i <= lvl ? "f" : ""} />)}
    </div>
  );
}

function Tags({ w, s }: { w: Word; s?: WordState }) {
  return (
    <>
      {w.rare && <span className="rare" title="Редкое книжное слово: повторяется вдвое реже">редкое</span>}
      {isHard(s) && <span className="rare hard" title={`${HARD_WRONG}+ ошибок`}>трудное</span>}
    </>
  );
}

/**
 * «Слова»: словарь по урокам, в которых слово выучено (не начатые — «Впереди»).
 * Телефон: поиск, уроки-таблетки, строка — слово, транскрипция, перевод, полоска уровня и дата повтора; нажатие —
 * страница слова. Десктоп: слева поиск, уроки и уровни; таблица СЛОВО · ПЕРЕВОД · УРОВЕНЬ · ПОВТОР, звук в строке,
 * раскрытие строки — пример.
 * @param lesson — открыть сразу этот урок («Слова урока» на «Пути»)
 */
export function Words({ deck, state, go, wide, lesson }: { deck: Deck; state: AppState; go: (v: View) => void; wide: boolean; lesson?: LessonKey }) {
  const [sel, setSel] = useState<LessonKey | "all">(() => {
    if (lesson !== undefined) Object.assign(memo, { lesson, lvl: -1, q: "", restore: false });
    return memo.lesson;
  });
  const [lvl, setLvl] = useState(memo.lvl);
  const [q, setQ] = useState(memo.q);
  Object.assign(memo, { lesson: sel, lvl, q });

  // вернулись со страницы слова — туда же, где были
  useLayoutEffect(() => {
    if (memo.restore) window.scrollTo(0, memo.y);
    memo.restore = false;
  }, []);

  const today = todayKey();
  const groups = wordLessons(state, deck);
  // урок из фильтра пропал (другой день, сброс) — все уроки
  const cur = sel === "all" || groups.some((g) => groupKey(g) === sel) ? sel : "all";
  const needle = q.trim().toLowerCase();
  const lvlOf = (w: Word) => state.srs[w.id]?.lvl ?? 0;
  const match = (w: Word) =>
    (lvl < 0 || levelGroup(lvlOf(w)) === lvl) && (!needle || w.en.toLowerCase().includes(needle) || w.ru.toLowerCase().includes(needle));
  const shown = groups
    .filter((g) => cur === "all" || groupKey(g) === cur)
    .map((g) => ({ ...g, words: g.words.filter(match) }))
    .filter((g) => g.words.length);
  const byLvl = [0, 1, 2, 3].map((i) => deck.words.filter((w) => levelGroup(lvlOf(w)) === i).length);
  const nLessons = lessonsMeta(groups);

  const open = (w: Word) => {
    memo.y = window.scrollY;
    memo.restore = true;
    go({ name: "word", id: w.id });
  };
  const reset = () => {
    setSel("all");
    setLvl(-1);
    setQ("");
  };

  return (
    <>
      <div className="pagehead">
        <h1>Словарь</h1>
        <span className="ph-meta">
          {deck.words.length} {plural(deck.words.length, "слово", "слова", "слов")}
          {nLessons > 0 && <> · {nLessons} {plural(nLessons, "урок", "урока", "уроков")}</>}
        </span>
      </div>
      <div className="wrap words">
        <aside className="filters" aria-label="Фильтры словаря">
          <input className="inp find" type="search" placeholder={wide ? "Найти слово" : "Найти слово или перевод"} aria-label="Найти слово или перевод" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="fgroup">
            <div className="flabel">Уроки</div>
            <div className="fl" role="group" aria-label="Уроки">
              <button className="fall" aria-pressed={cur === "all"} onClick={() => setSel("all")}>{wide ? "Все уроки" : "Все"}<em>{deck.words.length}</em></button>
              {groups.map((g) => {
                const k = groupKey(g);
                return (
                  <button key={k} aria-pressed={cur === k} onClick={() => setSel(cur === k ? "all" : k)}>
                    {groupTitle(g)}
                    {wide && g.day === today && <span className="ftag">сегодня</span>}
                    <em>{g.words.length}</em>
                  </button>
                );
              })}
            </div>
          </div>
          {wide && (
            <div className="fgroup">
              <div className="flabel">Уровень</div>
              <div className="fl" role="group" aria-label="Уровень">
                <button aria-pressed={lvl < 0} onClick={() => setLvl(-1)}>Все уровни<em>{deck.words.length}</em></button>
                {LEVELS.map((n, i) => (
                  <button key={n} aria-pressed={lvl === i} onClick={() => setLvl(lvl === i ? -1 : i)}>
                    <span className={`sw c${i}`} aria-hidden="true" />{n}<em>{byLvl[i]}</em>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
        <div className="wlist">
          {shown.map((g) => (
            <section className="card" key={groupKey(g)} aria-label={groupTitle(g)}>
              <div className="bhead">
                {g.no !== null ? <span className="bno" aria-hidden="true">{g.no}</span> : <span className="bno ahead" aria-hidden="true" />}
                <div>
                  <h3>{groupTitle(g)}</h3>
                  <p className="bsub">{groupSub(g, today)}</p>
                </div>
              </div>
              {wide && <div className="whead" aria-hidden="true"><span>Слово</span><span>Перевод</span><span>Уровень</span><span>Повтор</span><span /></div>}
              {g.words.map((w) => {
                const s = state.srs[w.id];
                const due = dueText(s?.due, today);
                return wide ? (
                  <details className="wrow" key={w.id}>
                    <summary>
                      <div className="wen"><b>{w.en}</b><span className="ipa">{w.ipa}</span><Tags w={w} s={s} /></div>
                      <span className="wru">{w.ru}</span>
                      <LevelDots lvl={s?.lvl ?? 0} />
                      <span className="wdue">{due}</span>
                      <SpeakBtn text={w.en} size="s" />
                    </summary>
                    <div className="det">
                      {w.note && <p>{w.note}</p>}
                      <p><b>{w.example}</b><br />— {w.exampleRu}</p>
                      {w.quote && <p><i>«{w.quote}»</i>{w.page && <span> — стр. {w.page}</span>}</p>}
                      <p>Следующее повторение: {s?.due ? due : "слово ещё не начато"}</p>
                    </div>
                  </details>
                ) : (
                  <button className="wrow" key={w.id} onClick={() => open(w)}>
                    <span className="wen"><b>{w.en}</b><span className="ipa">{w.ipa}</span><Tags w={w} s={s} /></span>
                    <span className="wru">{w.ru}</span>
                    <LevelDots lvl={s?.lvl ?? 0} />
                    <span className="wdue">{due}</span>
                  </button>
                );
              })}
            </section>
          ))}
          {!shown.length && (
            <div className="card empty">
              <p className="mute" style={{ margin: 0 }}>Таких слов нет.</p>
              <button className="link" onClick={reset}>Сбросить фильтры</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Страница слова: крупно слово, транскрипция, перевод, звук слова и примера; уровень и повтор; листание к соседним
 * словам того же урока. «Назад» — в словарь, на то же место.
 */
export function WordPage({ deck, state, id, go }: { deck: Deck; state: AppState; id: string; go: (v: View) => void }) {
  const today = todayKey();
  const groups = wordLessons(state, deck);
  const g = groups.find((x) => x.words.some((w) => w.id === id));
  const w = g?.words.find((x) => x.id === id);
  const i = g && w ? g.words.indexOf(w) : -1;
  const prev = g?.words[i - 1],
    next = g?.words[i + 1];
  const touch = useRef<{ x: number; y: number } | null>(null);
  const back = () => go({ name: "words" });
  const to = (x: Word) => go({ name: "word", id: x.id });

  // ← → — соседние слова урока (на десктопе и с клавиатурой)
  const keys = useRef({ prev, next, to });
  keys.current = { prev, next, to };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = keys.current;
      if (e.key === "ArrowLeft" && k.prev) k.to(k.prev);
      if (e.key === "ArrowRight" && k.next) k.to(k.next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!g || !w) return null;
  const s = state.srs[w.id];
  const lvl = s?.lvl ?? 0;

  return (
    <div
      className="wpage"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x,
          dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
        if (dx < 0 && next) to(next);
        if (dx > 0 && prev) to(prev);
      }}
    >
      <div className="pagehead wp-head">
        <button className="wp-back" aria-label="Назад: словарь" onClick={back}><Back aria-hidden="true" /></button>
        <h1>{groupTitle(g)}</h1>
        <span className="ph-meta">{i + 1} из {g.words.length}</span>
      </div>
      <div className="wrap wp">
        <section className="card wp-word" aria-label={w.en}>
          <div className="wp-top">
            <h2 lang="en">{w.en}</h2>
            <SpeakBtn text={w.en} />
          </div>
          <div className="ipa">{w.ipa}</div>
          <div className="wp-ru">{w.ru}</div>
          <div className="wp-tags"><Tags w={w} s={s} /></div>
          {w.note && <p className={`note${w.correctionOfMyTranslation ? " fix" : ""}`}>{w.note}</p>}
          <div className="exs"><SpeakBtn text={w.example} size="s" /><div><b lang="en">{w.example}</b><i>{w.exampleRu}</i></div></div>
          {w.quote && <div className="exs book"><SpeakBtn text={w.quote} size="s" /><div><b lang="en">{w.quote}</b><i>Из книги{w.page ? `, стр. ${w.page}` : ""}</i></div></div>}
        </section>
        <section className="card wp-stat">
          <div>
            <small>Уровень</small>
            <div className="wp-lv" aria-hidden="true">{[1, 2, 3, 4, 5, 6].map((k) => <i key={k} className={k <= lvl ? "f" : ""} />)}</div>
            <b>{s?.intro ? `${LEVELS[levelGroup(lvl)]} · ${lvl} из 6` : "Ещё не начато"}</b>
          </div>
          <div>
            <small>Повтор</small>
            <b className="wp-due">{dueText(s?.due, today)}</b>
            {s?.due && s.due > today && <span>{weekdayDay(s.due, today)}</span>}
            {!s?.intro && <span>в одном из следующих уроков</span>}
          </div>
        </section>
        <nav className="wp-nav" aria-label="Соседние слова урока">
          {prev ? <button className="btn ghost" onClick={() => to(prev)} aria-label={`Предыдущее слово: ${prev.en}`}><Back aria-hidden="true" />{prev.en}</button> : <span />}
          {next ? <button className="btn ghost nx" onClick={() => to(next)} aria-label={`Следующее слово: ${next.en}`}>{next.en}<Back aria-hidden="true" /></button> : <span />}
        </nav>
      </div>
    </div>
  );
}
