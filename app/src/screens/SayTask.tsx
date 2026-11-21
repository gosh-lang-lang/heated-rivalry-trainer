import { useEffect, useRef, useState, type ReactNode } from "react";
import { issueHint, PRON_GOOD, PRON_PASS, type PronResult } from "../core/pron";
import { Check, Cross, Mic } from "../lib/icons";
import { assessPron, record, useMicState, type Recording } from "../lib/mic";
import { SpeakBtn } from "../ui";
import "./say.css";

/*
 * Задание «Скажи»: слово, пример к слову или фраза части 2. Запись → сервер оценивает звуки → слова фразы
 * окрашены (зелёное — хорошо, жёлтое — почти, красное — не то), под ними — какие звуки ушли и как их сказать.
 * До трёх попыток; в счёт идёт лучшая. Уровень слова не меняется: это тренировка, а не проверка памяти.
 */

/** Попыток на задание. */
export const SAY_TRIES = 3;
/** Подсказок под фразой — не больше. */
const MAX_HINTS = 3;

export interface SayProps {
  /** «Скажи слово» / «Скажи фразу» / «Скажи вслух» */
  label: string;
  en: string;
  ru: string;
  /** слово крупно (иначе — фраза) */
  word?: boolean;
  /** результат (лучшая попытка) и дальше */
  done: (ok: boolean) => void;
  /** оценить нельзя (сервер недоступен) — дальше без оценки */
  pass: () => void;
  /** «Не могу сейчас говорить» — всё говорение до конца занятия прочь */
  skipAll: () => void;
}

type Phase = "idle" | "rec" | "wait" | "result" | "silent" | "down" | "nomic";

