import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { SetState } from "../App";
import { picClass } from "../core/deck";
import { todayKey } from "../core/dates";
import { drillPlan, eveningPlan, morningPlan } from "../core/plans";
import { shuffle } from "../core/rng";
import {
  advance,
  isSpeech,
  bumpWrong,
  finishSession,
  gradeCurrent,
  introduceCurrent,
  isDone,
  markSeen,
  progress,
  skipSpeech,
  startSession,
  type Finished,
  type Session,
} from "../core/session";
import { buildTokens, checkTyped, gapSentence, longestRun, options } from "../core/text";
import type { AppState, Deck, SentenceRecord, SessionKind, Step } from "../core/types";
import { checkerAvailable, checkSentence } from "../lib/checker";
import { Check, Close, Cross } from "../lib/icons";
import { closeMic, micSupported, openMic, warmPron } from "../lib/mic";
import { prefetch, say } from "../lib/speech";
import { useLessonViewport } from "../lib/viewport";
import { hasWordArt, WordArt } from "../lib/WordArt";
import { SpeakBtn } from "../ui";
import { SayTask } from "./SayTask";

interface Props {
  deck: Deck;
  kind: SessionKind;
  /** день урока для части 2 (перенесённой со вчера); по умолчанию — сегодня */
  day?: string;
  /** «Пройти все слова» (drill): слова и заголовок тренировки */
  words?: string[];
  title?: string;
  state: AppState;
  setState: SetState;
  onQuit: () => void;
  onFinish: (f: Finished) => void;
}

/** Что шаг может сделать с занятием и прогрессом. */
interface Api {
  deck: Deck;
  sess: Session;
  grade: (ok: boolean, wordId: string | null) => void;
  seen: () => void;
  next: () => void;
  /** говорение: оценка (null — без оценки) и сразу дальше */
  finish: (ok: boolean | null) => void;
  /** «Не могу сейчас говорить»: все задания с говорением до конца занятия — прочь */
  skipSpeech: () => void;
  wrongPair: (ids: string[]) => void;
  reread: () => void;
  addSentence: (rec: SentenceRecord, n: number, graded: boolean) => void;
}

