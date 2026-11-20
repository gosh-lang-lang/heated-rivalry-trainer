import type { Look } from "../core/types";
import { SKATER_BLACK, SKATER_RED } from "./skaters";
import { useSettings } from "./settings";

/**
 * Оформление: «Классика» (плотные карточки, как было), «Лёд» (каток, стеклянные карточки — glass.css)
 * или «Матч» (тот же лёд, а за стеклом катаются два хоккеиста). Атрибуты <html data-glass> и data-players.
 * Выбор — в личных настройках (settings.look), общих для всех устройств.
 * В Chromium у стеклянной капсулы вкладок — линза с преломлением (SVG-фильтр), в Safari — обычное размытие.
 */

export type { Look };
export const LOOKS: [Look, string, string][] = [
  ["classic", "Классика", "Плотные карточки, как было"],
  ["ice", "Лёд", "Каток и стеклянные карточки"],
  ["match", "Матч", "Лёд, а на нём катаются соперники"],
];

/** Выбор, сделанный до того, как оформление стало общей настройкой (жил в localStorage). */
const LEGACY_KEY = "hr2_look";
export const legacyLook = (take = false): Look | null => {
  try {
    const m = localStorage.getItem(LEGACY_KEY);
    if (take) localStorage.removeItem(LEGACY_KEY);
    return LOOKS.some(([k]) => k === m) ? (m as Look) : null;
  } catch {
    return null;
  }
};

export const applyLook = (m: Look) => {
  const root = document.documentElement;
  root.dataset.glass = m === "match" ? "ice" : m;
  if (m === "match") root.dataset.players = "on";
  else delete root.dataset.players;
};

/** Слой с хоккеистами под страницей; виден только в «Матче» (glass.css). */
const mountPlayers = () => {
  const layer = document.createElement("div");
  layer.className = "rink-players";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `<div class="skater a">${SKATER_RED}</div><div class="skater b">${SKATER_BLACK}</div>`;
  document.body.appendChild(layer);
};

/** Карта смещения для линзы: красный — сдвиг по горизонтали у боковых краёв, зелёный — у верхнего и нижнего. */
const LENS_MAP =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>` +
      `<defs><linearGradient id='x'><stop offset='0' stop-color='#f00'/><stop offset='.16' stop-color='#800000'/><stop offset='.84' stop-color='#800000'/><stop offset='1' stop-color='#000'/></linearGradient>` +
      `<linearGradient id='y' x2='0' y2='1'><stop offset='0' stop-color='#0f0'/><stop offset='.32' stop-color='#008000'/><stop offset='.68' stop-color='#008000'/><stop offset='1' stop-color='#000'/></linearGradient></defs>` +
      `<rect width='100' height='100' fill='url(#x)'/><rect width='100' height='100' fill='url(#y)' style='mix-blend-mode:screen'/></svg>`,
  );

const mountLens = () => {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.innerHTML =
    `<filter id="lg-lens" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feImage href="${LENS_MAP}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="map" scale="36" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  document.body.appendChild(svg);
  document.documentElement.classList.add("lg-lens");
};

/** До первой отрисовки: оформление (из кэша настроек) и линза. */
export const initGlass = (look: Look) => {
  applyLook(look);
  mountPlayers();
  // backdrop-filter с SVG-фильтром умеет только Chromium; в Safari остаётся обычное размытие
  const brands = (navigator as { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  if (brands?.some((b) => b.brand === "Chromium")) mountLens();
};

/** Текущее оформление и смена его (в общих настройках; применяет App). */
export function useLook(): [Look, (m: Look) => void] {
  const { settings, set } = useSettings();
  return [settings.look, (m) => set("look", m)];
}