export function SayTask({ label, en, ru, word, done, pass, skipAll }: SayProps) {
  const mic = useMicState();
  const [phase, setPhase] = useState<Phase>("idle");
  const [tries, setTries] = useState(0);
  const [last, setLast] = useState<PronResult | null>(null);
  const [best, setBest] = useState<PronResult | null>(null);
  const [level, setLevel] = useState(0);
  const rec = useRef<Recording | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // и после горячей замены модуля / двойного запуска эффектов в StrictMode
    return () => {
      alive.current = false;
      rec.current?.stop();
    };
  }, []);

  const start = async () => {
    if (phase === "rec") return rec.current?.stop();
    if (phase === "wait") return;
    setLast(null);
    setLevel(0);
    const r = await record({ silenceMs: word ? 900 : 1300, maxMs: word ? 6000 : 15000, onLevel: (l) => alive.current && setLevel(l) });
    if (!alive.current) return r?.stop();
    if (!r) return setPhase("nomic");
    rec.current = r;
    setPhase("rec");
    const pcm = await r.done;
    rec.current = null;
    if (!alive.current) return;
    if (!pcm) return setPhase("silent");
    setPhase("wait");
    const res = await assessPron(en, pcm);
    if (!alive.current) return;
    if (!res) return setPhase("down");
    if (res.silent) return setPhase("silent");
    setTries((n) => n + 1);
    setLast(res);
    setBest((b) => (b && b.score >= res.score ? b : res));
    setPhase("result");
  };

  const shown = last ?? best;
  const ok = !!best && best.score >= PRON_PASS;
  const final = phase === "result" && (ok || tries >= SAY_TRIES);
  // разрешения нет (спросили при «Поехали» и получили отказ) — сразу объясняем
  const off: Phase | null = phase === "down" ? "down" : phase === "nomic" || mic === "denied" || mic === "none" ? "nomic" : null;

  /* ----- фраза: слова окрашены по последней попытке (слова — как textWords на сервере) ----- */
  let k = 0;
  const painted = en.split(/(\s+)/).map((part, i) => {
    if (!part.trim()) return part;
    const m = shown ? shown.words[k]?.mark : undefined;
    const bare = part.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
    if (bare) k++;
    return (
      <span key={i} className={m && bare ? `pw ${m}` : undefined}>
        {part}
      </span>
    );
  });
  const hints = (shown?.words ?? [])
    .filter((w) => w.issues.length)
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_HINTS)
    .map((w) => ({ w: w.w, ipa: w.ipa, text: w.issues.slice(0, 2).map(issueHint).join("; ") }));

  /* ----- тело ----- */
  const status =
    phase === "rec" ? "Слушаю… закончишь — нажми или просто замолчи"
    : phase === "wait" ? "Оцениваю…"
    : phase === "silent" ? "Не расслышал — скажи погромче, ближе к телефону"
    : phase === "result" && !final ? `Попытка ${tries} из ${SAY_TRIES}`
    : phase === "idle" ? (mic === "asking" ? "Разреши доступ к микрофону" : word ? "Послушай и скажи слово" : "Послушай и скажи фразу целиком")
    : "";

  const body: ReactNode = (
    <>
      <div className="lbl">{label}</div>
      <div className={`card say-card${word ? " word" : ""}`}>
        <SpeakBtn text={en} />
        <div>
          {word ? <h2 className="say-en">{painted}</h2> : <div className="sent say-en">{painted}</div>}
          <div className="mute sm">{ru}</div>
        </div>
      </div>
      {off ? (
        <div className="say-off" role="status">
          {off === "nomic" ? (
            <>
              <b>Нет доступа к микрофону.</b> Разреши его для этого сайта: на iPhone — Настройки → Приложения → Safari → Микрофон, в браузере на
              компьютере — значок слева от адреса.
            </>
          ) : (
            <>
              <b>Оценка произношения сейчас недоступна.</b> Скажи фразу вслух сам — и дальше.
            </>
          )}
        </div>
      ) : final ? null : (
        <div className="say-mic">
          <button
            id="rec"
            className="say-btn"
            data-phase={phase}
            aria-label={phase === "rec" ? "Закончить запись" : "Записать"}
            disabled={phase === "wait"}
            onClick={start}
            style={{ ["--lvl" as string]: String(Math.min(1, level * 6)) }}
          >
            {phase === "wait" ? <span className="spin" /> : <Mic />}
          </button>
          <div className="say-status mute sm" aria-live="polite">{status}</div>
        </div>
      )}
      {shown && (
        <div className="say-res">
          <div className={`say-score ${shown.score >= PRON_PASS ? "good" : "weak"}`}>
            <b>{shown.score}%</b> <span className="mute sm">произношение{best && best !== shown ? ` · лучшее ${best.score}%` : ""}</span>
          </div>
          {hints.length > 0 && (
            <ul className="say-hints">
              {hints.map((h) => (
                <li key={h.w}>
                  <b>{h.w}</b> <span className="ipa">/{h.ipa}/</span> — {h.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );

  /* ----- панель ----- */
  const fbOk = phase === "result" ? ok : false;
  const title = !best ? "" : ok ? `${best.score >= PRON_GOOD ? "Отлично" : "Хорошо"}! ${best.score}%` : final ? `${best.score}% — потренируем в другой раз` : `${last?.score ?? best.score}% — давай ещё раз`;
  const sub = phase === "result" ? (ok ? (hints.length ? "Почти идеально — посмотри подсказку" : "Всё звучит чисто") : `Нужно ${PRON_PASS}% — послушай образец и повтори`) : "";
  const showFb = phase === "result";

  return (
    <>
      <main className="stage lesson st-say">{body}</main>
      <div className={`foot fx${showFb ? (fbOk ? " good" : " badf") : ""}`}>
        <div className="in">
          <div className="fz">
            <div className="fbg" aria-hidden="true" data-t="100% — потренируем в другой раз" data-b="Нужно 70% — послушай образец и повтори" />
            {showFb ? (
              <div className="fb" role="status">
                <h3>{fbOk ? <Check /> : <Cross />}{title}</h3>
                <p>{sub}</p>
              </div>
            ) : off ? (
              <div className="fz-pre" />
            ) : (
              <div className="fz-pre">
                <button className="link" id="skip-say" onClick={skipAll}>Не могу сейчас говорить</button>
              </div>
            )}
          </div>
          <div className="frow">
            {off ? (
              <button className="btn wide" id="next" onClick={off === "down" ? pass : skipAll}>
                {off === "down" ? "Дальше" : "Пропустить говорение"}
              </button>
            ) : phase === "result" && !final ? (
              <div className="say-two">
                <button className="btn ghost" id="next" onClick={() => done(ok)}>Дальше</button>
                <button className="btn wide" id="again" onClick={start}>Ещё раз</button>
              </div>
            ) : phase === "result" ? (
              <button className={`btn ${ok ? "okb" : "bad"} wide`} id="next" onClick={() => done(ok)}>Дальше</button>
            ) : (
              <button className="btn wide" id="chk" disabled={phase === "wait"} onClick={start}>
                {phase === "rec" ? "Готово" : phase === "wait" ? <><span className="spin" />Оцениваю…</> : "Записать"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
