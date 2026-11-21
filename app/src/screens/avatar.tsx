import { useId } from "react";
import { avatarId, CARD_AVATARS, cleanNumber, KIT_NAME, KITS, parseAvatar, PLAYERS, unlockedArts, type Avatar as AvatarT, type Kit } from "../core/avatar";
import type { LessonCard } from "../core/cards";
import { jerseySvg, playerSvg } from "../lib/avatars";
import { Lock } from "../lib/icons";
import { useSettings } from "../lib/settings";
import { Sheet } from "../ui";
import { CardArt, cardNo } from "./cards";

/**
 * Аватарка в «Я»: буква имени, хоккеист, свитер с номером или сюжет полученной карточки (core/avatar.ts).
 * Выбор — панель снизу по нажатию на аватарку; сохраняется сразу, в общих настройках (как тема и голос).
 * Номер на свитере — своя настройка (avatarNum): переключение на игрока его не стирает.
 */

const initial = (name: string) => (name.trim()[0] ?? "Я").toUpperCase();

/** Картинка аватарки (кружок .ava); размер — классом (lg — в панели выбора, opt — в сетке вариантов). */
export function AvatarPic({ value, name, className = "" }: { value: string | AvatarT; name: string; className?: string }) {
  const a = typeof value === "string" ? parseAvatar(value) : value;
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (a.kind === "letter") return <span className={`ava ${className}`} aria-hidden="true">{initial(name)}</span>;
  if (a.kind === "card") {
    const c = CARD_AVATARS.find((x) => x.art === a.art)!;
    return <span className={`ava has-art ${className}`} aria-hidden="true"><CardArt art={a.art} season={1} pos={c.pos} /></span>;
  }
  const svg = a.kind === "player" ? playerSvg(a.kit, u) : jerseySvg(a.kit, a.num || initial(name), u);
  return (
    <span className={`ava has-art ${className}`} aria-hidden="true">
      <svg viewBox={a.kind === "player" ? "13 13 74 74" : "0 0 100 100"} focusable="false" dangerouslySetInnerHTML={{ __html: svg }} />
    </span>
  );
}

/** Подпись выбранной аватарки — для кнопки и превью. */
export const avatarName = (a: AvatarT): string =>
  a.kind === "letter"
    ? "буква имени"
    : a.kind === "player"
      ? PLAYERS.find((p) => p.kit === a.kit)!.name
      : a.kind === "jersey"
        ? `свитер, ${KIT_NAME[a.kit].toLowerCase()}${a.num ? `, № ${a.num}` : ""}`
        : CARD_AVATARS.find((c) => c.art === a.art)!.name;

function Opt({ value, name, label, cap, sel, locked = false, onPick }: { value: AvatarT; name: string; label: string; cap: string; sel: boolean; locked?: boolean; onPick: () => void }) {
  return (
    <li>
      <button className={`av-opt${locked ? " locked" : ""}`} aria-pressed={sel} aria-label={label} disabled={locked} onClick={onPick}>
        <span className="av-ring">
          <AvatarPic value={value} name={name} className="opt" />
          {locked && <i className="av-lock" aria-hidden="true"><Lock /></i>}
        </span>
        <small aria-hidden="true">{cap}</small>
      </button>
    </li>
  );
}

/** Панель выбора аватарки. cards — все полученные карточки (открывают сюжеты коллекции). */
export function AvatarSheet({ name, cards, onClose }: { name: string; cards: LessonCard[]; onClose: () => void }) {
  const { settings, set } = useSettings();
  const cur = parseAvatar(settings.avatar);
  const id = avatarId(cur);
  const num = settings.avatarNum; // набранный номер — отдельно от выбора: игрок или буква его не стирают
  const open = unlockedArts(cards);
  const pick = (a: AvatarT) => set("avatar", avatarId(a));
  const L = initial(name);

  return (
    <Sheet title="Аватарка" onClose={onClose} className="av-sheet">
      <div className="av-now">
        <AvatarPic value={cur} name={name} className="lg" />
        <div>
          <b>{name}</b>
          <span className="mute">Сейчас: {avatarName(cur)}</span>
        </div>
      </div>

      <h3 className="av-h">Игроки</h3>
      <ul className="av-grid" aria-label="Игроки">
        <Opt value={{ kind: "letter" }} name={name} label={`Буква ${L}`} cap="Буква" sel={id === ""} onPick={() => pick({ kind: "letter" })} />
        {PLAYERS.map((p) => {
          const a: AvatarT = { kind: "player", kit: p.kit };
          return <Opt key={p.kit} value={a} name={name} label={p.name} cap={p.name.split(" ")[0]} sel={id === avatarId(a)} onPick={() => pick(a)} />;
        })}
      </ul>

      <h3 className="av-h">Свитер</h3>
      <ul className="av-grid" aria-label="Свитер">
        {KITS.map((k: Kit) => {
          const a: AvatarT = { kind: "jersey", kit: k, num };
          return <Opt key={k} value={a} name={name} label={`Свитер: ${KIT_NAME[k].toLowerCase()}`} cap={KIT_NAME[k]} sel={cur.kind === "jersey" && cur.kit === k} onPick={() => pick(a)} />;
        })}
      </ul>
      <label className="av-num">
        <span>Номер на свитере<small className="mute">пусто — буква {L}</small></span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          placeholder={L}
          value={num}
          onChange={(e) => {
            const n = cleanNumber(e.target.value);
            set("avatarNum", n);
            if (cur.kind === "jersey") pick({ ...cur, num: n });
          }}
        />
      </label>

      <h3 className="av-h">Из коллекции</h3>
      <ul className="av-grid" aria-label="Из коллекции">
        {CARD_AVATARS.map((c) => {
          const a: AvatarT = { kind: "card", art: c.art };
          const locked = !open.has(c.art);
          return (
            <Opt
              key={c.art}
              value={a}
              name={name}
              label={locked ? `${c.name} — откроется с карточкой ${cardNo(c.pos)}` : c.name}
              cap={locked ? cardNo(c.pos) : c.name}
              sel={id === avatarId(a)}
              locked={locked}
              onPick={() => pick(a)}
            />
          );
        })}
      </ul>
      <p className="mute av-foot">Сюжеты коллекции открываются, когда получаешь их карточку за урок.</p>
      <button className="btn wide" onClick={onClose}>Готово</button>
    </Sheet>
  );
}
