import { useLayoutEffect } from "react";

/**
 * Видимая часть экрана для занятия (телефон, установленное приложение).
 * На iOS клавиатура не уменьшает страницу: она ложится поверх, видимая область (visualViewport) становится ниже,
 * и Safari прокручивает всю страницу, чтобы показать поле. Поэтому на время занятия экран занятия — «коробка»
 * высотой ровно с видимую область (styles.css → «занятие: экран без прокрутки страницы»), а сюда пишем её размер:
 *   --vvh     — высота видимой области, px;
 *   --vv-top  — на сколько система всё же сдвинула видимую область вниз по странице, px (коробка едет за ней);
 *   .vv-kb    — открыта экранная клавиатура (на <html>): панель «Проверить» без отступа под «домашнюю» полоску;
 *   .vv-short — видимая область низкая (клавиатура или телефон боком): задание сжимается, чтобы поле влезло.
 */

/** Клавиатура открыта, если видимая область ниже страницы больше чем на столько, px (панель адреса и т. п. — меньше). */
export const KB_MIN = 120;
/** Ниже этого задание на экране сжимается (картинка-подсказка прячется, заголовки мельче), px. */
export const SHORT_MAX = 560;

export interface ViewportInfo {
  /** высота видимой области, px */
  h: number;
  /** сдвиг видимой области от верха страницы, px */
  top: number;
  kb: boolean;
  short: boolean;
}

/**
 * Что знаем о видимой области. layoutH — высота страницы (layout viewport), vv — window.visualViewport.
 * При увеличении щипком (scale > 1) видимая область — это не клавиатура: считаем экран целым.
 */
export const viewportInfo = (layoutH: number, vv: { height: number; offsetTop: number; scale: number } | null): ViewportInfo => {
  if (!vv || vv.scale > 1.01) return { h: layoutH, top: 0, kb: false, short: layoutH < SHORT_MAX };
  const h = Math.round(vv.height);
  return { h, top: Math.max(0, Math.round(vv.offsetTop)), kb: layoutH - h > KB_MIN, short: h < SHORT_MAX };
};

/** Пока смонтирован экран занятия — следим за видимой областью и пишем её в переменные на <html>. */
export const useLessonViewport = () => {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const apply = () => {
      const v = viewportInfo(Math.max(root.clientHeight, window.innerHeight), vv);
      root.style.setProperty("--vvh", `${v.h}px`);
      root.style.setProperty("--vv-top", `${v.top}px`);
      root.classList.toggle("vv-kb", v.kb);
      root.classList.toggle("vv-short", v.short);
      // Safari прокрутил страницу к полю, хотя оно и так видно над клавиатурой, — возвращаем
      if (v.kb && window.scrollY !== 0) window.scrollTo(0, 0);
    };
    apply();
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vv-top");
      root.classList.remove("vv-kb", "vv-short");
    };
  }, []);
};