export function SessionScreen({ deck, kind, day, words, title, state, setState, onQuit, onFinish }: Props) {
  const [sess, setSess] = useState<Session | null>(() => {
    const t = todayKey();
    const steps =
      kind === "drill"
        ? drillPlan(deck, state, words ?? [], title ?? "Все слова")
        : kind === "evening"
          ? eveningPlan(deck, state, t, Math.random, day ?? t)
          : morningPlan(deck, state, t, { extra: kind === "extra" });
    return startSession(kind, steps);
  });
  // экран занятия — ровно видимая область: клавиатура не прокручивает страницу (lib/viewport.ts)
  useLessonViewport();

  // при входе в шаг: знакомство со словом и озвучка
  useEffect(() => {
    if (!sess || isDone(sess)) return;
    const step = sess.steps[sess.i];
    const w0 = "w" in step && step.w ? deck.byId[step.w] : null;
    if (step.t === "intro") {
      const r = introduceCurrent(sess, state, todayKey(), deck.byId[step.w]?.rare);
      if (r.state !== state) setState(r.state);
      if (r.sess !== sess) setSess(r.sess);
    }
    if (step.t === "intro" || step.t === "pick" || step.t === "listen") say(deck.byId[step.w].en);
    if (step.t === "say") say(step.ex ? deck.byId[step.w].example : deck.byId[step.w].en); // сначала образец
    const nx = sess.steps[sess.i + 1];
    if (nx && "w" in nx && nx.w) prefetch(nx.t === "say" && nx.ex ? deck.byId[nx.w].example : deck.byId[nx.w].en);
    if (w0 && (step.t === "intro" || step.t === "type")) prefetch(w0.example);
  }, [sess?.i]);

  useEffect(() => {
    if (!sess) onQuit();
  }, [sess, onQuit]);
  // микрофон — один на занятие: открываем при первом нажатии (если есть говорение), закрываем на выходе
  const micAsked = useRef(false);
  useEffect(() => closeMic, []);
  if (!sess) return null;

  const step = sess.steps[sess.i];
  const t = todayKey();
  /** куда записать итог и «перечитал»: часть 2, перенесённая со вчера, — в день урока */
  const logDay = kind === "evening" && day ? day : t;

  /** Перейти к сессии `n`: кончилась — итог, иначе следующий шаг. Первое нажатие в занятии с говорением спрашивает микрофон. */
  const land = (n: Session, st: AppState) => {
    if (!micAsked.current && micSupported() && n.steps.slice(n.i).some(isSpeech)) {
      micAsked.current = true;
      void openMic();
      warmPron();
    }
    if (isDone(n)) {
      const fin = finishSession(n, st, logDay);
      setState(fin.state);
      onFinish(fin);
      return;
    }
    if (st !== state) setState(st);
    setSess(n);
    window.scrollTo(0, 0);
  };

  const api: Api = {
    deck,
    sess,
    grade: (ok, wordId) => {
      const r = gradeCurrent(sess, state, ok, wordId, t, wordId ? deck.byId[wordId]?.rare : undefined);
      setSess(r.sess);
      if (r.state !== state) setState(r.state);
    },
    seen: () => setSess(markSeen(sess)),
    next: () => land(advance(sess), state),
    finish: (ok) => {
      const r = ok === null ? { sess: markSeen(sess), state } : gradeCurrent(sess, state, ok, null, t);
      land(advance(r.sess), r.state);
    },
    skipSpeech: () => land(skipSpeech(sess), state),
    wrongPair: (ids) => setState(bumpWrong(state, ids)),
    reread: () => {
      const n = advance(sess);
      const st = { ...state, days: { ...state.days, [logDay]: { ...(state.days[logDay] ?? {}), reread: true } } };
      if (isDone(n)) {
        const fin = finishSession(n, st, logDay);
        setState(fin.state);
        onFinish(fin);
        return;
      }
      setState(st);
      setSess(n);
    },
    addSentence: (rec, n, graded) => {
      prefetch(rec.corrected || rec.text); // его скажут вслух через пару шагов
      let s = { ...sess, written: { ...sess.written, [n]: rec } };
      let st: AppState = { ...state, sent: [...state.sent, rec] };
      if (graded) ({ sess: s, state: st } = gradeCurrent(s, st, !!rec.ok, null, t));
      else s = markSeen(s);
      setSess(s);
      setState(st);
    },
  };

  return (
    <>
      <div className="bar">
        <button className="x" aria-label="Выйти" onClick={onQuit}><Close /></button>
        <div className="prog"><b style={{ width: `${progress(sess) * 100}%` }} /></div>
        <span className="bar-n" aria-hidden="true">{Math.min(sess.i + 1, sess.steps.length)} / {sess.steps.length}</span>
      </div>
      <StepView key={sess.i} step={step} api={api} />
    </>
  );
}

/* ---------------- шаг ---------------- */

interface Feedback {
  ok: boolean;
  title: string;
  body?: ReactNode;
}

