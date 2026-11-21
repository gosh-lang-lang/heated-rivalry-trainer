import { useEffect, useState } from "react";
import type { View } from "../App";
import { STREAK_GOALS } from "../core/achievements";
import { addDays } from "../core/dates";
import { bestStreak, dayParts, streak } from "../core/srs";
import { plural } from "../core/text";
import type { AppState } from "../core/types";
import { Right, StreakFlame } from "../lib/icons";
import { Sheet } from "../ui";

/**
 * Что значит 🔥 в шапке: панель по нажатию на значок серии (главная и «Путь»).
 * Серия сейчас, что будет сегодня, последние 7 дней, рекорд и ближайшее достижение серии.
 * Огонь — сосуд: пустой (урока нет), налит до середины (часть 1 — день засчитан), горит целиком (обе части).
 */

const dayLabel = (k: string, o: Intl.DateTimeFormatOptions) => new Date(k + "T12:00:00").toLocaleDateString("ru-RU", o);

/** Что сказать о сегодняшнем дне; parts — сколько частей урока пройдено сегодня. */
const streakNote = (sk: number, parts: 0 | 1 | 2, best: number): string => {
  if (parts === 2) return `Урок закрыт — обе части пройдены. Завтра серия станет ${sk + 1}.`;
  if (parts === 1) return `Одна часть есть — день засчитан, серия ${sk}. Пройди вторую — урок закроется, и огонь загорится целиком.`;
  if (sk > 0) return `Сегодня урока ещё не было. Пройди часть 1 до полуночи — серия станет ${sk + 1}. Пропустишь день — начнётся заново.`;
  if (best > 0) return "Серия прервалась. Пройди часть 1 урока сегодня — начнётся новая.";
  return "Серии пока нет. Пройди часть 1 урока сегодня — это первый день. Каждый следующий день с уроком добавляет +1.";
};

const PARTS_LABEL = ["без урока", "одна часть урока", "урок закрыт"] as const;

/** Подпись значка серии для экранного диктора. */
export const streakLabel = (sk: number, parts: 0 | 1 | 2): string =>
  `${sk} ${plural(sk, "день", "дня", "дней")} подряд — подробнее о серии${parts === 1 ? ". Сегодня пройдена одна часть из двух" : parts === 2 ? ". Сегодня урок закрыт" : ""}`;

/**
 * Огонь закрытого урока «зажигается» (волна доливается, вспышка) один раз в день — при первом показе после
 * того, как пройдена вторая часть. Запоминаем день в localStorage; без хранилища — просто без анимации.
 */
const LIT_KEY = "hr2_flameLit";
export function useIgnite(parts: 0 | 1 | 2, today: string): boolean {
  // эффект, а не начальное значение: прогресс приходит с сервера после первой отрисовки (часть 2 с другого устройства)
  const [ignite, setIgnite] = useState(false);
  useEffect(() => {
    if (parts !== 2) return;
    try {
      if (localStorage.getItem(LIT_KEY) === today) return;
      localStorage.setItem(LIT_KEY, today);
      setIgnite(true);
    } catch {
      /* без хранилища — без анимации */
    }
  }, [parts, today]);
  return ignite;
}

export function StreakSheet({ days, today, go, onClose, part2 }: { days: AppState["days"]; today: string; go: (v: View) => void; onClose: () => void; part2?: View | null }) {
  const sk = streak(days, today);
  const best = Math.max(bestStreak(days), sk);
  const parts = dayParts(days, today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const goal = STREAK_GOALS.find((g) => g > sk);

  return (
    <Sheet title="Серия дней" onClose={onClose} className="sk-sheet">
      <div className={`sk-hero${sk ? "" : " zero"}`}>
        <StreakFlame level={parts} aria-hidden="true" />
        <b>{sk}</b>
        <span>{plural(sk, "день", "дня", "дней")} подряд</span>
      </div>
      <p className="sk-note">{streakNote(sk, parts, best)}</p>
      {parts === 1 && part2 && (
        <button className="btn wide sk-go" onClick={() => go(part2)}>
          Начать часть 2 — применяем
        </button>
      )}
      <ol className="sk-week" aria-label="Последние 7 дней">
        {week.map((k) => {
          const p = dayParts(days, k);
          const isToday = k === today;
          return (
            <li key={k} className={`${p ? "on" : ""}${isToday ? " today" : ""}`} aria-label={`${isToday ? "сегодня" : dayLabel(k, { weekday: "long", day: "numeric", month: "long" })} — ${PARTS_LABEL[p]}`}>
              <i aria-hidden="true">{p ? <StreakFlame level={p} /> : null}</i>
              <span aria-hidden="true">{dayLabel(k, { weekday: "short" })}</span>
            </li>
          );
        })}
      </ol>
      <div className="sk-stats">
        <div><b>{best}</b><span>{plural(best, "день", "дня", "дней")} — рекорд</span></div>
        {goal ? (
          <div><b>{goal - sk}</b><span>до достижения «{goal} {plural(goal, "день", "дня", "дней")}»</span></div>
        ) : (
          <div><b>✓</b><span>все достижения серии получены</span></div>
        )}
      </div>
      <p className="mute sk-rule">День засчитывается после любой части урока. Обе части — урок закрыт, огонь горит целиком.</p>
      <button className="sk-more" onClick={() => go({ name: "me" })}>Достижения серии <Right aria-hidden="true" /></button>
    </Sheet>
  );
}
