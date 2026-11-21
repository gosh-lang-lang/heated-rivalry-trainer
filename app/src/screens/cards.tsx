import { useEffect, useId, useState, type CSSProperties } from "react";
import type { CardCategory, LessonCard } from "../core/cards";
import type { Deck } from "../core/types";
import { skaterAt } from "../lib/skaters";
import { say, useSpeaking } from "../lib/speech";

/*
 * Карточка-награда, как хоккейная: номер и категория, иллюстрация, плашка с именем и строкой из книги,
 * внизу сезон и урок; на обороте — точность, слов, минут и все слова урока.
 * Размеры — в em (карточка 15em × 21em): одна и та же карточка в веере, сетке, на пути и во весь экран.
 * Иллюстрации — заглушки в палитре приложения; настоящие кладутся в app/public/cards/s<сезон>-<NN>.webp
 * и подхватываются сами (см. useCardImage), заглушка остаётся, пока файла нет.
 */

const CAT_COLOR: Record<CardCategory, string> = { Герой: "#d9233a", Команда: "#e08a00", Место: "#178a4c", Сцена: "#1f5fd1", Финал: "#b86e00" };

const pad = (n: number) => String(n).padStart(2, "0");
/** «№ 04» — номер в сезоне (тонкий пробел). */
export const cardNo = (pos: number) => `№ ${pad(pos)}`;

/* ---------- иллюстрации-заглушки ---------- */

const halftone = (id: string, c: string, o = 0.22) =>
  `<defs><pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="4.5" cy="4.5" r="1.7" fill="${c}" opacity="${o}"/></pattern></defs>`;
const grad = (id: string, a: string, b: string, diag = false) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="${diag ? 1 : 0}" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
const bg = (u: string, a: string, b: string, dot: string, o: number, diag = false) =>
  grad("g" + u, a, b, diag) + halftone("h" + u, dot, o) + `<rect width="200" height="200" fill="url(#g${u})"/><rect width="200" height="200" fill="url(#h${u})"/>`;
const shield = (fill: string, top: string, star: string) =>
  `<path d="M100 22 158 40v54c0 40-26 64-58 80-32-16-58-40-58-80V40z" fill="#fff"/>` +
  `<path d="M100 32 148 47v47c0 33-21 54-48 68-27-14-48-35-48-68V47z" fill="${fill}"/>` +
  `<path d="M100 32 148 47v20H52V47z" fill="${top}"/>` +
  `<path d="M70 58l3 6 6 .8-4.5 4.2 1.2 6.4L70 72.3 64.3 75.4l1.2-6.4L61 64.8l6-.8zM130 58l3 6 6 .8-4.5 4.2 1.2 6.4-5.7-3.1-5.7 3.1 1.2-6.4-4.5-4.2 6-.8z" fill="${star}"/>` +
  `<path d="M78 84 122 136M122 84 78 136" stroke="#e9e2d6" stroke-width="5" stroke-linecap="round"/>` +
  `<ellipse cx="80" cy="140" rx="5" ry="9" transform="rotate(-40 80 140)" fill="#e9e2d6"/><ellipse cx="120" cy="140" rx="5" ry="9" transform="rotate(40 120 140)" fill="#e9e2d6"/>`;

