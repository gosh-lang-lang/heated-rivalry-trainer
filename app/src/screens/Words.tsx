import { useState } from "react";
import type { View } from "../App";
import { todayKey } from "../core/dates";
import { HARD_WRONG, isHard, levelGroup } from "../core/srs";
import { plural } from "../core/text";
import type { AppState, Deck, Word } from "../core/types";
import { dayMonth, dueText, groupKey, groupTitle, hardWords, knownCount, type LessonGroup, type LessonKey, weekdayDay, wordLessons } from "../core/vocab";
import { Alert, Back, Chevron, Play, Route } from "../lib/icons";
import { WordArt } from "../lib/WordArt";
import { SpeakBtn } from "../ui";

const LEVELS = ["Новое", "Учу", "Знакомо", "Выучено"];
const nWords = (n: number) => `${n} ${plural(n, "слово", "слова", "слов")}`;

/** Что набрано в поиске — живёт, пока открыто приложение (ушли в урок и вернулись — поиск на месте). */
const memo = { q: "" };

/** Страница словаря — урок, «Впереди» или «Трудные». */
interface Page {
  key: LessonKey;
  title: string;
  /** подпись под заголовком страницы */
  sub: string;
  /** подпись в списке уроков */
  rowSub: string;
  words: Word[];
  today?: boolean;
}

