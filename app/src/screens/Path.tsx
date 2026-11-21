import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { View } from "../App";
import { SEASON, seasonView, type LessonCard, type SeasonView } from "../core/cards";
import { hhmm, lessonStatus, type LessonPart, type LessonStatus } from "../core/lesson";
import { MAX_REVIEW, newToday } from "../core/plans";
import { streak, unseen } from "../core/srs";
import { plural } from "../core/text";
import type { AppState, Deck, SessionResult } from "../core/types";
import { Cards, Check, Flame, Lock } from "../lib/icons";
import { CardFront, CardLocked, cardNo, ruDay } from "./cards";
import { useNow } from "./Home";
import { Fan } from "./Me";
import { PathPlayer } from "./PathPlayer";
import { StreakSheet } from "./streak";

/*
 * «Путь»: сезон из 10 уроков нарисован катком. Каждая точка — урок (место карточки в сезоне): пройден / сейчас / закрыт;
 * у пройденных — карточка рядом с дорожкой, у текущего — игрок и «пузырь» с обеими частями урока, советом
 * (как на главной — lessonStatus: пауза, «поздно», перенос) и кнопкой. Нажатие на пройденный урок — дата, точность,
 * карточка и переходы «Слова урока», «Карточка».
 * Телефон — каток вертикальный (снизу старт, наверху ворота и финал сезона), десктоп (≥ 900 px) — горизонтальный.
 */

type Pt = [number, number];