const ART: Record<string, (u: string) => string> = {
  shane: (u) =>
    bg(u, "#2f6fe0", "#12306b", "#fff", 0.18) +
    `<path d="M-10 150 210 128" stroke="#fff" stroke-opacity=".14" stroke-width="18"/><path d="M-10 168 210 146" stroke="#d3203b" stroke-opacity=".55" stroke-width="7"/>` +
    `<ellipse cx="102" cy="188" rx="78" ry="9" fill="#06143a" opacity=".35"/>` +
    skaterAt("red", -8, 20, 220),
  ilya: (u) =>
    bg(u, "#ffd447", "#e08a00", "#7a3d00", 0.2) +
    `<path d="M-10 128 210 150" stroke="#17181c" stroke-opacity=".75" stroke-width="10"/><path d="M-10 142 210 164" stroke="#fff" stroke-opacity=".5" stroke-width="4"/>` +
    `<ellipse cx="98" cy="188" rx="78" ry="9" fill="#5a2c00" opacity=".3"/>` +
    skaterAt("black", -12, 20, 220, true),
  room: (u) =>
    bg(u, "#2fb36c", "#0f6a39", "#fff", 0.15) +
    `<rect x="0" y="150" width="200" height="50" fill="#0b4f2a" opacity=".55"/>` +
    [18, 74, 130]
      .map(
        (x, i) =>
          `<g transform="translate(${x} 34)"><rect width="52" height="122" rx="5" fill="#12306b"/><rect x="4" y="4" width="44" height="114" rx="3" fill="#0b2152"/>` +
          `<path d="M8 34 18 22h16l10 12-7 7v42H15V41z" fill="${i === 1 ? "#17181c" : "#d3203b"}"/>` +
          `<path d="M8 34 18 22h16l10 12" fill="none" stroke="${i === 1 ? "#f6c21b" : "#fff"}" stroke-width="2.5"/>` +
          `<path d="M15 60h22" stroke="${i === 1 ? "#f6c21b" : "#1f3f94"}" stroke-width="5"/><circle cx="26" cy="13" r="3" fill="#c9d3de"/></g>`,
      )
      .join("") +
    `<rect x="8" y="158" width="184" height="14" rx="5" fill="#b86e00"/><rect x="20" y="172" width="8" height="20" fill="#7a4a00"/><rect x="172" y="172" width="8" height="20" fill="#7a4a00"/>` +
    `<g transform="translate(118 140) rotate(-8)"><rect width="34" height="18" rx="4" fill="#fff"/><path d="M5 9h24" stroke="#d3203b" stroke-width="3"/></g>`,
  team: (u) =>
    bg(u, "#ff4a5e", "#a8162a", "#fff", 0.16, true) +
    `<path d="M0 52h200M0 150h200" stroke="#fff" stroke-opacity=".25" stroke-width="8"/>` +
    shield("#12306b", "#1f5fd1", "#fff") +
    `<path d="M66 112h68c-6 14-18 20-34 20s-28-6-34-20z" fill="#d3203b"/><path d="M66 112h68" stroke="#fff" stroke-width="3"/>`,
  raiders: (u) =>
    bg(u, "#3a3b42", "#0c0d10", "#f6c21b", 0.16, true) +
    `<path d="M0 52h200M0 150h200" stroke="#f6c21b" stroke-opacity=".35" stroke-width="8"/>` +
    shield("#17181c", "#f6c21b", "#17181c") +
    `<path d="M66 112h68c-6 14-18 20-34 20s-28-6-34-20z" fill="#f6c21b"/>`,
  faceoff: (u) =>
    grad("g" + u, "#f4f8fe", "#c9dbf0") +
    `<rect width="200" height="200" fill="url(#g${u})"/>` +
    `<ellipse cx="100" cy="176" rx="88" ry="22" fill="none" stroke="#d9233a" stroke-opacity=".6" stroke-width="3"/><ellipse cx="100" cy="176" rx="5" ry="2.5" fill="#d9233a"/>` +
    `<path d="M0 120h200" stroke="#1f5fd1" stroke-opacity=".25" stroke-width="10"/>` +
    skaterAt("red", -40, 70, 150) +
    skaterAt("black", 90, 70, 150, true) +
    `<ellipse cx="100" cy="166" rx="7" ry="3" fill="#17181c"/><path d="M100 140v-12M90 146l-8-6M110 146l8-6" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>`,
  arena: (u) =>
    grad("g" + u, "#1b3f86", "#060f24") +
    `<rect width="200" height="200" fill="url(#g${u})"/>` +
    [0, 1, 2, 3, 4].map((i) => `<path d="M0 ${40 + i * 16}Q100 ${24 + i * 16} 200 ${40 + i * 16}" stroke="${i % 2 ? "#d3203b" : "#2f6fe0"}" stroke-opacity=".55" stroke-width="9" fill="none" stroke-dasharray="3 5"/>`).join("") +
    `<path d="M-20 200 30 118h140l50 82z" fill="#eef5ff"/><path d="M30 118h140" stroke="#c9d3de" stroke-width="4"/>` +
    `<path d="M100 120v80" stroke="#d9233a" stroke-width="4" opacity=".7"/><ellipse cx="100" cy="160" rx="30" ry="12" fill="none" stroke="#1f5fd1" stroke-width="3" opacity=".6"/>` +
    [30, 100, 170].map((x) => `<circle cx="${x}" cy="14" r="7" fill="#fff8d6"/><path d="M${x} 14 ${x - 26} 118M${x} 14 ${x + 26} 118" stroke="#fff8d6" stroke-opacity=".12" stroke-width="16"/>`).join(""),
  press: (u) =>
    bg(u, "#e9eef6", "#b7c6da", "#12306b", 0.1) +
    `<rect x="0" y="0" width="200" height="120" fill="#12306b" opacity=".9"/>` +
    [0, 1, 2, 3].map((i) => `<g transform="translate(${14 + i * 46} ${14 + (i % 2) * 52})"><rect width="38" height="38" rx="4" fill="#fff" opacity=".12"/><path d="M9 19l6-7 6 7 6-7" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none"/></g>`).join("") +
    `<rect x="10" y="132" width="180" height="60" rx="6" fill="#d3203b"/><rect x="10" y="132" width="180" height="10" rx="4" fill="#a8162a"/>` +
    [62, 100, 138].map((x, i) => `<path d="M${x} 132v-22" stroke="#2b2b30" stroke-width="4"/><rect x="${x - 7}" y="${92 + (i % 2) * 4}" width="14" height="22" rx="7" fill="${i === 1 ? "#17181c" : "#3a3b42"}"/><rect x="${x - 9}" y="${108 + (i % 2) * 4}" width="18" height="7" rx="2" fill="${["#1f5fd1", "#f6c21b", "#2fb36c"][i]}"/>`).join(""),
  cottage: (u) =>
    grad("g" + u, "#ffd8a8", "#7fb3e8") +
    `<rect width="200" height="200" fill="url(#g${u})"/><circle cx="150" cy="56" r="20" fill="#fff4d6"/>` +
    `<path d="M-10 118 40 70l36 40 38-52 52 60h44v80H-10z" fill="#2f5a7a" opacity=".55"/>` +
    `<path d="M-10 132 30 98l30 26 40-40 44 44 36-22 30 26v70H-10z" fill="#1d4d3a"/>` +
    `<rect x="0" y="150" width="200" height="50" fill="#3f7fc0"/><path d="M14 166h40M88 176h60M150 160h34" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M62 150v-30l26-20 26 20v30z" fill="#8a4b22"/><path d="M56 122 88 96l32 26" stroke="#5a2c10" stroke-width="7" fill="none" stroke-linejoin="round"/><rect x="82" y="128" width="12" height="22" fill="#3a1d0a"/><rect x="99" y="124" width="10" height="10" fill="#ffd447"/>`,
  cup: (u) =>
    grad("g" + u, "#ffe08a", "#b86e00", true) +
    `<rect width="200" height="200" fill="url(#g${u})"/>` +
    `<path d="M70 40h60v30c0 22-14 36-30 36S70 92 70 70z" fill="#fff" opacity=".9"/>` +
    `<path d="M70 50H52c0 22 10 30 22 30M130 50h18c0 22-10 30-22 30" fill="none" stroke="#fff" stroke-width="7" opacity=".9"/>` +
    `<rect x="92" y="104" width="16" height="30" fill="#fff" opacity=".9"/><rect x="72" y="134" width="56" height="22" rx="4" fill="#fff" opacity=".9"/>`,
};

