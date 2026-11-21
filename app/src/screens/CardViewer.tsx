import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LessonCard } from "../core/cards";
import { SEASON } from "../core/cards";
import type { Deck } from "../core/types";
import { Back, Close, Flip } from "../lib/icons";
import { useModal } from "../ui";
import { CardBack, CardFront, cardNo, ruDay } from "./cards";

/**
 * Карточка во весь экран поверх коллекции (или пути): лицо и оборот, «Перевернуть» — 3D-поворот
 * (при «уменьшить движение» — без поворота). Листать — стрелками, свайпом или клавишами ← →; Esc — закрыть.
 * На обороте — слова урока, нажатие — озвучка.
 */
type Props = {
  /** карточки, которые можно листать (полученные) */
  cards: LessonCard[];
  /** номер открытой карточки */
  no: number;
  deck: Deck;
  onClose: () => void;
  /** открыть другую карточку (листание) */
  onOpen: (no: number) => void;
};

/** Нет полученных карточек — нечего показывать (и страницу не блокируем). */
export function CardViewer(p: Props) {
  return p.cards.length ? <Viewer {...p} /> : null;
}

function Viewer({ cards, no, deck, onClose, onOpen }: Props) {
  // открытой карточки нет среди полученных (например, ссылка из истории) — первая
  const i = Math.max(0, cards.findIndex((c) => c.no === no));
  const card = cards[i];
  const [back, setBack] = useState(false);
  const prev = i > 0 ? cards[i - 1] : null;
  const next = i < cards.length - 1 ? cards[i + 1] : null;
  const closeRef = useRef<HTMLButtonElement>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  useModal(wrapRef, closeRef);

  // новая карточка — с лица
  useEffect(() => setBack(false), [no]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && prev) onOpen(prev.no);
      else if (e.key === "ArrowRight" && next) onOpen(next.no);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onClose, onOpen]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  if (!card) return null;

  return createPortal(
    <div ref={wrapRef} className="cmodal-wrap" role="dialog" aria-modal="true" aria-label={`Карточка ${cardNo(card.pos)}: ${card.name}`}>
      <div className="scrim" onClick={onClose} />
      <div
        className="cmodal"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x,
            dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          if (dx < 0 && next) onOpen(next.no);
          if (dx > 0 && prev) onOpen(prev.no);
        }}
      >
        <div className="cm-bar">
          <button ref={closeRef} className="glassbtn" aria-label="Закрыть" onClick={onClose}><Close /></button>
          <span>{cardNo(card.pos)} из {SEASON}</span>
          <i className="cm-sp" />
        </div>
        <div className={`cm-card${back ? " is-back" : ""}`}>
          <div className="cm-flipper">
            <div className="cm-face front" aria-hidden={back}><CardFront card={card} /></div>
            <div className="cm-face rear" aria-hidden={!back} inert={!back}><CardBack card={card} deck={deck} /></div>
          </div>
        </div>
        <p className="cm-cap">{back ? `Слова урока ${card.lesson} — нажми, чтобы услышать` : `Получена ${ruDay(card.got)} · за урок ${card.lesson}`}</p>
        <div className="cm-nav">
          <button className="glassbtn" aria-label="Предыдущая карточка" disabled={!prev} onClick={() => prev && onOpen(prev.no)}><Back /></button>
          <button className="btn cm-flip" onClick={() => setBack(!back)}><Flip aria-hidden="true" />{back ? "Лицевая сторона" : "Перевернуть"}</button>
          <button className="glassbtn r" aria-label="Следующая карточка" disabled={!next} onClick={() => next && onOpen(next.no)}><Back /></button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
