import type { CSSProperties } from "react";
import { SKATER_RED } from "../lib/skaters";

/**
 * Игрок на «Пути» — едет у текущего урока. Сейчас — заглушка: рисунок из lib/skaters.ts (тот же, что в теме «Матч»).
 * Финальный арт заменяет только этот компонент: место, размер и разворот задаёт «Путь» (style, flip).
 */
export function PathPlayer({ style, flip = false }: { style?: CSSProperties; flip?: boolean }) {
  return <div className={`me-sk${flip ? " flip" : ""}`} style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SKATER_RED }} />;
}
