// Общие куски макетов: статус-бар iPhone, нижняя панель вкладок, игрок (lib/skaters.ts), карточки-награды.
(() => {
  const q = new URLSearchParams(location.search);
  const h = document.documentElement;
  h.dataset.glass = "ice";
  h.dataset.theme = q.get("theme") || "light";
  window.MQ = q;
})();

/* ---------- хоккеист: копия lib/skaters.ts ---------- */
const KIT_RED = { jersey: "#d3203b", stripe: "#1f3f94", stripe2: "#ffffff", pants: "#1b2a55", socks: "#d3203b", sockStripe: "#ffffff", helmet: "#1b2a55", glove: "#e9e2d6" };
const KIT_BLACK = { jersey: "#17181c", stripe: "#f6c21b", stripe2: "#f6c21b", pants: "#17181c", socks: "#f6c21b", sockStripe: "#17181c", helmet: "#17181c", glove: "#2c2d33" };
const skaterInner = (k) =>
  `<path d="M140 86 213 182" stroke="#2b2b30" stroke-width="5" stroke-linecap="round"/>` +
  `<path d="M209 183 236 187" stroke="#2b2b30" stroke-width="7" stroke-linecap="round"/>` +
  `<path d="M100 118 72 146 44 164" stroke="${k.socks}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
  `<path d="M58 156 66 151" stroke="${k.sockStripe}" stroke-width="17"/>` +
  `<path d="M100 118 76 142" stroke="${k.pants}" stroke-width="23" stroke-linecap="round"/>` +
  `<path d="M28 162c6-6 18-9 26-5l4 8-28 3z" fill="#222"/><path d="M24 172 60 168" stroke="#c9d3de" stroke-width="3" stroke-linecap="round"/>` +
  `<path d="M112 120 140 146 128 176" stroke="${k.socks}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
  `<path d="M134 158 132 166" stroke="${k.sockStripe}" stroke-width="17"/>` +
  `<path d="M112 120 136 142" stroke="${k.pants}" stroke-width="24" stroke-linecap="round"/>` +
  `<path d="M116 176c4-4 16-4 22 0l6 9h-30z" fill="#222"/><path d="M110 190 150 190" stroke="#c9d3de" stroke-width="3" stroke-linecap="round"/>` +
  `<path d="M82 112c0 16 12 24 30 22 12-2 16-10 12-20z" fill="${k.pants}"/>` +
  `<path d="M82 120c-6-26 12-50 46-56 20-3 34 8 32 24-2 16-20 28-44 34z" fill="${k.jersey}"/>` +
  `<path d="M86 106c22-4 46-10 70-20" stroke="${k.stripe}" stroke-width="8" fill="none"/>` +
  `<path d="M87 115c22-4 44-9 64-17" stroke="${k.stripe2}" stroke-width="4" fill="none"/>` +
  `<path d="M134 72 152 86 152 102" stroke="${k.jersey}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
  `<path d="M150 80 172 104 177 132" stroke="${k.jersey}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
  `<path d="M171 112 176 122" stroke="${k.stripe}" stroke-width="14"/>` +
  `<circle cx="152" cy="104" r="8" fill="${k.glove}"/><circle cx="178" cy="135" r="9" fill="${k.glove}"/>` +
  `<circle cx="164" cy="54" r="16" fill="${k.helmet}"/>` +
  `<path d="M168 52c8 0 14 6 13 13-1 6-7 9-13 7z" fill="#f0c6a2"/>` +
  `<path d="M166 50h17" stroke="#9fc4e8" stroke-width="4" stroke-linecap="round" opacity=".9"/>`;
window.SKATER = (kit = KIT_RED) => `<svg viewBox="0 0 240 200" aria-hidden="true">${skaterInner(kit)}</svg>`;
/* игрок внутри другого svg: x,y — левый верх, w — ширина, flip — смотрит влево */
const skaterAt = (kit, x, y, w, flip) => {
  const s = w / 240;
  const tf = flip ? `translate(${x + w} ${y}) scale(${-s} ${s})` : `translate(${x} ${y}) scale(${s})`;
  return `<g transform="${tf}">${skaterInner(kit)}</g>`;
};

/* ---------- иллюстрации карточек (заглушки в палитре приложения) ---------- */
const halftone = (id, c, o = 0.22) =>
  `<defs><pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="4.5" cy="4.5" r="1.7" fill="${c}" opacity="${o}"/></pattern></defs>`;
