import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { SetState } from "../App";
import { picClass } from "../core/deck";
import { todayKey } from "../core/dates";
import { drillPlan, eveningPlan, morningPlan } from "../core/plans";
import { seeded, shuffle } from "../core/rng";
import {
  advance,
  bumpWrong,
  clearRun,
  finishSession,
  gradeCurrent,
  introduceCurrent,
  isDone,
  markSeen,
  progress,
  restoreSession,
  resumable,
  savable,
  saveRun,
  startSession,
  stepSeed,
  studiedIds,
  type Finished,
  type Session,
} from "../core/session";
import { buildTokens, checkTyped, gapSentence, longestRun, options, speakScore } from "../core/text";
import type { AppState, Deck, SentenceRecord, SessionKind, Step } from "../core/types";
import { checkerAvailable, checkSentence } from "../lib/checker";
import { Check, Close, Cross, Mic } from "../lib/icons";
import { canPlaySound, prefetch, say, useDictation } from "../lib/speech";
import { armTone, tone } from "../lib/tone";
import { useLessonViewport } from "../lib/viewport";
import { hasWordArt, WordArt } from "../lib/WordArt";
import { SpeakBtn } from "../ui";

interface Props {
  deck: Deck;
  kind: SessionKind;
  /** день урока для части 2 (перенесённой со вчера); по умолчанию — сегодня */
  day?: string;
  /** «Пройти все слова» (drill): слова и заголовок тренировки */
  words?: string[];
  title?: string;
  /** «Начать заново» незаконченную часть: те же шаги с первого, уже засчитанные ответы второй раз не считаются */
  restart?: boolean;
  state: AppState;
  setState: SetState;
  onQuit: () => void;
  onFinish: (f: Finished) => void;
}

/** Что шаг может сделать с занятием и прогрессом. */
interface Api {
  deck: Deck;
  sess: Session;
  /** зерно занятия: варианты ответа и плитки шага — те же при продолжении (core/session.ts stepSeed) */
  seed: number;
  /** слова, которые человек уже учит: из них — отвлекающие варианты ответа */
  known: ReadonlySet<string>;
  grade: (ok: boolean, wordId: string | null) => void;
  seen: () => void;
  next: () => void;
  wrongPair: (ids: string[]) => void;
  reread: () => void;
  addSentence: (rec: SentenceRecord, n: number, graded: boolean) => void;
}

/** Что шаг говорит сам, как только открылся: слово (знакомство, «Выбери перевод», «Что ты слышишь?») или фразу («Собери на слух»). */
const openingText = (deck: Deck, step: Step | undefined): string | null =>
  !step ? null
  : step.t === "intro" || step.t === "pick" || step.t === "listen" ? deck.byId[step.w]?.en ?? null
  : step.t === "build-listen" ? step.en
  : null;

