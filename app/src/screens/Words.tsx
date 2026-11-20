import { useEffect, useRef, useState } from "react";
import type { View } from "../App";
import { todayKey } from "../core/dates";
import { HARD_WRONG, isHard, levelGroup } from "../core/srs";
import { plural } from "../core/text";
import type { AppState, Deck, Word } from "../core/types";
import { dayMonth, dueText, groupKey, groupTitle, hardWords, knownCount, type LessonGroup, type LessonKey, weekdayDay, wordLessons } from "../core/vocab";
import { Alert, Back, Chevron, Route, Search } from "../lib/icons";
import { SpeakBtn } from "../ui";

const LEVELS = ["Новое", "Учу", "Знакомо", "Выучено"];
const nWords = (n: number) => `${n} ${plural(n, "слово", "слова", "слов")}`;

/** Поиск словаря: открыт ли и что набрано — живёт, пока открыто приложение (между корнем и страницей урока). */
const memo = { q: "", open: false };

/** Страница словаря — урок, «Впереди» или «Трудные». */
interface Page {
  key: LessonKey;
  title: string;
  /** подпись под заголовком страницы */
  sub: string;
  /** подпись в списке уроков (без кольца у «Впереди» и «Трудных») */
  rowSub: string;
  words: Word[];
  today?: boolean;
}

const pagesOf = (state: AppState, deck: Deck, today: string): { lessons: Page[]; ahead: Page | null; hard: Page | null } => {
  const groups = wordLessons(state, deck);
  const lesson = (g: LessonGroup): Page => ({
    key: groupKey(g),
    title: groupTitle(g),
    sub: `${weekdayDay(g.day!, today)} · ${nWords(g.words.length)}`,
    rowSub: `${dayMonth(g.day!, today)} · знакомо ${knownCount(g.words, state.srs)} из ${g.words.length}`,
    words: g.words,
    today: g.day === today,
  });
  const a = groups.find((g) => g.no === null);
  const h = hardWords(state, deck);
  return {
    lessons: groups.filter((g) => g.no !== null).map(lesson),
    ahead: a ? { key: "ahead", title: "Впереди", sub: `придут в следующих уроках · ${nWords(a.words.length)}`, rowSub: "придут в следующих уроках", words: a.words } : null,
    hard: h.length ? { key: "hard", title: "Трудные", sub: `${HARD_WRONG}+ ошибок · ${nWords(h.length)}`, rowSub: `${HARD_WRONG}+ ошибок`, words: h } : null,
  };
};