const ART = {
  shane: (u) => `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="g${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6fe0"/><stop offset="1" stop-color="#12306b"/></linearGradient>
    <radialGradient id="r${u}" cx=".62" cy=".38" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    ${halftone("h" + u, "#fff", 0.18)}
    <rect width="200" height="200" fill="url(#g${u})"/><rect width="200" height="200" fill="url(#h${u})"/>
    <path d="M-10 150 210 128" stroke="#fff" stroke-opacity=".14" stroke-width="18"/>
    <path d="M-10 168 210 146" stroke="#d3203b" stroke-opacity=".55" stroke-width="7"/>
    <rect width="200" height="200" fill="url(#r${u})"/>
    <ellipse cx="102" cy="188" rx="78" ry="9" fill="#06143a" opacity=".35"/>
    ${skaterAt(KIT_RED, -8, 20, 220)}</svg>`,
  ilya: (u) => `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="g${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd447"/><stop offset="1" stop-color="#e08a00"/></linearGradient>
    <radialGradient id="r${u}" cx=".4" cy=".35" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    ${halftone("h" + u, "#7a3d00", 0.2)}
    <rect width="200" height="200" fill="url(#g${u})"/><rect width="200" height="200" fill="url(#h${u})"/>
    <path d="M-10 128 210 150" stroke="#17181c" stroke-opacity=".75" stroke-width="10"/>
    <path d="M-10 142 210 164" stroke="#fff" stroke-opacity=".5" stroke-width="4"/>
    <rect width="200" height="200" fill="url(#r${u})"/>
    <ellipse cx="98" cy="188" rx="78" ry="9" fill="#5a2c00" opacity=".3"/>
    ${skaterAt(KIT_BLACK, -12, 20, 220, true)}</svg>`,
  room: (u) => `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="g${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fb36c"/><stop offset="1" stop-color="#0f6a39"/></linearGradient></defs>
    ${halftone("h" + u, "#fff", 0.15)}
    <rect width="200" height="200" fill="url(#g${u})"/><rect width="200" height="200" fill="url(#h${u})"/>
    <rect x="0" y="150" width="200" height="50" fill="#0b4f2a" opacity=".55"/>
    ${[18, 74, 130].map((x, i) => `<g transform="translate(${x} 34)">
      <rect width="52" height="122" rx="5" fill="#12306b"/><rect x="4" y="4" width="44" height="114" rx="3" fill="#0b2152"/>
      <path d="M8 34 18 22h16l10 12-7 7v42H15V41z" fill="${i === 1 ? "#17181c" : "#d3203b"}"/>
      <path d="M8 34 18 22h16l10 12" fill="none" stroke="${i === 1 ? "#f6c21b" : "#fff"}" stroke-width="2.5"/>
      <path d="M15 60h22" stroke="${i === 1 ? "#f6c21b" : "#1f3f94"}" stroke-width="5"/>
      <circle cx="26" cy="13" r="3" fill="#c9d3de"/></g>`).join("")}
    <rect x="8" y="158" width="184" height="14" rx="5" fill="#b86e00"/><rect x="20" y="172" width="8" height="20" fill="#7a4a00"/><rect x="172" y="172" width="8" height="20" fill="#7a4a00"/>
    <g transform="translate(118 140) rotate(-8)"><rect width="34" height="18" rx="4" fill="#fff"/><path d="M5 9h24" stroke="#d3203b" stroke-width="3"/></g></svg>`,
  team: (u) => `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="g${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4a5e"/><stop offset="1" stop-color="#a8162a"/></linearGradient></defs>
    ${halftone("h" + u, "#fff", 0.16)}
    <rect width="200" height="200" fill="url(#g${u})"/><rect width="200" height="200" fill="url(#h${u})"/>
    <path d="M0 52h200M0 150h200" stroke="#fff" stroke-opacity=".25" stroke-width="8"/>
    <path d="M100 22 158 40v54c0 40-26 64-58 80-32-16-58-40-58-80V40z" fill="#fff"/>
    <path d="M100 32 148 47v47c0 33-21 54-48 68-27-14-48-35-48-68V47z" fill="#12306b"/>
    <path d="M100 32 148 47v20H52V47z" fill="#1f5fd1"/>
    <path d="M70 58l3 6 6 .8-4.5 4.2 1.2 6.4L70 72.3 64.3 75.4l1.2-6.4L61 64.8l6-.8zM130 58l3 6 6 .8-4.5 4.2 1.2 6.4-5.7-3.1-5.7 3.1 1.2-6.4-4.5-4.2 6-.8z" fill="#fff"/>
    <path d="M66 112h68c-6 14-18 20-34 20s-28-6-34-20z" fill="#d3203b"/>
    <path d="M78 84 122 136M122 84 78 136" stroke="#e9e2d6" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="80" cy="140" rx="5" ry="9" transform="rotate(-40 80 140)" fill="#e9e2d6"/><ellipse cx="120" cy="140" rx="5" ry="9" transform="rotate(40 120 140)" fill="#e9e2d6"/>
    <path d="M66 112h68" stroke="#fff" stroke-width="3"/></svg>`,
  faceoff: (u) => `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="g${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8fe"/><stop offset="1" stop-color="#c9dbf0"/></linearGradient></defs>
    <rect width="200" height="200" fill="url(#g${u})"/>
    <ellipse cx="100" cy="176" rx="88" ry="22" fill="none" stroke="#d9233a" stroke-opacity=".6" stroke-width="3"/>
    <ellipse cx="100" cy="176" rx="5" ry="2.5" fill="#d9233a"/>
    <path d="M0 120h200" stroke="#1f5fd1" stroke-opacity=".25" stroke-width="10"/>
    ${skaterAt(KIT_RED, -40, 70, 150)}${skaterAt(KIT_BLACK, 90, 70, 150, true)}
    <ellipse cx="100" cy="166" rx="7" ry="3" fill="#17181c"/>
    <path d="M100 140v-12M90 146l-8-6M110 146l8-6" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/></svg>`,
  cup: (u) => `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="g${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".5" stop-color="#f5b324"/><stop offset="1" stop-color="#b86e00"/></linearGradient></defs>
    <rect width="200" height="200" fill="url(#g${u})"/>
    <path d="M70 40h60v30c0 22-14 36-30 36S70 92 70 70z" fill="#fff" opacity=".9"/>
    <path d="M70 50H52c0 22 10 30 22 30M130 50h18c0 22-10 30-22 30" fill="none" stroke="#fff" stroke-width="7" opacity=".9"/>
    <rect x="92" y="104" width="16" height="30" fill="#fff" opacity=".9"/><rect x="72" y="134" width="56" height="22" rx="4" fill="#fff" opacity=".9"/></svg>`,
};
const CAT_COLOR = { "Герой": "#d9233a", "Команда": "#e08a00", "Место": "#178a4c", "Сцена": "#1f5fd1", "Финал": "#b86e00" };
let uid = 0;