export function SessionScreen({ deck, kind, day, words, title, restart = false, state, setState, onQuit, onFinish }: Props) {
  // незаконченная часть, начатая сегодня, продолжается (или начинается заново) из сохранённого; иначе — новый план
  const [init] = useState(() => {
    const t = todayKey();
    const saved = savable(kind) ? resumable(state, kind, day ?? t, t) : null;
    if (saved) return { sess: restoreSession(saved, restart, state.runAt) as Session | null, seed: saved.seed, restarted: restart };
    const steps =
      kind === "drill"
        ? drillPlan(deck, state, words ?? [], title ?? "Все слова")
        : kind === "evening"
          ? eveningPlan(deck, state, t, Math.random, day ?? t)
          : morningPlan(deck, state, t, { extra: kind === "extra" });
    return { sess: startSession(kind, steps), seed: Math.floor(Math.random() * 2 ** 31), restarted: false };
  });
  const [sess, setSess] = useState<Session | null>(init.sess);
  const seed = init.seed;
  // экран занятия — ровно видимая область: клавиатура не прокручивает страницу (lib/viewport.ts)
  useLessonViewport();
  // тон ответа будится тем же касанием, что и озвучка
  useEffect(() => armTone(), []);

  const t = todayKey();
  /** куда записать итог и «перечитал»: часть 2, перенесённая со вчера, — в день урока */
  const logDay = kind === "evening" && day ? day : t;

  /**
   * Новое состояние занятия и прогресса — одним изменением. Части 1 и 2 сохраняются в прогресс (state.run) после
   * каждого шага: ✕ или закрытое приложение — и на главной «Продолжить». `at` — с какого шага продолжить.
   */
  const commit = (s: Session, st: AppState, at?: number) => {
    setSess(s);
    const next = saveRun(st, s, { day: logDay, date: t, seed, at });
    if (next !== state) setState(next);
  };

  // «Начать заново» — сразу сохраняем: на главной будет уже новое место, даже если выйти с первого шага
  useEffect(() => {
    if (init.restarted && sess) commit(sess, state);
  }, []);

  // при входе в шаг: знакомство со словом и озвучка
  useEffect(() => {
    if (!sess || isDone(sess)) return;
    const step = sess.steps[sess.i];
    const w0 = "w" in step && step.w ? deck.byId[step.w] : null;
    if (step.t === "intro") {
      const r = introduceCurrent(sess, state, todayKey(), deck.byId[step.w]?.rare);
      if (r.state !== state || r.sess !== sess) commit(r.sess, r.state);
    }
    // одно звучание на задание: слово или фразу «на слух» — в начале; пример и фразу по переводу — после ответа
    const open = openingText(deck, step);
    if (open) say(open);
    const nx = openingText(deck, sess.steps[sess.i + 1]);
    if (nx) prefetch(nx);
    if (w0 && (step.t === "intro" || step.t === "type")) prefetch(w0.example);
    if (step.t === "build") prefetch(step.en);
  }, [sess?.i]);

  useEffect(() => {
    if (!sess) onQuit();
  }, [sess, onQuit]);
  if (!sess) return null;

  const step = sess.steps[sess.i];
  /** занятие закончено: сохранённой части больше нет (тренировка и «ещё 6 новых» её не трогают) */
  const finish = (n: Session, st: AppState) => {
    const fin = finishSession(n, st, logDay);
    const done = { ...fin, state: savable(kind) ? clearRun(fin.state) : fin.state };
    setState(done.state);
    onFinish(done);
  };

  const api: Api = {
    deck,
    sess,
    seed,
    known: studiedIds(state, sess.steps),
    // ответ засчитан сразу (srs, счёт) — продолжать с следующего шага
    grade: (ok, wordId) => {
      const r = gradeCurrent(sess, state, ok, wordId, t, wordId ? deck.byId[wordId]?.rare : undefined);
      commit(r.sess, r.state, r.sess.i + 1);
    },
    seen: () => commit(markSeen(sess), state, sess.i + 1),
    next: () => {
      const n = advance(sess);
      if (isDone(n)) return finish(n, state);
      commit(n, state);
      window.scrollTo(0, 0);
    },
    wrongPair: (ids) => setState(bumpWrong(state, ids)),
    reread: () => {
      const n = advance(sess);
      const st = { ...state, days: { ...state.days, [logDay]: { ...(state.days[logDay] ?? {}), reread: true } } };
      if (isDone(n)) return finish(n, st);
      commit(n, st);
    },
    addSentence: (rec, n, graded) => {
      prefetch(rec.corrected || rec.text); // его скажут вслух через пару шагов
      let s = { ...sess, written: { ...sess.written, [n]: rec } };
      let st: AppState = { ...state, sent: [...state.sent, rec] };
      if (graded) ({ sess: s, state: st } = gradeCurrent(s, st, !!rec.ok, null, t));
      else s = markSeen(s);
      commit(s, st, s.i + 1);
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

/** Озвучка после ответа начинается, когда отзвучал тон (lib/tone.ts TONE_SEC). */
const AFTER_TONE_MS = 280;

interface Feedback {
  ok: boolean;
  title: string;
  body?: ReactNode;
}

function StepView({ step, api }: { step: Step; api: Api }) {
  const { deck } = api;
  const w = "w" in step && step.w ? deck.byId[step.w] : null;

  const isBuild = step.t === "build" || step.t === "build-listen";
  // данные задания создаются один раз на шаг (компонент пересоздаётся по key) — из зерна шага:
  // при продолжении части те же варианты, пары и плитки. У каждого свой генератор: инициализаторы могут вызываться дважды
  const rng = (n: number) => seeded(stepSeed(api.seed, step) + n);
  const [opts] = useState(() => (w && (step.t === "pick" || step.t === "listen") ? options(w, deck.words, rng(1), api.known) : []));
  const [pairs] = useState(() => (step.t === "pairs" ? { L: shuffle(step.ws, rng(2)), R: shuffle(step.ws, rng(3)) } : null));
  const [toks] = useState(() => (isBuild ? buildTokens(step.en) : []));
  const [ord] = useState(() => shuffle(toks.map((_, i) => i), rng(4)));
  /** «Собери на слух» без звука (нечем играть или человек не может слушать) — показываем перевод, как в «Собери фразу» */
  const [showRu, setShowRu] = useState(() => !canPlaySound());

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

  const dict = useDictation((text) => setTyped((v) => (v + " " + text).trim()));

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
  /** Звук после ответа: тон сразу, озвучка (если есть) — когда тон отзвучит, и только пока открыт этот шаг. */
  const answerSound = (ok: boolean, text?: string) => {
    tone(ok);
    if (text) setTimeout(() => alive.current && say(text), AFTER_TONE_MS);
  };
  const check = async () => {
    if (checked || busy) return;
    dropKeyboard();
    if ((step.t === "pick" || step.t === "listen") && w) {
      // слово уже прозвучало в начале задания — после ответа только тон
      const ok = sel === w.id;
      api.grade(ok, w.id);
      setFb({ ok, title: ok ? "Отлично!" : "Правильный ответ:", body: `${w.en} — ${w.ru}` });
      answerSound(ok);
    } else if (step.t === "type" && w) {
      // до ответа молчим (иначе подсказка), после — пример целиком
      const r = checkTyped(typed, w.blank);
      api.grade(r.ok, w.id);
      setFb({ ok: r.ok, title: r.ok ? (r.typo ? "Почти — опечатка" : "Верно!") : "Правильно так:", body: <span className="c">{w.example}</span> });
      answerSound(r.ok, w.example);
    } else if (step.t === "build" || step.t === "build-listen") {
      const got = picked.map((k) => toks[k]).join(" ");
      const ok = got === toks.join(" ");
      api.grade(ok, step.w ?? null);
      setFb({
        ok,
        title: ok ? "Верно!" : "Правильно так:",
        body: (
          <>
            <span className="c">{step.en}</span>
            {!ok && <><br /><span className="c sm">Твой вариант: {got}</span></>}
          </>
        ),
      });
      // по переводу фраза ещё не звучала — звучит после ответа; на слух она уже прозвучала в начале
      answerSound(ok, step.t === "build" ? step.en : undefined);
    } else if (step.t === "speak") {
      dict.stop();
      const r = speakScore(speakText().en, typed);
      const p = Math.round(r.ratio * 100);
      api.grade(r.ok, null);
      answerSound(r.ok);
      setFb({
        ok: r.ok,
        title: r.ok ? `Отлично! ${p}% слов` : `${p}% слов — попробуй ещё завтра`,
        body: r.miss.length ? <span className="c sm">Не расслышал: {r.miss.join(", ")}</span> : undefined,
      });
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
        answerSound(true);
        return;
      }
      const full = { ...rec, ...v };
      api.addSentence(full, step.n, true);
      answerSound(v.ok);
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
    answerSound(false, w.example);
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
        tone(ok); // слово последней пары уже звучит — тон без задержки озвучки
      }
    } else {
      setBad((b) => b + 1);
      api.wrongPair([a, id]);
      setFlash(["L" + (side === "L" ? id : a), "R" + (side === "R" ? id : a)]);
      setTimeout(() => alive.current && setFlash(null), 600);
    }
  };

  const canCheck =
    step.t === "pick" || step.t === "listen" ? !!sel : isBuild ? picked.length > 0 : !!typed.trim();

  /* ----- клавиатура: Enter — проверить/дальше, 1–4 — вариант ----- */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.isComposing) return; // Enter подтверждает набор (IME), а не ответ
      // фокус на другой кнопке («Не помню», озвучка, «Выйти») — Enter нажимает её, а не проверяет недописанный ответ
      const t = e.target as HTMLElement | null;
      if (t?.closest("button, a") && !t.closest(".tile, #chk, #next")) return;
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
    case "build-listen":
      body = (
        <>
          {step.t === "build" ? (
            <>
              <div className="lbl">{step.rev ? "Повторение · " : ""}Собери фразу</div>
              <div className="word"><div className="sent" style={{ fontWeight: 800 }}>{step.ru}</div></div>
            </>
          ) : (
            <>
              <div className="lbl">Собери на слух</div>
              {/* фраза звучит сама в начале; кнопка — послушать ещё раз, сколько угодно. Перевод — только после ответа
                  (или сразу, если звука нет: «Не слышно — показать перевод») */}
              <div className="ear">
                <SpeakBtn text={step.en} size="big" />
                {(showRu || checked) && <div className="sent ear-ru">{step.ru}</div>}
              </div>
            </>
          )}
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
    case "speak": {
      const tx = speakText();
      body = (
        <>
          <div className="lbl">Скажи вслух</div>
          <p className="sub">Послушай, потом произнеси фразу целиком</p>
          <div className="card" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <SpeakBtn text={tx.en} />
            <div><div className="sent" style={{ fontSize: 20 }}>{tx.en}</div><div className="mute sm">{tx.ru}</div></div>
          </div>
          {dict.supported && (
            <button className="btn ghost wide" style={{ marginTop: 16 }} disabled={checked} onClick={() => (dict.listening ? dict.stop() : dict.start())}>
              <Mic style={{ width: 22, height: 22, verticalAlign: -5, marginRight: 8 }} />
              {dict.listening ? "Слушаю… нажми, чтобы закончить" : "Нажми и говори"}
            </button>
          )}
          {dict.error && <p className="mute sm">{dict.error}</p>}
          <textarea
            className="inp"
            placeholder={dict.supported ? "Здесь появится то, что ты сказал" : "Нажми на поле, затем на микрофон на клавиатуре и произнеси фразу"}
            value={typed}
            disabled={checked}
            onChange={(e) => setTyped(e.target.value)}
          />
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
        : isBuild
          ? { t: "Правильно так:", b: `${step.en}\nТвой вариант: ${step.en}` }
          : step.t === "pairs"
            ? { t: "Все пары верно!", b: "Ошибок по ходу: 0" }
            : step.t === "speak"
              ? { t: "100% слов — попробуй ещё завтра", b: "Не расслышал: …" }
              : { t: "Почти — вот как лучше:", b: "…\n…" };
  // до проверки в строке отзыва — то, что помогает сделать задание
  const pre: ReactNode =
    step.t === "type" ? <button className="link" onClick={dontKnow}>Не помню</button>
    : step.t === "write" ? <button className="link" disabled={busy} onClick={api.next}>Пропустить</button>
    : step.t === "speak" ? <button className="link" onClick={api.next}>Не могу сейчас говорить</button>
    : step.t === "pairs" ? <span className="mute sm">Нажми слово слева, потом его перевод справа</span>
    : step.t === "listen" ? <span className="mute sm">Нажми на динамик, чтобы послушать ещё раз</span>
    : step.t === "pick" ? <span className="mute sm">Нажми на динамик, чтобы услышать слово</span>
    : step.t === "build" ? <span className="mute sm">Нажми на слово в ответе, чтобы убрать его</span>
    : step.t === "build-listen" ? (showRu ? <span className="mute sm">Собери фразу по переводу</span> : <button className="link" onClick={() => setShowRu(true)}>Не слышно — показать перевод</button>)
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
      <main className={`stage lesson st-${step.t}${step.t === "build-listen" ? " st-build" : ""}`}>{body}</main>
      {foot}
    </>
  );
}