const pagesOf = (state: AppState, deck: Deck, today: string): { lessons: Page[]; ahead: Page | null; hard: Page | null } => {
  const groups = wordLessons(state, deck);
  const lesson = (g: LessonGroup): Page => ({
    key: groupKey(g),
    title: groupTitle(g),
    sub: `${weekdayDay(g.day!, today)} · ${g.words.length ? nWords(g.words.length) : "Только повторение"}`,
    rowSub: `${dayMonth(g.day!, today)} · ${g.words.length ? `знакомо ${knownCount(g.words, state.srs)} из ${g.words.length}` : "Только повторение"}`,
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

/** Полоска уровня: 6 делений, заполнено по уровню слова, цвет — группы (учу, знакомо, выучено). */
function Level({ lvl }: { lvl: number }) {
  const g = levelGroup(lvl);
  return (
    <span className={`wlv g${g}`} role="img" aria-label={`${LEVELS[g]} · уровень ${lvl} из 6`} title={`${LEVELS[g]} · уровень ${lvl} из 6`}>
      {[1, 2, 3, 4, 5, 6].map((i) => <i key={i} className={i <= lvl ? "f" : ""} />)}
    </span>
  );
}

/**
 * Строка слова: картинка, СЛОВО (с пометками «редкое», «трудное») · ПЕРЕВОД · УРОВЕНЬ · ПОВТОР и рупор (нажат, пока
 * звучит); на телефоне — как раньше в словаре: перевод под словом, повтор под полоской уровня. Нажатие на строку раскрывает
 * транскрипцию, сцену к слову (если нарисована), пример со звуком, пояснение и цитату.
 */
function WordRow({ w, state, today }: { w: Word; state: AppState; today: string }) {
  const s = state.srs[w.id];
  const lvl = s?.lvl ?? 0;
  const g = levelGroup(lvl);
  const due = dueText(s?.due, today);
  // сцена к слову — только в раскрытой строке: закрытые не грузят слои и не крутят анимацию
  const [open, setOpen] = useState(false);
  return (
    <details className="wrow" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="wem" aria-hidden="true">{w.picture}</span>
        <span className="wen">
          <b lang="en">{w.en}</b>
          {w.rare && <span className="rare" title="Редкое книжное слово: повторяется вдвое реже">редкое</span>}
          {isHard(s) && <span className="rare hard" title={`${HARD_WRONG}+ ошибок`}>трудное</span>}
        </span>
        <span className="wru">{w.ru}</span>
        <Level lvl={lvl} />
        <span className="wdue">{due}</span>
        <SpeakBtn text={w.en} size="s" />
      </summary>
      <div className="det">
        {open && <WordArt wordId={w.id} label={w.example} />}
        <div className="dtop">
          <span className="ipa">{w.ipa}</span>
          <span>{s?.intro ? `${LEVELS[g]} · уровень ${lvl} из 6 · повтор ${due}` : "Ещё не начато"}</span>
          {isHard(s) && <span>ошибок: {s!.wrong}</span>}
        </div>
        <div className="dex">
          <SpeakBtn text={w.example} size="s" />
          <p><b lang="en">{w.example}</b><span>{w.exampleRu}</span></p>
        </div>
        {w.note && <p className="dnote">{w.note}</p>}
        {w.quote && <p className="dnote"><i>«{w.quote}»</i>{w.page && <> — стр. {w.page}</>}</p>}
      </div>
    </details>
  );
}

function WordList({ words, state, today, label }: { words: Word[]; state: AppState; today: string; label: string }) {
  return (
    <div className="card wlist">
      <div className="whead" aria-hidden="true">
        <span />
        <span>Слово</span>
        <span>Перевод</span>
        <span>Уровень</span>
        <span>Повтор</span>
        <span />
      </div>
      <div role="list" aria-label={label}>
        {words.map((w) => (
          <div role="listitem" key={w.id}>
            <WordRow w={w} state={state} today={today} />
          </div>
        ))}
      </div>
    </div>
  );
}

const matches = (w: Word, needle: string) => w.en.toLowerCase().includes(needle) || w.ru.toLowerCase().includes(needle);

/**
 * «Слова» — два уровня, как «Настройки». Сверху — поиск по слову и переводу. Корень: список уроков (от нового
 * к старому) с кольцом «знакомо N из M», отдельно «Впереди» и «Трудные». Урок — своя страница («‹ Слова») с кнопкой
 * «Пройти все слова» (тренировка, уровни не меняются) и строками СЛОВО · ПЕРЕВОД · УРОВЕНЬ · ПОВТОР · рупор.
 * Десктоп: поиск и уроки слева, слова выбранного урока справа.
 * @param lesson — открытая страница (урок, «Впереди», «Трудные»); без неё — корень (на десктопе — первый урок)
 */
export function Words({ deck, state, go, wide, lesson }: { deck: Deck; state: AppState; go: (v: View) => void; wide: boolean; lesson?: LessonKey }) {
  const [q, setQ0] = useState(memo.q);
  const setQ = (v: string) => setQ0((memo.q = v));

  const today = todayKey();
  const { lessons, ahead, hard } = pagesOf(state, deck, today);
  const extras = [ahead, hard].filter((p): p is Page => !!p);
  const all = [...lessons, ...extras];
  const known = knownCount(deck.words, state.srs);
  const needle = q.trim().toLowerCase();
  // открытая страница пропала (другой день, слово перестало быть трудным) — корень
  const page = lesson !== undefined ? all.find((p) => p.key === lesson) : undefined;
  const shown = page ?? (wide ? all[0] : undefined);

  const find = (
    <input className="inp find" type="search" placeholder="Найти слово или перевод" aria-label="Найти слово или перевод" value={q} onChange={(e) => setQ(e.target.value)} />
  );
  const results = needle ? deck.words.filter((w) => matches(w, needle)) : [];
  const resultsView = (
    <>
      <div className="sgroup">{results.length ? `Найдено: ${nWords(results.length)}` : "Ничего не нашлось"}</div>
      {results.length > 0 && <WordList words={results} state={state} today={today} label="Найденные слова" />}
    </>
  );

  /** «Пройти все слова»: урок и «Трудные» (у «Впереди» слова ещё не начаты — их вводит урок). */
  const drill = (p: Page) =>
    p.key !== "ahead" && p.words.length > 0 && (
      <button
        className="btn wide drill"
        onClick={() => go({ name: "session", kind: "drill", words: p.words.map((w) => w.id), title: p.title, from: "words", lesson: p.key })}
      >
        <Play aria-hidden="true" />
        Пройти все слова · {p.words.length}
      </button>
    );

  const row = (p: Page) => (
    <button
      key={String(p.key)}
      className="srow lrow"
      aria-current={wide && !needle && shown?.key === p.key ? "true" : undefined}
      onClick={() => {
        if (wide) setQ("");
        go({ name: "words", lesson: p.key });
      }}
    >
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
      {wide && find}
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
      <h1>{title}{isToday && <span className="ftag">сегодня</span>}</h1>
      <p className="whd-sub">{sub}</p>
    </div>
  );

  const rootSub = `${nWords(deck.words.length)} · знакомо ${known}`;

  // десктоп: поиск и уроки слева, справа — слова выбранного урока или найденные
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
                    <div>
                      <h2 id="wd-h">{shown.title}{shown.today && <span className="ftag">сегодня</span>}</h2>
                      <p className="whd-sub">{shown.sub}</p>
                    </div>
                    {drill(shown)}
                  </div>
                  <WordList words={shown.words} state={state} today={today} label={shown.title} />
                </>
              )
            )}
          </section>
        </div>
      </>
    );

  // телефон: страница урока
  if (page)
    return (
      <>
        {head(page.title, page.sub, true, page.today)}
        <div className="wrap settings-page vocab">
          {drill(page)}
          <WordList words={page.words} state={state} today={today} label={page.title} />
        </div>
      </>
    );

  // телефон: корень — поиск сверху, ниже уроки или найденные слова
  return (
    <>
      {head("Слова", rootSub)}
      <div className="wrap settings-page vocab">
        {find}
        {needle ? resultsView : nav}
      </div>
    </>
  );
}