/** Карточка-награда. size — font-size в px (карточка 15em × 21em). */
window.cardFront = (c, size = 20, extra = "") => {
  const u = "c" + ++uid;
  return `<div class="tc ${c.gold ? "gold" : ""} ${extra}" style="font-size:${size}px;--cat:${CAT_COLOR[c.cat] || "#1f5fd1"}">
    <div class="tc-in">
      <div class="tc-top"><span class="tc-no">№&thinsp;${String(c.no).padStart(2, "0")}</span><span class="tc-cat">${c.cat}</span></div>
      <div class="tc-art">${ART[c.art](u)}</div>
      <div class="tc-plate"><i class="tc-stripe"></i><b>${c.name}</b><small>${c.line}</small></div>
      <div class="tc-foot"><span>Сезон 1</span><span>Урок ${c.lesson}</span></div>
    </div><i class="tc-shine"></i></div>`;
};
window.cardLocked = (c, size = 20, extra = "") =>
  `<div class="tc locked ${c.gold ? "gold" : ""} ${extra}" style="font-size:${size}px"><div class="tc-in"><span class="tc-no">№&thinsp;${String(c.no).padStart(2, "0")}</span><b class="tc-q">${c.gold ? "🏆" : "?"}</b></div></div>`;
window.cardBack = (c, size = 20) => {
  const ws = WORDS.filter((w) => w.lesson === c.lesson);
  const L = LESSONS[c.lesson - 1];
  return `<div class="tc back" style="font-size:${size}px;--cat:${CAT_COLOR[c.cat]}">
    <div class="tc-in">
      <div class="tb-head"><span class="tc-no">№&thinsp;${String(c.no).padStart(2, "0")}</span><span class="tc-cat">${c.cat}</span></div><b class="tb-name">${c.name}</b>
      <div class="tb-stats"><div><b>${L.score}</b>верно</div><div><b>${ws.length}</b>слов</div><div><b>${L.mins}</b>мин</div></div>
      <div class="tb-cap">Урок ${c.lesson} · ${L.date}</div>
      <ol class="tb-words">${ws.map((w) => `<li><span>${w.em}</span><b>${w.en}</b><small>${w.ru.split(/[;,(]/)[0].trim()}</small></li>`).join("")}</ol>
    </div></div>`;
};

/* ---------- строка словаря (как Words.tsx) ---------- */
const SPK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
window.SPK = SPK;
window.wordRow = (w, open = false, speaking = false) => {
  const dots = [1, 2, 3, 4, 5, 6].map((i) => `<i class="${i <= w.lvl ? "f" : ""}"></i>`).join("");
  const det = open
    ? `<div class="det">${w.rare ? "Редкое книжное слово: нужно узнавать при чтении, повторяется вдвое реже.<br>" : ""}<b style="color:var(--ink)">${w.ex}</b> — ${w.exRu}${w.due ? `<br>Следующее повторение: ${w.due.replace("ноя", "ноября").replace("дек", "декабря")}` : "<br>Придёт в одном из следующих уроков"}</div>`
    : "";
  return `<details class="wrow"${open ? " open" : ""}><summary>
    <div class="em">${w.em}</div>
    <div class="wen"><b>${w.en}</b>${w.rare ? '<span class="rare">редкое</span>' : ""}</div>
    <span class="mute sm wru">${w.ru}</span>
    <div class="dots${w.lesson ? "" : " ahead"}">${dots}</div>
    <button class="spk s${speaking ? " on talking" : ""}" aria-label="Озвучить">${SPK}</button>
  </summary>${det}</details>`;
};

/* ---------- иконки ---------- */
const I = (d, sw = 2.2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
window.ICON = {
  home: I('<rect x="2.5" y="5" width="19" height="14" rx="6"/><circle cx="12" cy="12" r="2.6"/><path d="M12 5v4.4M12 14.6V19"/>'),
  path: I('<circle cx="6" cy="19" r="2.2"/><path d="M8.2 19H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/><path d="M17 3v7"/><path d="M17 3.4h4l-1.3 1.8L21 7h-4"/>'),
  words: I('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/><path d="M9 8h7"/>'),
  me: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 2),
  back: I('<path d="M15 5l-7 7 7 7"/>', 2.6),
  chev: I('<path d="M6 9l6 6 6-6"/>', 2.6),
  right: I('<path d="M9 6l6 6-6 6"/>', 2.6),
  check: I('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
  lock: I('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 2.4),
  close: I('<path d="M6 6l12 12M18 6 6 18"/>', 2.6),
  flip: I('<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  flame: `<svg viewBox="0 0 24 24" fill="#ffb02e" stroke="#ff7a1a" stroke-width="1.5" stroke-linejoin="round"><path d="M12 22c4 0 7-2.7 7-6.6 0-3.5-2.4-5.6-3.6-8.4-.4 1.9-1.4 3-2.6 3.4.3-3.2-1-6.3-3.8-8.4.2 3.6-1.6 5.4-3.2 7.3C4.6 11.3 5 13 5 15.4 5 19.3 8 22 12 22z"/></svg>`,
  cards: I('<rect x="3" y="6" width="11" height="15" rx="2"/><path d="M8 3.5 18.5 2a2 2 0 0 1 2.2 1.7l1.6 11.4a2 2 0 0 1-1.7 2.3l-3.6.5"/>', 2.1),
  speaker: SPK,
};

/* ---------- рамка: статус-бар, вкладки, полоска «домой» ---------- */
window.chrome = ({ tab, noTab, sbDark } = {}) => {
  const sb = document.createElement("div");
  sb.className = "sbar" + (sbDark ? " on-dark" : "");
  sb.innerHTML = `<span class="sb-t">9:41</span><span class="sb-r">
    <svg viewBox="0 0 18 12" width="18" height="12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
    <svg viewBox="0 0 16 12" width="16" height="12"><path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.2-1.2A10.4 10.4 0 0 0 8 .5 10.4 10.4 0 0 0 .6 3.5l1.2 1.2A8.7 8.7 0 0 1 8 2.2zm0 3.4c1.5 0 2.8.6 3.8 1.5L13 5.9A7 7 0 0 0 8 3.9a7 7 0 0 0-5 2l1.2 1.2c1-.9 2.3-1.5 3.8-1.5zM8 9l2-2a2.9 2.9 0 0 0-4 0z"/></svg>
    <svg viewBox="0 0 27 13" width="27" height="13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="17" height="9" rx="2"/><path d="M25 4.5v4c.8-.3 1.5-1.1 1.5-2s-.7-1.7-1.5-2z" opacity=".45"/></svg></span>`;
  document.body.prepend(sb);
  if (!noTab) {
    const tabs = [["today", "Сегодня", ICON.home], ["path", "Путь", ICON.path], ["words", "Слова", ICON.words], ["me", "Я", ICON.me]];
    const nav = document.createElement("nav");
    nav.className = "tabbar";
    nav.innerHTML = tabs.map(([id, l, ic]) => `<button${id === tab ? ' aria-current="page"' : ""}>${ic}<span>${l}</span></button>`).join("");
    document.body.append(nav);
    document.querySelector(".app")?.classList.add("has-tabbar");
  }
  const hi = document.createElement("i");
  hi.className = "homeind";
  document.body.append(hi);
  const sc = +(MQ.get("scroll") || 0);
  if (sc) {
    document.body.classList.add("scrolled");
    requestAnimationFrame(() => window.scrollTo(0, sc));
  }
};