function StepView({ step, api }: { step: Step; api: Api }) {
  const { deck } = api;
  const w = "w" in step && step.w ? deck.byId[step.w] : null;

  // данные задания создаются один раз на шаг (компонент пересоздаётся по key)
  const [opts] = useState(() => (w && (step.t === "pick" || step.t === "listen") ? options(w, deck.words, Math.random) : []));
  const [pairs] = useState(() => (step.t === "pairs" ? { L: shuffle(step.ws), R: shuffle(step.ws) } : null));
  const [toks] = useState(() => (step.t === "build" ? buildTokens(step.en) : []));
  const [ord] = useState(() => shuffle(toks.map((_, i) => i)));

  const [sel, setSel] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [pairSel, setPairSel] = useState<{ side: "L" | "R"; id: string } | null>(null);
  const [bad, setBad] = useState(0);
  const [flash, setFlash] = useState<string[] | null>(null);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const checked = !!fb;
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const speakText = () => {
    if (step.t !== "speak") return { en: "", ru: "" };
    const wr = api.sess.written[step.n];
    if (wr && wr.ok !== undefined) return { en: wr.corrected || wr.text, ru: "Твоё предложение" + (wr.ok ? "" : " (исправленное)") };
    const sw = deck.byId[step.w];
    return { en: sw.example, ru: sw.exampleRu };
  };

  /* ----- проверка ----- */
  /** Поле станет неактивным — убираем клавиатуру сразу, а не когда система заметит. */
  const dropKeyboard = () => {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.matches("input, textarea")) el.blur();
  };
  const check = async () => {
    if (checked || busy) return;
    dropKeyboard();
    if ((step.t === "pick" || step.t === "listen") && w) {
      const ok = sel === w.id;
      api.grade(ok, w.id);
      setFb({ ok, title: ok ? "Отлично!" : "Правильный ответ:", body: `${w.en} — ${w.ru}` });
      say(w.en);
    } else if (step.t === "type" && w) {
      const r = checkTyped(typed, w.blank);
      api.grade(r.ok, w.id);
      setFb({ ok: r.ok, title: r.ok ? (r.typo ? "Почти — опечатка" : "Верно!") : "Правильно так:", body: <span className="c">{w.example}</span> });
      say(w.example);
    } else if (step.t === "build") {
      const got = picked.map((k) => toks[k]).join(" ");
      const ok = got === toks.join(" ");
      api.grade(ok, step.w ?? null);
      setFb({
        ok,
        title: ok ? "Верно!" : "Правильно так:",
        body: <><span className="c">{step.en}</span>{!ok && <><br /><span className="c sm">Твой вариант: {got}</span></>}</>,
      });
      say(step.en);
    } else if (step.t === "write") {
      const text = typed.trim();
      const ws = step.ws.map((id) => deck.byId[id]);
      const rec: SentenceRecord = { at: new Date().toISOString(), words: ws.map((x) => x.en), text };
      setBusy(true);
      const v = await checkSentence(ws, text);
      if (!alive.current) return;
      setBusy(false);
      if (!v) {
        api.addSentence({ ...rec, pending: true }, step.n, false);
        setFb({ ok: true, title: "Сохранил", body: "Автопроверки пока нет — предложение ждёт в «Статистике»." });
        return;
      }
      const full = { ...rec, ...v };
      api.addSentence(full, step.n, true);
      setFb({
        ok: v.ok,
        title: v.ok ? "Отлично сказано!" : "Почти — вот как лучше:",
        body: <>{!v.ok && <><span className="c"><b>{v.corrected}</b></span><br /></>}<span className="c sm">{v.comment}</span></>,
      });
    }
  };

  const dontKnow = () => {
    if (!w) return;
    dropKeyboard();
    api.grade(false, w.id);
    setTyped("");
    setFb({ ok: false, title: "Правильно так:", body: <span className="c">{w.example}</span> });
    say(w.example);
  };

  const clickPair = (side: "L" | "R", id: string) => {
    if (step.t !== "pairs" || checked) return;
    if (!pairSel || pairSel.side === side) return setPairSel({ side, id });
    const a = pairSel.id;
    setPairSel(null);
    if (a === id) {
      const m = [...matched, id];
      setMatched(m);
      say(deck.byId[id].en);
      if (m.length === step.ws.length) {
        const ok = bad === 0;
        api.grade(ok, null);
        setFb({ ok: true, title: ok ? "Все пары верно!" : "Готово", body: ok ? undefined : `Ошибок по ходу: ${bad}` });
      }
    } else {
      setBad((b) => b + 1);
      api.wrongPair([a, id]);
      setFlash(["L" + (side === "L" ? id : a), "R" + (side === "R" ? id : a)]);
      setTimeout(() => alive.current && setFlash(null), 600);
    }
  };

  const canCheck =
    step.t === "pick" || step.t === "listen" ? !!sel : step.t === "build" ? picked.length > 0 : !!typed.trim();

  /* ----- клавиатура: Enter — проверить/дальше, 1–4 — вариант ----- */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const b = (document.getElementById("chk") || document.getElementById("next")) as HTMLButtonElement | null;
      if (b && !b.disabled) {
        e.preventDefault();
        b.click();
      }
      return;
    }
    const tag = (document.activeElement as HTMLElement | null)?.tagName;
    if (/^[1-4]$/.test(e.key) && (step.t === "pick" || step.t === "listen") && !checked && tag !== "TEXTAREA" && tag !== "INPUT") setSel(opts[+e.key - 1] ?? null);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  /* ----- говорение — своё задание (SayTask.tsx) ----- */
  if (step.t === "say" || step.t === "speak") {
    const tx = step.t === "speak" ? speakText() : step.ex ? { en: w!.example, ru: w!.exampleRu } : { en: w!.en, ru: w!.ru };
    const label = step.t === "speak" ? "Скажи вслух" : step.ex ? "Скажи фразу" : "Скажи слово";
    return <SayTask label={label} en={tx.en} ru={tx.ru} word={step.t === "say" && !step.ex} done={api.finish} pass={() => api.finish(null)} skipAll={api.skipSpeech} />;
  }

  /* ----- тело задания ----- */
  const tile = (id: string) => (!checked || !w ? "" : id === w.id ? " good" : id === sel ? " badt" : "");
  let body: ReactNode = null;

  switch (step.t) {
    case "section":
      body = <div className="sect"><div className="big">{step.pic}</div><h2>{step.title}</h2><p className="mute">{step.sub}</p></div>;
      break;
    case "intro":
      body = w && (
        <>
          <div className="lbl">Новое слово</div>
          <div className={`intro${hasWordArt(w.id) ? "" : " noart"}`}>
            <WordArt wordId={w.id} label={w.example} />
            <div className="intro-info">
              <div className="word"><h2 style={{ "--lw": longestRun(w.en) } as CSSProperties}>{w.en}</h2><SpeakBtn text={w.en} /></div>
              <div className="ipa">{w.ipa}</div>
              <div className="ru">{w.ru}</div>
              {w.note && (
                <div className={`note${w.correctionOfMyTranslation ? " fix" : ""}`}>
                  {w.correctionOfMyTranslation && <b>Поправка к твоему переводу</b>}
                  {w.note}
                </div>
              )}
              <div className="exs"><SpeakBtn text={w.example} size="s" /><div><b>{w.example}</b><i>{w.exampleRu}</i></div></div>
              {w.quote && (
                <div className="exs book"><SpeakBtn text={w.quote} size="s" /><div><b>{w.quote}</b><i>Из книги{w.page ? `, стр. ${w.page}` : ""}</i></div></div>
              )}
            </div>
          </div>
        </>
      );
      break;
    case "pick":
      body = w && (
        <>
          <div className="lbl">{step.rev ? "Повторение · " : ""}Выбери перевод</div>
          <div className="word" style={{ marginBottom: 18 }}><h2>{w.en}</h2><SpeakBtn text={w.en} /></div>
          <div className="opts">
            {opts.map((id, n) => (
              <button key={id} className={`tile${tile(id)}`} data-key={n + 1} aria-pressed={sel === id} disabled={checked} onClick={() => setSel(id)}>
                <span className="em">{deck.byId[id].picture}</span>{deck.byId[id].ru}
              </button>
            ))}
          </div>
        </>
      );
      break;
    case "listen":
      body = w && (
        <>
          <div className="lbl">{step.rev ? "Повторение · " : ""}Что ты слышишь?</div>
          <div className="listen-btn"><SpeakBtn text={w.en} size="big" /></div>
          <div className="opts">
            {opts.map((id, n) => (
              <button key={id} className={`tile${tile(id)}`} data-key={n + 1} aria-pressed={sel === id} disabled={checked} onClick={() => setSel(id)}>
                {deck.byId[id].en}
              </button>
            ))}
          </div>
        </>
      );
      break;
    case "type": {
      if (!w) break;
      const [a, b] = gapSentence(w.example, w.blank);
      body = (
        <>
          <div className="lbl">{step.rev ? "Повторение · " : step.eve ? "Вспомни · " : ""}Впиши пропущенное</div>
          {step.hint && <div className={`pic ${picClass(deck, w.id)}`} style={{ aspectRatio: "auto", height: 120, fontSize: 64 }}>{w.picture}</div>}
          <div className="sent">{a}<span className="gap">{checked ? w.blank : " "}</span>{b}</div>
          <div className="hint">{w.exampleRu}{step.hint && ` · начинается на «${w.blank.slice(0, 1)}», ${w.blank.length} букв`}</div>
          <input
            className="inp"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Слово на английском"
            value={typed}
            disabled={checked}
            onChange={(e) => setTyped(e.target.value)}
          />
        </>
      );
      break;
    }
    case "pairs": {
      const col = (arr: string[], side: "L" | "R") =>
        arr.map((id) => {
          const gone = matched.includes(id);
          const on = pairSel?.side === side && pairSel.id === id;
          return (
            <button
              key={id}
              className={`tile${gone ? " gone" : ""}${flash?.includes(side + id) ? " badt" : ""}`}
              aria-pressed={on}
              disabled={gone}
              onClick={() => clickPair(side, id)}
            >
              {side === "L" ? deck.byId[id].en : deck.byId[id].ru}
            </button>
          );
        });
      body = (
        <>
          <div className="lbl">Найди пары</div>
          <div className="pairs" style={{ "--n": step.ws.length } as CSSProperties}><div className="col" data-side="en">{col(pairs!.L, "L")}</div><div className="col" data-side="ru">{col(pairs!.R, "R")}</div></div>
        </>
      );
      break;
    }
    case "build":
      body = (
        <>
          <div className="lbl">Собери фразу</div>
          <div className="word"><div className="sent" style={{ fontWeight: 800 }}>{step.ru}</div></div>
          <div className="ans">
            {picked.map((k, n) => (
              <button key={n} className="wt" disabled={checked} onClick={() => setPicked((p) => p.filter((_, j) => j !== n))}>{toks[k]}</button>
            ))}
          </div>
          <div className="pool">
            {ord.map((k) => (
              <button key={k} className={`wt${picked.includes(k) ? " used" : ""}`} disabled={checked} onClick={() => !picked.includes(k) && setPicked((p) => [...p, k])}>{toks[k]}</button>
            ))}
          </div>
        </>
      );
      break;
    case "write": {
      const ws = step.ws.map((id) => deck.byId[id]);
      body = (
        <>
          <div className="lbl">Напиши своё предложение</div>
          <p className="sub">О себе, работе, переезде, хоккее — о чём угодно. Используй хотя бы одно слово:</p>
          <div className="chips">
            {ws.map((x) => <div className="wchip" key={x.id}><span className="em">{x.picture}</span><div><b>{x.en}</b><span>{x.ru}</span></div></div>)}
          </div>
          <textarea className="inp" placeholder={`Например: ${ws[0].example}`} value={typed} disabled={checked || busy} onChange={(e) => setTyped(e.target.value)} />
          {!checkerAvailable && <p className="mute sm">Автопроверка пока не подключена — предложение сохранится, проверим позже.</p>}
        </>
      );
      break;
    }
    case "reread":
      body = (
        <div className="sect">
          <div className="big">📖</div>
          <h2>Перечитай страницы</h2>
          <p className="mute">Открой книгу и перечитай: <b style={{ color: "var(--ink)" }}>{step.pages.join("; ")}</b>. Теперь эти слова ты знаешь — посмотри, как легко читается.</p>
        </div>
      );
      break;
  }

  /* ----- нижняя панель ----- */
  // «примерка» отзыва: самый длинный из возможных заголовков и текст, который покажем после проверки
  const ghost: { t: string; b?: string } =
    (step.t === "pick" || step.t === "listen") && w
      ? { t: "Правильный ответ:", b: `${w.en} — ${w.ru}` }
      : step.t === "type" && w
        ? { t: "Почти — опечатка", b: w.example }
        : step.t === "build"
          ? { t: "Правильно так:", b: `${step.en}\nТвой вариант: ${step.en}` }
          : step.t === "pairs"
            ? { t: "Все пары верно!", b: "Ошибок по ходу: 0" }
            : { t: "Почти — вот как лучше:", b: "…\n…" };
  // до проверки в строке отзыва — то, что помогает сделать задание
  const pre: ReactNode =
    step.t === "type" ? <button className="link" onClick={dontKnow}>Не помню</button>
    : step.t === "write" ? <button className="link" onClick={api.next}>Пропустить</button>
    : step.t === "pairs" ? <span className="mute sm">Нажми слово слева, потом его перевод справа</span>
    : step.t === "listen" ? <span className="mute sm">Нажми на динамик, чтобы послушать ещё раз</span>
    : step.t === "pick" ? <span className="mute sm">Нажми на динамик, чтобы услышать слово</span>
    : step.t === "build" ? <span className="mute sm">Нажми на слово в ответе, чтобы убрать его</span>
    : null;
  let foot: ReactNode;
  if (step.t === "section" || step.t === "intro") {
    foot = <div className="foot"><div className="in"><button className="btn wide" id="next" onClick={api.next}>{step.t === "section" ? "Поехали" : "Дальше"}</button></div></div>;
  } else if (step.t === "reread") {
    foot = (
      <div className="foot"><div className="in">
        <button className="btn okb wide" onClick={api.reread}>Перечитал</button>
        <button className="link" id="next" onClick={api.next}>Сделаю позже</button>
      </div></div>
    );
  } else {
    foot = (
      <div className={`foot fx${fb ? (fb.ok ? " good" : " badf") : ""}`}><div className="in">
        {/* строка отзыва: до проверки — подсказка или ссылка, после — результат. Высота одна и та же: невидимая
            «примерка» отзыва (.fbg, текст — в псевдоэлементах) заранее занимает место, панель и задание не прыгают */}
        <div className="fz">
          <div className="fbg" aria-hidden="true" data-t={ghost.t} data-b={ghost.b} />
          {fb ? (
            <div className="fb" role="status">
              <h3>{fb.ok ? <Check /> : <Cross />}{fb.title}</h3>
              {fb.body && <p>{fb.body}</p>}
            </div>
          ) : (
            <div className="fz-pre">{pre}</div>
          )}
        </div>
        <div className="frow">
          {fb ? (
            <button className={`btn ${fb.ok ? "okb" : "bad"} wide`} id="next" onClick={api.next}>Дальше</button>
          ) : step.t === "pairs" ? (
            <button className="btn wide" disabled>Дальше</button>
          ) : (
            <button className="btn wide" id="chk" disabled={!canCheck || busy} onClick={check}>
              {busy ? <><span className="spin" />Проверяю…</> : "Проверить"}
            </button>
          )}
        </div>
      </div></div>
    );
  }

  return (
    <>
      <main className={`stage lesson st-${step.t}`}>{body}</main>
      {foot}
    </>
  );
}