/** Адрес настоящей иллюстрации карточки: /cards/s1-04.webp. */
const cardImageUrl = (season: number, pos: number) => `/cards/s${season}-${pad(pos)}.webp`;

/** Есть ли файл — проверяем один раз на адрес за сеанс (нет файла — заглушка, без повторных запросов). */
const probed = new Map<string, Promise<boolean>>();
const known = new Map<string, boolean>();
const probe = (url: string) => {
  let p = probed.get(url);
  if (!p) {
    p = new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0);
      img.onerror = () => resolve(false);
      img.src = url;
    }).then((ok) => (known.set(url, ok), ok));
    probed.set(url, p);
  }
  return p;
};

/** Адрес иллюстрации, если файл есть и загрузился; иначе null (рисуем заглушку). */
function useCardImage(url: string): string | null {
  const [ok, setOk] = useState(() => known.get(url) ?? false);
  useEffect(() => {
    let live = true;
    if (typeof Image === "undefined") return;
    void probe(url).then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, [url]);
  return ok ? url : null;
}

/** Иллюстрация карточки: файл из /cards/, пока его нет — заглушка. */
export function CardArt({ art, season, pos }: { art: string; season: number; pos: number }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  const img = useCardImage(cardImageUrl(season, pos));
  if (img) return <img src={img} alt="" draggable={false} />;
  return (
    <svg
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: (ART[art] ?? ART.shane)(u) }}
    />
  );
}