/** Плавная кривая через центры узлов from…to (Catmull-Rom → Безье). */
const curve = (P: (n: number) => Pt, from: number, to: number) => {
  const pts: Pt[] = [];
  for (let n = from; n <= to; n++) pts.push(P(n));
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1} ${c2} ${p2}`;
  }
  return d;
};

const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const dayLine = (k: string) => `${WD[new Date(k + "T12:00:00").getDay()]}, ${ruDay(k)}`;
const doneLine = (r: SessionResult) => `Готово · ${r.score} из ${r.total} · ${r.mins} мин`;

/** Данные для «пузыря» текущего урока. */
interface Current {
  title: string;
  sub: string;
  parts: { part: 1 | 2; done: boolean; line: string }[];
  start: { label: string; ghost: boolean; view: View } | null;
  /** при переносе: часть 1 нового урока — второстепенно */
  extra: { label: string; view: View } | null;
}

/** Текущий урок: обе части с советом, как на главной (lessonStatus), и кнопка главной части. */
const currentLesson = (ls: LessonStatus, sv: SeasonView, state: AppState, deck: Deck): Current => {
  if (sv.todayDone)
    return {
      title: `Урок ${sv.nextLesson} · завтра`,
      sub: "Сегодняшний урок пройден — карточка уже в коллекции",
      parts: [],
      start: null,
      extra: null,
    };
  const nt = newToday(deck, state, ls.today);
  const nu = unseen(deck.words, state.srs).length;
  // перенесённая часть 2 уже сделана сегодня — тот урок пройден, текущий — сегодняшний
  const carry = ls.carry && !ls.cards[0].done ? ls.carry : null;
  let p1: LessonPart, p2: LessonPart;
  if (carry) {
    p2 = ls.cards[0];
    p1 = { ...ls.cards[1], n: p2.n, day: carry, done: state.days[carry]?.morning ?? null, can: false };
  } else if (ls.carry) {
    p1 = ls.cards[1];
    p2 = { ...ls.cards[0], n: p1.n, day: ls.today, done: null, can: false, advice: null, after: null, carried: false };
  } else [p1, p2] = ls.cards;

  const line1 = p1.done
    ? doneLine(p1.done)
    : p1.can
      ? `${nt.due ? `${Math.min(nt.due, MAX_REVIEW)} на повторение · ` : ""}${nt.n ? `${nt.n} ${plural(nt.n, "новое", "новых", "новых")}` : "без новых"} · ~15 мин`
      : nu
        ? "На сегодня повторений нет"
        : "Новых слов нет — пришли новую партию в чат";
  const line2 = p2.done
    ? doneLine(p2.done)
    : !p2.can
      ? "Сначала пройди часть 1"
      : p2.advice === "late"
        ? "Сегодня уже поздно — лучше завтра первым делом"
        : p2.advice === "wait" && p2.after
          ? `Лучше после ${hhmm(p2.after)} · можно и сейчас`
          : p2.carried
            ? "Осталась с прошлого раза — начни с неё"
            : "Проверка, своё предложение, говорение · ~15 мин";

  const newN = p1.done ? p1.done.newN : nt.n;
  const evening: View = { name: "session", kind: "evening", from: "path", ...(p2.carried ? { day: p2.day } : {}) };
  const start =
    ls.focus === 1 && !carry
      ? { label: "Начать часть 1", ghost: false, view: { name: "session", kind: "morning", from: "path" } as View }
      : p2.can && p2.advice !== "late"
        ? { label: "Начать часть 2", ghost: false, view: evening }
        : p2.can
          ? { label: "Всё равно сейчас", ghost: true, view: evening }
          : null;
  const next1 = ls.cards[1];
  return {
    title: `Урок ${p2.n} · ${carry ? "часть 2 осталась" : "сегодня"}`,
    sub: `${newN ? `${newN} ${plural(newN, "новое слово", "новых слова", "новых слов")}` : "повторение"} · 2 части по ~15 мин`,
    parts: [
      { part: 1, done: !!p1.done, line: line1 },
      { part: 2, done: !!p2.done, line: line2 },
    ],
    start,
    extra: carry && next1.can ? { label: `Урок ${next1.n} · начать часть 1`, view: { name: "session", kind: "morning", from: "path" } } : null,
  };
};

function CurrentBody({ cur, go, head = "pop" }: { cur: Current; go: (v: View) => void; head?: "pop" | "card" }) {
  return (
    <>
      {head === "pop" ? (
        <div className="lp-head"><div><b>{cur.title}</b><span>{cur.sub}</span></div></div>
      ) : (
        <div className="dl-head"><h3>{cur.title}</h3><span>{cur.sub.split(" · ")[0]}</span></div>
      )}
      {head === "card" && !cur.parts.length && <p className="mute sm">{cur.sub}</p>}
      {cur.parts.length > 0 && (
        <ol className="parts">
          {cur.parts.map((p) => (
            <li key={p.part} className={p.done ? "done" : "next"}>
              <i aria-hidden="true">{p.done ? <Check /> : p.part}</i>
              <div><b>Часть {p.part} — {p.part === 1 ? "учим" : "применяем"}</b><small>{p.line}</small></div>
            </li>
          ))}
        </ol>
      )}
      {cur.start && <button className={`btn wide${cur.start.ghost ? " ghost" : ""}`} onClick={() => go(cur.start!.view)}>{cur.start.label}</button>}
      {cur.extra && <button className="btn ghost wide lp-extra" onClick={() => go(cur.extra!.view)}>{cur.extra.label}</button>}
    </>
  );
}

/** Пройденный урок: дата, слов, точность, карточка и переходы. */
function DoneBody({ card, go }: { card: LessonCard; go: (v: View) => void }) {
  return (
    <>
      <div className="lp-head"><div><b>Урок {card.lesson} · пройден</b><span>{dayLine(card.day)} · {card.words.length} {plural(card.words.length, "слово", "слова", "слов")} · {card.pct}% верно</span></div></div>
      <div className="dp-row">
        <CardFront card={card} size={3.4} />
        <div className="dp-tx"><small>Карточка {cardNo(card.pos)} · {card.cat}</small><b>{card.name}</b><span>{card.line}</span></div>
      </div>
      <div className="dp-btns">
        <button className="btn ghost" onClick={() => go({ name: "words", lesson: card.lesson })}>Слова урока</button>
        <button className="btn ghost" onClick={() => go({ name: "card", no: card.no, from: { name: "path" } })}>Карточка</button>
      </div>
    </>
  );
}

/** Ширина элемента (следит за изменением). */
function useWidth<T extends HTMLElement>(init: number): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(init);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => setW(Math.round(el.clientWidth) || init);
    upd();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [init]);
  return [ref, w];
}

/** Высота элемента (следит за изменением). */
function useHeight<T extends HTMLElement>(init: number): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [h, setH] = useState(init);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => setH(Math.round(el.offsetHeight) || init);
    upd();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h];
}

interface Geo {
  W: number;
  H: number;
  P: (n: number) => Pt;
}

/** Узлы, карточки у дорожки, игрок — общие для обеих раскладок. */
function Marks({
  geo,
  sv,
  sel,
  onNode,
  go,
  vertical,
}: {
  geo: Geo;
  sv: SeasonView;
  sel: number | null;
  onNode: (pos: number) => void;
  go: (v: View) => void;
  vertical: boolean;
}) {
  const { W, P } = geo;
  const cur = sv.next;
  const out: ReactNode[] = [];
  const lessonAt = (pos: number) => sv.got.find((c) => c.pos === pos)?.lesson ?? sv.nextLesson + (pos - cur);

  for (let n = 1; n <= SEASON; n++) {
    const [x, y] = P(n);
    const st = n < cur ? "done" : n === cur ? "cur" : "lock";
    const gold = n === SEASON;
    const label =
      st === "done" ? `Урок ${lessonAt(n)} · пройден` : st === "cur" ? `Урок ${lessonAt(n)} · ${sv.todayDone ? "завтра" : "сейчас"}` : `Урок ${lessonAt(n)} · закрыт`;
    out.push(
      <button
        key={`n${n}`}
        className={`node ${st === "lock" && gold ? "final" : st}${gold ? " gold" : ""}${sel === n ? " sel" : ""}`}
        style={{ left: x, top: y }}
        aria-label={label}
        aria-expanded={st === "done" ? sel === n : undefined}
        disabled={st === "lock"}
        data-pos={n}
        onClick={() => st === "done" && onNode(n)}
      >
        {st === "lock" && gold ? (
          <span className="cup" aria-hidden="true">🏆</span>
        ) : (
          <>
            <b>{n}</b>
            {st === "done" && <i className="ok"><Check /></i>}
            {st === "lock" && <i className="lk"><Lock /></i>}
          </>
        )}
      </button>,
    );
    if (gold) out.push(<span key="fin" className="nlabel gold" style={{ left: x, top: y + 48 }}>Финал сезона</span>);
    if (n === 1 && !vertical) out.push(<span key="st" className="nlabel" style={{ left: x, top: y + 46 }}>Старт</span>);
  }

  // карточки-награды у дорожки (10-я — сам финальный узел)
  const [cx, cy] = P(cur);
  const curRight = vertical ? cx <= W / 2 + 1 : true;
  for (let n = 1; n < SEASON; n++) {
    const [x1, y1] = P(n),
      [x2, y2] = P(n + 1);
    const mx = (x1 + x2) / 2,
      my = (y1 + y2) / 2;
    let left: number, top: number, rot: number;
    if (vertical) {
      const side = mx > W / 2 ? -1 : mx < W / 2 ? 1 : n % 2 ? 1 : -1;
      if (n === cur) {
        left = curRight ? W * 0.862 : W * 0.138;
        top = y1 - 22;
        rot = curRight ? 7 : -7;
      } else {
        left = mx + side * W * 0.256;
        top = my;
        rot = side * 7;
      }
    } else {
      left = mx;
      top = my <= 220 ? 336 : 104;
      rot = (n % 2 ? 1 : -1) * 6;
    }
    const c = sv.got.find((g) => g.pos === n);
    const size = vertical ? 3.6 : 3.8;
    const style = { left, top, "--r": `${rot}deg` } as CSSProperties;
    out.push(
      c ? (
        <button key={`c${n}`} className="cmark got" style={style} aria-label={`Карточка ${cardNo(n)}: ${c.name}`} onClick={() => go({ name: "card", no: c.no, from: { name: "path" } })}>
          <CardFront card={c} size={size} />
        </button>
      ) : (
        <div key={`c${n}`} className={`cmark${n === cur ? " nextc" : " far"}`} style={style}>
          <CardLocked pos={n} next={n === cur} size={size} />
          {n === cur && <span className="cm-tag">{sv.todayDone ? "завтра" : "после части 2"}</span>}
        </div>
      ),
    );
  }

  // игрок у текущего урока: с той стороны, где есть место
  if (vertical) {
    const right = cx < W / 2 - 1;
    out.push(<PathPlayer key="sk" flip={right} style={{ left: right ? cx + 38 : cx - 150, top: cy - 74, width: 112 }} />);
  } else {
    const right = cx - 152 < 10;
    out.push(<PathPlayer key="sk" flip={right} style={{ left: right ? cx + 40 : cx - 152, top: cy - 78, width: 118 }} />);
  }
  return <>{out}</>;
}

/** Разметка катка: вертикальный (телефон) или горизонтальный (десктоп). */
function RinkSvg({ geo, cur, season, vertical, ys }: { geo: Geo; cur: number; season: number; vertical: boolean; ys?: number[] }) {
  const { W, H, P } = geo;
  const fo = (x: number, y: number, r: number, horiz: boolean, k: string) => (
    <g key={k}>
      <g className="fo">
        <circle cx={x} cy={y} r={r} />
        <path d={horiz ? `M${x - r - 10} ${y - 8}h10M${x - r - 10} ${y + 8}h10M${x + r} ${y - 8}h10M${x + r} ${y + 8}h10` : `M${x - 8} ${y - r - 10}v10M${x + 8} ${y - r - 10}v10M${x - 8} ${y + r}v10M${x + 8} ${y + r}v10`} />
      </g>
      <circle className="fod" cx={x} cy={y} r={7} />
    </g>
  );
  const trailDone = cur > 1 ? curve(P, 1, Math.min(cur, SEASON)) : null;
  const trailAhead = cur < SEASON ? curve(P, Math.min(cur, SEASON), SEASON) : null;
  const trails = (
    <>
      {trailAhead && <path className="trail-ahead" d={trailAhead} />}
      {trailDone && <path className="trail" d={trailDone} />}
      {trailDone && <path className="trail-in" d={trailDone} />}
    </>
  );

  if (vertical) {
    const y = ys!;
    const mid = (a: number, b: number) => (y[a] + y[b]) / 2;
    const redY = mid(5, 6),
      blueA = mid(7, 8),
      blueB = mid(3, 4);
    const topGoal = 132,
      botGoal = H - 92,
      c = W / 2,
      l = W * 0.25,
      r = W * 0.75;
    return (
      <svg className="rink-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
        <rect className="ice" x="8" y="24" width={W - 16} height={H - 48} rx="132" />
        <rect className="bl" x="8" y={blueA - 7} width={W - 16} height="14" />
        <rect className="bl" x="8" y={blueB - 7} width={W - 16} height="14" />
        <rect className="rl" x="8" y={redY - 4} width={W - 16} height="8" />
        <circle className="cc" cx={c} cy={redY} r="74" />
        <text className="cct" x={c} y={redY - 30} textAnchor="middle">СЕЗОН {season}</text>
        <path className="gl" d={`M40 ${topGoal}H${W - 40}M40 ${botGoal}H${W - 40}`} />
        <path className="crease" d={`M${c - 35} ${topGoal}a35 35 0 0 0 70 0z`} />
        <path className="crease" d={`M${c - 35} ${botGoal}a35 35 0 0 1 70 0z`} />
        <g className="net"><rect x={c - 28} y={topGoal - 30} width="56" height="30" rx="8" /></g>
        <g className="net"><rect x={c - 28} y={botGoal} width="56" height="30" rx="8" /></g>
        {fo(l, y[9] - 20, 54, true, "a")}
        {fo(r, y[9] - 20, 54, true, "b")}
        {fo(l, y[2] + 20, 54, true, "c")}
        {fo(r, y[2] + 20, 54, true, "d")}
        {[[l, blueA + 44], [r, blueA + 44], [l, blueB - 44], [r, blueB - 44]].map(([x, yy], i) => <circle key={i} className="fod" cx={x} cy={yy} r="6" />)}
        {trails}
      </svg>
    );
  }
  const xs = (n: number) => P(n)[0];
  const cx = (xs(5) + xs(6)) / 2,
    bA = (xs(3) + xs(4)) / 2,
    bB = (xs(7) + xs(8)) / 2;
  return (
    <svg className="rink-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <rect className="ice" x="2" y="2" width={W - 4} height={H - 4} rx="150" />
      <rect className="bl" x={bA - 8} y="2" width="16" height={H - 4} />
      <rect className="bl" x={bB - 8} y="2" width="16" height={H - 4} />
      <rect className="rl" x={cx - 4} y="2" width="8" height={H - 4} />
      <circle className="cc" cx={cx} cy="220" r="78" />
      <path className="gl" d={`M62 40V400M${W - 62} 40V400`} />
      <path className="crease" d="M62 186a34 34 0 0 1 0 68z" />
      <path className="crease" d={`M${W - 62} 186a34 34 0 0 0 0 68z`} />
      <g className="net"><rect x="30" y="192" width="32" height="56" rx="8" /></g>
      <g className="net"><rect x={W - 62} y="192" width="32" height="56" rx="8" /></g>
      {fo(200, 112, 58, false, "a")}
      {fo(200, 328, 58, false, "b")}
      {fo(W - 200, 112, 58, false, "c")}
      {fo(W - 200, 328, 58, false, "d")}
      {[[bA + 48, 112], [bA + 48, 328], [bB - 48, 112], [bB - 48, 328]].map(([x, yy], i) => <circle key={i} className="fod" cx={x} cy={yy} r="6" />)}
      {trails}
    </svg>
  );
}

const XS_V = [0.5, 0.75, 0.5, 0.25, 0.5, 0.75, 0.5, 0.25, 0.5, 0.5];
const YP_H = [220, 112, 220, 328, 220, 112, 220, 328, 220, 220];

export function PathScreen({ deck, state, go, wide }: { deck: Deck; state: AppState; go: (v: View) => void; wide: boolean }) {
  const now = useNow();
  const ls = lessonStatus(state, deck, now);
  const sv = seasonView(state, deck, ls.today);
  const cur = currentLesson(ls, sv, state, deck);
  const sk = streak(state.days, ls.today);
  const [sel, setSel] = useState<number | null>(null);
  const [streakOpen, setStreakOpen] = useState(false);
  const streakSheet = streakOpen && <StreakSheet days={state.days} today={ls.today} go={go} onClose={() => setStreakOpen(false)} />;
  const selCard = sel ? (sv.got.find((c) => c.pos === sel) ?? null) : null;
  const [wrapRef, W0] = useWidth<HTMLDivElement>(wide ? 1152 : 390);
  const [popRef, popH] = useHeight<HTMLElement>(300);

  // закрыть пузырь пройденного урока — Esc
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const toggle = (pos: number) => setSel(sel === pos ? null : pos);
  // открыли пройденный урок — его пузырь целиком на экране (не под шапкой и вкладками)
  const selRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sel) selRef.current?.scrollIntoView?.({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [sel]);
  const chips = (long: boolean) => (
    <>
      <button className={`hchip${sk ? "" : " zero"}`} aria-haspopup="dialog" aria-label={`${sk} ${plural(sk, "день", "дня", "дней")} подряд — подробнее о серии`} onClick={() => setStreakOpen(true)}><Flame aria-hidden="true" />{sk}{long ? ` ${plural(sk, "день", "дня", "дней")} подряд` : ""}</button>
      <button className="hchip cards" aria-label={`Карточек: ${sv.got.length} из ${SEASON} — открыть коллекцию`} onClick={() => go({ name: "collection" })}><Cards aria-hidden="true" />{sv.got.length}/{SEASON}</button>
      {streakSheet}
    </>
  );
  const meta = `Сезон ${sv.season} · урок ${sv.next} из ${SEASON}`;

  if (wide) {
    const W = Math.max(860, W0);
    const step = (W - 256) / 9;
    const geo: Geo = { W, H: 440, P: (n) => [128 + (n - 1) * step, YP_H[n - 1]] };
    const [sx, sy] = selCard ? geo.P(sel!) : [0, 0];
    return (
      <div className="path-desk">
        <div className="dhead">
          <h1>Путь</h1>
          <span className="meta">{meta} · {sv.got.length} {plural(sv.got.length, "карточка", "карточки", "карточек")} из {SEASON}</span>
          {chips(true)}
        </div>
        <div className="drink" ref={wrapRef} onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          <RinkSvg geo={geo} cur={sv.next} season={sv.season} vertical={false} />
          <Marks geo={geo} sv={sv} sel={sel} onNode={toggle} go={go} vertical={false} />
          {selCard && (
            <section ref={selRef} className="card lesson-pop done-pop dpop" style={{ left: Math.min(Math.max(sx - 150, 8), W - 308), top: sy + 50, "--ax": `${sx - Math.min(Math.max(sx - 150, 8), W - 308) - 11}px` } as CSSProperties} aria-label={`Урок ${selCard.lesson}`}>
              <DoneBody card={selCard} go={go} />
            </section>
          )}
        </div>
        <div className="dgrid">
          <section className="card lesson-cardd" aria-label="Текущий урок">
            <CurrentBody cur={cur} go={go} head="card" />
          </section>
          <section className="card nextcard">
            <CardLocked pos={sv.next} gold={sv.next === SEASON} next size={6.4} />
            <div>
              <span className="k">Следующая карточка</span>
              <b>{cardNo(sv.next)}{sv.next === SEASON ? " · Финал" : ""}</b>
              <p>{sv.todayDone ? `Откроется после урока ${sv.nextLesson} — завтра.` : `Откроется после части 2 урока ${sv.nextLesson}.`} На обороте — слова этого урока.</p>
            </div>
          </section>
          <button className="card dcoll" aria-label={`Коллекция: ${sv.got.length} из ${SEASON}`} onClick={() => go({ name: "collection" })}>
            <span className="dl-head"><h3>Коллекция</h3><span>Сезон {sv.season}</span></span>
            <Fan sv={sv} size={5.4} />
            <span className="seasonbar"><i style={{ width: `${(sv.got.length / SEASON) * 100}%` }} /></span>
            <span className="cnt"><span>{sv.got.length} из {SEASON} карточек</span><span>Финал — урок {sv.nextLesson + (SEASON - sv.next)}</span></span>
          </button>
        </div>
      </div>
    );
  }

  // телефон: снизу вверх — от старта к воротам; под текущим уроком — место для пузыря
  const W = Math.min(Math.max(W0, 300), 620);
  const GAP = 112,
    TOP = 250,
    BOTTOM = 440,
    BUBBLE = Math.max(GAP, 62 + popH + 56);
  const ys: number[] = [];
  let y = TOP;
  for (let n = SEASON; n >= 1; n--) {
    ys[n] = y;
    y += n === sv.next ? BUBBLE : GAP;
  }
  const H = ys[1] + BOTTOM;
  const geo: Geo = { W, H, P: (n) => [W * XS_V[n - 1], ys[n]] };
  const [cx, cy] = geo.P(sv.next);
  const [sx, sy] = selCard ? geo.P(sel!) : [0, 0];
  const first = sv.got[0]?.day ?? (sv.todayDone ? null : sv.day);

  return (
    <div className="pathpage">
      <header className="hud">
        <div><h1>Путь</h1><span>{meta}</span></div>
        {chips(false)}
      </header>
      <ScrollToCurrent y={cy} />
      <div className="rinkwrap" ref={wrapRef} style={{ height: H }} onClick={(e) => e.target === e.currentTarget && setSel(null)}>
        <RinkSvg geo={geo} cur={sv.next} season={sv.season} vertical ys={ys} />
        <Marks geo={geo} sv={sv} sel={sel} onNode={toggle} go={go} vertical />
        <section ref={popRef} className="card lesson-pop" style={{ top: cy + 62, "--ax": `${cx - 16 - 11}px` } as CSSProperties} aria-label="Текущий урок">
          <CurrentBody cur={cur} go={go} />
        </section>
        {selCard && (
          <section ref={selRef} className="card lesson-pop done-pop" style={{ top: sy + 52, "--ax": `${sx - 16 - 11}px` } as CSSProperties} aria-label={`Урок ${selCard.lesson}`}>
            <DoneBody card={selCard} go={go} />
          </section>
        )}
        <div className="start-tag" style={{ top: H - 92 - 44 }}>{first ? `Старт · ${ruDay(first)}` : "Старт"}</div>
      </div>
    </div>
  );
}

/** При открытии «Пути» — прокрутить к текущему уроку (он и пузырь — на экране). */
function ScrollToCurrent({ y }: { y: number }) {
  const done = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (done.current || !ref.current) return;
    done.current = true;
    const wrap = ref.current.nextElementSibling as HTMLElement | null;
    if (!wrap) return;
    const top = wrap.getBoundingClientRect().top + window.scrollY + y;
    window.scrollTo(0, Math.max(0, top - Math.round(window.innerHeight * 0.32)));
  });
  return <span ref={ref} hidden />;
}