/** Кольцо «знакомо N из M»: доля знакомых слов урока. */
function Ring({ n, of }: { n: number; of: number }) {
  const r = 9,
    c = 2 * Math.PI * r,
    p = of ? n / of : 0;
  return (
    <svg className={`ring${p >= 1 ? " full" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={r} className="rg-bg" />
      {p > 0 && <circle cx="12" cy="12" r={r} className="rg-fg" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 12 12)" />}
    </svg>
  );
}

/** Строка слова: слово, перевод, точка уровня; раскрытие — пример, звук, уровень и дата повтора. */
function WordRow({ w, state, today }: { w: Word; state: AppState; today: string }) {
  const s = state.srs[w.id];
  const lvl = s?.lvl ?? 0;
  const g = levelGroup(lvl);
  const due = dueText(s?.due, today);
  return (
    <details className="wrow">
      <summary>
        <span className="wtx">
          <b lang="en">{w.en}<span className="ipa">{w.ipa}</span></b>
          <span className="wru">{w.ru}</span>
        </span>
        <span className="wdue">{s?.intro ? due : ""}</span>
        <span className={`wdot c${g}`} role="img" aria-label={`${LEVELS[g]} · уровень ${lvl} из 6`} title={`${LEVELS[g]} · уровень ${lvl} из 6`} />
      </summary>
      <div className="det">
        <p className="dex"><b lang="en">{w.example}</b><span>{w.exampleRu}</span></p>
        {w.note && <p className="dnote">{w.note}</p>}
        {w.quote && <p className="dnote"><i>«{w.quote}»</i>{w.page && <> — стр. {w.page}</>}</p>}
        <div className="dmeta">
          <SpeakBtn text={w.en} size="s" />
          <span className="dm-tx">
            <span>{s?.intro ? `${LEVELS[g]} · повтор ${due}` : "Ещё не начато"}</span>
            {w.rare && <span className="rare" title="Редкое книжное слово: повторяется вдвое реже">редкое</span>}
            {isHard(s) && <span className="rare hard" title={`${HARD_WRONG}+ ошибок`}>трудное · {s!.wrong}×</span>}
          </span>
        </div>
      </div>
    </details>
  );
}

function WordList({ words, state, today, label }: { words: Word[]; state: AppState; today: string; label: string }) {
  return (
    <div className="card wlist" role="list" aria-label={label}>
      {words.map((w) => (
        <div role="listitem" key={w.id}>
          <WordRow w={w} state={state} today={today} />
        </div>
      ))}
    </div>
  );
}

/** Поле поиска: на телефоне открывается значком в шапке, на десктопе — всегда над списком уроков. */
function Find({ q, setQ, auto }: { q: string; setQ: (q: string) => void; auto?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (auto) ref.current?.focus();
  }, [auto]);
  return <input ref={ref} className="inp find" type="search" placeholder="Найти слово или перевод" aria-label="Найти слово или перевод" value={q} onChange={(e) => setQ(e.target.value)} />;
}

const matches = (w: Word, needle: string) => w.en.toLowerCase().includes(needle) || w.ru.toLowerCase().includes(needle);

/**
 * «Слова» — два уровня, как «Настройки». Корень: список уроков (от нового к старому) с кольцом «знакомо N из M»,
 * отдельно «Впереди» и «Трудные»; поиск — значком в шапке. Урок — своя страница («‹ Слова»): слово, перевод и точка
 * уровня (жёлтая — учу, синяя — знакомо, зелёная — выучено); строка раскрывается — пример, звук, уровень и повтор.
 * Десктоп: уроки слева, слова выбранного урока справа, поиск над уроками.
 * @param lesson — открытая страница (урок, «Впереди», «Трудные»); без неё — корень (на десктопе — первый урок)
 */
export function Words({ deck, state, go, wide, lesson }: { deck: Deck; state: AppState; go: (v: View) => void; wide: boolean; lesson?: LessonKey }) {
  const [q, setQ0] = useState(memo.q);
  const [open, setOpen0] = useState(memo.open || !!memo.q);
  const setQ = (v: string) => setQ0((memo.q = v));
  const setOpen = (v: boolean) => {
    setOpen0((memo.open = v));
    if (!v) setQ("");
  };

  const today = todayKey();
  const { lessons, ahead, hard } = pagesOf(state, deck, today);
  const extras = [ahead, hard].filter((p): p is Page => !!p);
  const all = [...lessons, ...extras];
  const known = knownCount(deck.words, state.srs);
  const needle = q.trim().toLowerCase();
  // открытая страница пропала (другой день, слово перестало быть трудным) — корень
  const page = lesson !== undefined ? all.find((p) => p.key === lesson) : undefined;
  const shown = page ?? (wide ? all[0] : undefined);

  const results = needle ? deck.words.filter((w) => matches(w, needle)) : [];
  const resultsView = (
    <>
      <div className="sgroup">{results.length ? `Найдено: ${nWords(results.length)}` : "Ничего не нашлось"}</div>
      {results.length > 0 && <WordList words={results} state={state} today={today} label="Найденные слова" />}
    </>
  );

  const row = (p: Page) => (
    <button key={String(p.key)} className="srow lrow" aria-current={wide && !needle && shown?.key === p.key ? "true" : undefined} onClick={() => { if (wide) setQ(""); go({ name: "words", lesson: p.key }); }}>
      {p.key === "ahead" ? (
        <span className="s-ic t-ahead" aria-hidden="true"><Route /></span>
      ) : p.key === "hard" ? (
        <span className="s-ic t-hard" aria-hidden="true"><Alert /></span>
      ) : (
        <Ring n={knownCount(p.words, state.srs)} of={p.words.length} />
      )}
      <span className="s-tx">
        <span className="s-t">{p.title}{p.today && <span className="ftag">сегодня</span>}</span>
        <span className="s-v">{p.rowSub}</span>
      </span>
      {p.key === "ahead" || p.key === "hard" ? <span className="lcount">{p.words.length}</span> : <span />}
      <Chevron className="s-ch" aria-hidden="true" />
    </button>
  );

  const nav = (
    <div className="set-nav wnav">
      {wide && <Find q={q} setQ={setQ} />}
      {lessons.length > 0 && (
        <>
          <div className="sgroup">Уроки</div>
          <div className="card slist" role="group" aria-label="Уроки">{lessons.map(row)}</div>
        </>
      )}
      {extras.length > 0 && <div className="card slist" role="group" aria-label="Впереди и трудные">{extras.map(row)}</div>}
    </div>
  );

  const head = (title: string, sub: string, back?: boolean, isToday?: boolean) => (
    <div className={`pagehead set-head whd${back ? " sub" : ""}`}>
      {back && (
        <button className="sback" aria-label="Назад: Слова" onClick={() => go({ name: "words" })}>
          <Back aria-hidden="true" />
          Слова
        </button>
      )}
      <div className="whd-row">
        <div className="whd-t">
          <h1>{title}{isToday && <span className="ftag">сегодня</span>}</h1>
          <p className="whd-sub">{sub}</p>
        </div>
        {!wide && (
          <button className="hbtn" aria-label={open ? "Закрыть поиск" : "Поиск"} aria-pressed={open} onClick={() => setOpen(!open)}>
            <Search aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  const rootSub = `${nWords(deck.words.length)} · знакомо ${known}`;

  // десктоп: уроки слева, справа — слова выбранного урока или найденные
  if (wide)
    return (
      <>
        {head("Слова", rootSub)}
        <div className="wrap settings-page vocab">
          {nav}
          <section className="set-detail" aria-labelledby="wd-h">
            {needle ? (
              <>
                <h2 id="wd-h">Поиск</h2>
                {resultsView}
              </>
            ) : (
              shown && (
                <>
                  <div className="wd-head">
                    <h2 id="wd-h">{shown.title}{shown.today && <span className="ftag">сегодня</span>}</h2>
                    <p className="whd-sub">{shown.sub}</p>
                  </div>
                  <WordList words={shown.words} state={state} today={today} label={shown.title} />
                </>
              )
            )}
          </section>
        </div>
      </>
    );

  // телефон: страница урока (поиск — внутри урока)
  if (page) {
    const ws = needle ? page.words.filter((w) => matches(w, needle)) : page.words;
    return (
      <>
        {head(page.title, page.sub, true, page.today)}
        <div className="wrap settings-page vocab">
          {open && <Find q={q} setQ={setQ} auto />}
          {ws.length ? <WordList words={ws} state={state} today={today} label={page.title} /> : <p className="mute wempty">В этом уроке такого слова нет.</p>}
        </div>
      </>
    );
  }

  // телефон: корень
  return (
    <>
      {head("Слова", rootSub)}
      <div className="wrap settings-page vocab">
        {open && <Find q={q} setQ={setQ} auto />}
        {needle ? resultsView : nav}
      </div>
    </>
  );
}