type Size = { size?: number; className?: string };
const sized = (size: number | undefined, extra?: CSSProperties): CSSProperties => ({ ...(size ? { fontSize: size } : {}), ...extra });

/** Лицо полученной карточки. */
export function CardFront({ card, size, className = "" }: { card: LessonCard } & Size) {
  return (
    <div className={`tc${card.gold ? " gold" : ""} ${className}`} style={sized(size, { "--cat": CAT_COLOR[card.cat] } as CSSProperties)} data-card={card.no}>
      <div className="tc-in">
        <div className="tc-top"><span className="tc-no">{cardNo(card.pos)}</span><span className="tc-cat">{card.cat}</span></div>
        <div className="tc-art"><CardArt art={card.art} season={card.season} pos={card.pos} /></div>
        <div className="tc-plate"><i className="tc-stripe" /><b>{card.name}</b><small>{card.line}</small></div>
        <div className="tc-foot"><span>Сезон {card.season}</span><span>Урок {card.lesson}</span></div>
      </div>
      <i className="tc-shine" />
    </div>
  );
}

/** Закрытая карточка: «?» (финальная — кубок). next — следующая (синий пунктир). */
export function CardLocked({ pos, gold = false, next = false, size, className = "" }: { pos: number; gold?: boolean; next?: boolean } & Size) {
  return (
    <div className={`tc locked${gold ? " gold" : ""}${next ? " next" : ""} ${className}`} style={sized(size)} aria-hidden="true">
      <div className="tc-in">
        <span className="tc-no">{cardNo(pos)}</span>
        <b className="tc-q">{gold ? "🏆" : "?"}</b>
      </div>
    </div>
  );
}

/** «неотразимый; обаятельный» → «неотразимый». */
const shortRu = (ru: string) => ru.split(/[;,(]/)[0].trim();

/** Слово на обороте: нажатие — озвучка. */
function BackWord({ en, ru, pic }: { en: string; ru: string; pic: string }) {
  const st = useSpeaking(en);
  return (
    <li>
      <button className={`tb-w${st ? " on" : ""}`} data-say={en} aria-label={`Озвучить: ${en} — ${shortRu(ru)}`} aria-pressed={!!st} onClick={() => say(en)}>
        <span aria-hidden="true">{pic}</span>
        <b>{en}</b>
        <small>{shortRu(ru)}</small>
      </button>
    </li>
  );
}

const ruDay = (k: string) => new Date(k + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

/** Оборот: точность, слов, минут и слова урока (нажми — услышишь). */
export function CardBack({ card, deck, size, className = "" }: { card: LessonCard; deck: Deck } & Size) {
  return (
    <div className={`tc back${card.gold ? " gold" : ""} ${className}`} style={sized(size, { "--cat": CAT_COLOR[card.cat] } as CSSProperties)}>
      <div className="tc-in">
        <div className="tb-head"><span className="tc-no">{cardNo(card.pos)}</span><span className="tc-cat">{card.cat}</span></div>
        <b className="tb-name">{card.name}</b>
        <div className="tb-stats">
          <div><b>{card.pct}%</b>верно</div>
          <div><b>{card.words.length}</b>слов</div>
          <div><b>{card.mins}</b>мин</div>
        </div>
        <div className="tb-cap">Урок {card.lesson} · {ruDay(card.day)}</div>
        <ol className="tb-words" aria-label={`Слова урока ${card.lesson}`}>
          {card.words.map((id) => {
            const w = deck.byId[id];
            return w ? <BackWord key={id} en={w.en} ru={w.ru} pic={w.picture} /> : null;
          })}
        </ol>
      </div>
    </div>
  );
}

export { ruDay };
