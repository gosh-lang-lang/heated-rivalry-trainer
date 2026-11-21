import { useEffect, useRef } from "react";

/**
 * «Потяни, чтобы обновить» — свой, с двумя хоккеистами (сцена — PullScene в ui.tsx, стили — pull.css).
 * Тянешь страницу вниз от самого верха — сверху открывается полоска льда, игроки выезжают с краёв навстречу
 * (позиция идёт за пальцем, с резиной как у системного). Отпустил до порога — всё уезжает обратно.
 * После порога — встречаются в центре, стукаются клюшками (вбрасывание: искра и отскок), и страница перезагружается.
 *
 * Только касание: мышь и трекпад событий касания не шлют. Состояние — на <html>: data-ptr (pull / back / clash),
 * переменные --ptr-y (насколько сдвинута страница, px) и --ptr-p (0…1 — путь игроков до центра).
 * Нативный pull-to-refresh Safari выключен overscroll-behavior-y: contain (pull.css), в установленном PWA его и нет.
 */

/** Порог (px сдвига страницы, не пальца): дотянул — обновляем. */
export const PULL_THRESHOLD = 80;
/** Предел сдвига: дальше страница почти не идёт, как резина. */
const PULL_MAX = 150;
/** Сопротивление в начале: палец прошёл 10 px — страница ~8,5. */
const PULL_K = 0.85;
/** Мёртвая зона: короткое касание, тап и горизонтальный свайп — не потягивание. */
const SLOP = 8;
/** Сколько длится столкновение до перезагрузки, мс. */
export const CLASH_MS = 620;
/** Возврат, мс (как transition в pull.css). */
const BACK_MS = 320;

/** Палец прошёл dy px вниз → на сколько сдвинуть страницу (резина: сначала почти 1:1, дальше всё туже). */
export const pullDistance = (dy: number) => (dy <= 0 ? 0 : PULL_MAX * (1 - Math.exp((-dy * PULL_K) / PULL_MAX)));

/** Путь игроков к центру: 0 — за краями экрана, 1 — у точки вбрасывания (на пороге). */
export const pullProgress = (y: number) => Math.max(0, Math.min(1, y / PULL_THRESHOLD));

/** Касание внутри прокручиваемого блока, который сам не наверху, — тянуть страницу нельзя. */
const scrolledInside = (t: EventTarget | null) => {
  for (let el = t instanceof Element ? t : null; el && el !== document.body; el = el.parentElement) if (el.scrollTop > 0) return true;
  return false;
};
/** В полях ввода жест оставляем браузеру (выделение текста, ползунки). */
const inField = (t: EventTarget | null) => t instanceof Element && !!t.closest("input, textarea, select, [contenteditable]");
/** Поверх страницы открыто окно (карточка, панель снизу) — тянуть страницу под ним нельзя. */
const inDialog = (t: EventTarget | null) => t instanceof Element && !!t.closest('[aria-modal="true"]');

const reload = () => location.reload();
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Подключает жест к странице. enabled = false (занятие, итог) — слушателей нет, сцена спрятана.
 * refresh — что делать после столкновения (по умолчанию перезагрузить страницу).
 */
export function usePullToRefresh(enabled: boolean, refresh: () => void = reload) {
  // свежая функция в каждой отрисовке не должна переподключать жест (и обрывать столкновение)
  const onRefresh = useRef(refresh);
  onRefresh.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    let tracking = false, // палец лёг у самого верха страницы — может быть потягиванием
      pulling = false, // уже тянем: прокрутку перехватываем
      busy = false, // столкновение и перезагрузка: новые жесты не принимаем
      x0 = 0,
      y0 = 0,
      y = 0,
      timer = 0;

    const show = (mode: "pull" | "back" | "clash", dist: number, p = pullProgress(dist)) => {
      root.style.setProperty("--ptr-y", `${dist.toFixed(1)}px`);
      root.style.setProperty("--ptr-p", p.toFixed(3));
      root.dataset.ptr = mode;
    };
    const hide = () => {
      delete root.dataset.ptr;
      root.style.removeProperty("--ptr-y");
      root.style.removeProperty("--ptr-p");
    };

    const springBack = () => {
      show("back", 0, 0);
      timer = window.setTimeout(hide, BACK_MS);
    };

    const fire = () => {
      busy = true;
      // встали на порог (страница держится сдвинутой, пока идёт перезагрузка), столкнулись — и обновляем
      show("clash", PULL_THRESHOLD, 1);
      timer = window.setTimeout(() => onRefresh.current(), reducedMotion() ? 150 : CLASH_MS);
    };

    const onStart = (e: TouchEvent) => {
      tracking = false;
      if (busy || e.touches.length !== 1 || window.scrollY > 0 || scrolledInside(e.target) || inField(e.target) || inDialog(e.target)) return;
      tracking = true;
      pulling = false;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    };

    // единственный неpassive-слушатель: только он может отменить прокрутку, пока тянем
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      if (e.touches.length !== 1) return cancel();
      const { clientX, clientY } = e.touches[0];
      const dx = clientX - x0,
        dy = clientY - y0;
      if (!pulling) {
        if (dx === 0 && dy === 0) return;
        // вверх, явно вбок или страница уже уехала — обычная прокрутка, жест больше не смотрим
        if (dy < 0 || window.scrollY > 0 || (Math.abs(dx) > dy && Math.abs(dx) >= SLOP)) {
          tracking = false;
          return;
        }
        if (Math.abs(dx) > dy) return; // пока непонятно куда — ждём следующего движения
        // вниз от самого верха — отменяем прокрутку с первого же движения: начнись системный «отскок»,
        // следующие touchmove придут уже неотменяемыми. Сцену показываем после мёртвой зоны.
        if (e.cancelable) e.preventDefault();
        if (dy < SLOP) return;
        pulling = true;
        clearTimeout(timer); // потянули снова, пока сцена уезжала, — подхватываем
        y0 = clientY - SLOP; // без скачка на мёртвую зону
      }
      if (e.cancelable) e.preventDefault();
      y = pullDistance(clientY - y0);
      show("pull", y);
    };

    const onEnd = () => {
      const was = pulling;
      tracking = pulling = false;
      if (!was) return;
      if (y >= PULL_THRESHOLD) fire();
      else springBack();
    };
    const cancel = () => {
      const was = pulling;
      tracking = pulling = false;
      if (was) springBack();
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", cancel);
      clearTimeout(timer);
      hide();
    };
  }, [enabled]);
}
