import { useEffect, useRef, useState, type CSSProperties } from "react";
import gen from "../core/word-art.gen.json";
import { SCENES, artUrl, boxStyle, toKeyframes, type ArtGen, type ArtSceneGen, type ArtSceneSpec } from "../core/word-art";
import "../wordart.css";

const GEN = gen as unknown as ArtGen;

/** Есть ли у слова иллюстрация. Нет — показываем без картинки (эмодзи не возвращаем). */
export const hasWordArt = (id: string) => !!GEN[id] && !!SCENES[id];

/**
 * Иллюстрация к слову — сцена по предложению-примеру.
 *  scene — слоями и в движении (карточка нового слова, страница слова); при «Уменьшить движение» — неподвижный кадр;
 *  still — сцена целиком одной картинкой, неподвижно (подсказки в заданиях);
 *  list  — кроп на главное для списка (56 px).
 * Нет сцены у слова — ничего не рисует.
 */
export function WordArt({ wordId, size = "scene", animated = true, label, className = "" }: { wordId: string; size?: "scene" | "still" | "list"; animated?: boolean; label?: string; className?: string }) {
  const g = GEN[wordId],
    spec = SCENES[wordId];
  if (!g || !spec) return null;
  if (size !== "scene")
    return <img className={`wart-img ${size} ${className}`} src={artUrl(wordId, size, g.v)} alt={label ?? ""} aria-hidden={label ? undefined : true} decoding="async" draggable={false} />;
  return <Scene key={wordId} id={wordId} g={g} spec={spec} animated={animated} label={label} className={className} />;
}

function Scene({ id, g, spec, animated, label, className }: { id: string; g: ArtSceneGen; spec: ArtSceneSpec; animated: boolean; label?: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(0);
  const ready = loaded >= g.layers.length;
  const still = useReducedMotion() || !animated;

  useEffect(() => {
    const root = ref.current;
    if (!ready || still || !root) return;
    const anims: Animation[] = [];
    for (const img of root.querySelectorAll<HTMLImageElement>("img[data-layer]")) {
      const m = spec.motion[img.dataset.layer!];
      const box = g.layers.find((l) => l.name === img.dataset.layer)?.box;
      if (m && box) anims.push(img.animate(toKeyframes(m, box).frames, { duration: spec.dur, iterations: Infinity }));
    }
    // за экраном не крутим
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => anims.forEach((a) => (e.isIntersecting ? a.play() : a.pause())));
    io?.observe(root);
    return () => {
      io?.disconnect();
      anims.forEach((a) => a.cancel());
    };
  }, [ready, still, g, spec]);

  const done = () => setLoaded((n) => n + 1);
  return (
    <div
      ref={ref}
      className={`wart${ready ? " ready" : ""}${still ? " still" : ""} ${className}`}
      style={{ "--wart-bg": g.bg, "--fy": spec.focus ?? 0.5 } as CSSProperties}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-art={id}
    >
      <div className="wart-cv">
        {g.layers.map((l) => {
          const m = spec.motion[l.name];
          return (
            <img
              key={l.name}
              data-layer={l.name}
              src={artUrl(id, l.name, g.v)}
              alt=""
              draggable={false}
              onLoad={done}
              onError={done}
              style={{ ...boxStyle(l.box), transformOrigin: m ? toKeyframes(m, l.box).origin : undefined }}
            />
          );
        })}
      </div>
    </div>
  );
}

const RM = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  const [rm, setRm] = useState(() => typeof matchMedia !== "undefined" && matchMedia(RM).matches);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const q = matchMedia(RM);
    const on = () => setRm(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return rm;
}
