import type { View } from "../App";
import { STREAK_GOALS } from "../core/achievements";
import { addDays } from "../core/dates";
import { activeDay, bestStreak, streak } from "../core/srs";
import { plural } from "../core/text";
import type { AppState } from "../core/types";
import { Flame, Right } from "../lib/icons";
import { Sheet } from "../ui";

/**
 * Что значит 🔥 в шапке: панель по нажатию на значок серии (главная и «Путь»).
 * Серия сейчас, что будет сегодня, последние 7 дней, рекорд и ближайшее достижение серии.
 */

const dayLabel = (k: string, o: Intl.DateTimeFormatOptions) => new Date(k + "T12:00:00").toLocaleDateString("ru-RU", o);

/** Что сказать о сегодняшнем дне. */
export const streakNote = (sk: number, todayOn: boolean, best: number): string => {
  if (todayOn) return `Сегодня урок есть — серия продолжается. Завтра станет ${sk + 1}.`;
  if (sk > 0) return `Сегодня урока ещё не было. Пройди часть 1 до полуночи — серия станет ${sk + 1}. Пропустишь день — начнётся заново.`;
  if (best > 0) return "Серия прервалась. Пройди часть 1 урока сегодня — начнётся новая.";
  return "Серии пока нет. Пройди часть 1 урока сегодня — это первый день. Каждый следующий день с уроком добавляет +1.";
};

export function StreakSheet({ days, today, go, onClose }: { days: AppState["days"]; today: string; go: (v: View) => void; onClose: () => void }) {
  const sk = streak(days, today);
  const best = Math.max(bestStreak(days), sk);
  const todayOn = activeDay(days, today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const goal = STREAK_GOALS.find((g) => g > sk);

  return (
    <Sheet title="Серия дней" onClose={onClose} className="sk-sheet">
      <div className={`sk-hero${sk ? "" : " zero"}`}>
        <Flame aria-hidden="true" />
        <b>{sk}</b>
        <span>{plural(sk, "день", "дня", "дней")} подряд</span>
      </div>
      <p className="sk-note">{streakNote(sk, todayOn, best)}</p>
      <ol className="sk-week" aria-label="Последние 7 дней">
        {week.map((k) => {
          const on = activeDay(days, k);
          const isToday = k === today;
          return (
            <li key={k} className={`${on ? "on" : ""}${isToday ? " today" : ""}`} aria-label={`${isToday ? "сегодня" : dayLabel(k, { weekday: "long", day: "numeric", month: "long" })} — ${on ? "был урок" : "без урока"}`}>
              <i aria-hidden="true">{on ? <Flame /> : null}</i>
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
      <p className="mute sk-rule">День засчитывается, когда пройдена часть 1 или часть 2 урока.</p>
      <button className="sk-more" onClick={() => go({ name: "me" })}>Достижения серии <Right aria-hidden="true" /></button>
    </Sheet>
  );
}
