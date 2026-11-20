/**
 * Витрина иллюстраций к словам — только для разработки: vite dev отдаёт /art.html (в сборку не входит).
 * Каждая сцена во всех местах, где она живёт: карточка нового слова на телефоне (кадр 4:3) и на десктопе (квадрат),
 * строка списка (56 px), неподвижная картинка. Переключатели — день/ночь, оформление, движение.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DECK } from "./data";
import { SCENES } from "./core/word-art";
import { hasWordArt, WordArt } from "./lib/WordArt";
import "./styles.css";
import "./glass.css";

type Look = "classic" | "ice" | "match";

function Gallery() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [look, setLook] = useState<Look>("ice");
  const [moving, setMoving] = useState(true);
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = theme;
    if (look === "classic") delete r.dataset.glass;
    else r.dataset.glass = "ice";
    if (look === "match") r.dataset.players = "on";
    else delete r.dataset.players;
  }, [theme, look]);

  const words = Object.keys(SCENES).filter(hasWordArt).map((id) => DECK.byId[id]);
  const seg = <T extends string>(val: T, set: (v: T) => void, opts: [T, string][]) => (
    <div className="seg">{opts.map(([v, l]) => <button key={v} aria-pressed={val === v} onClick={() => set(v)}>{l}</button>)}</div>
  );
  return (
    <div className="wrap" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* карточка «как на телефоне» при любой ширине окна */}
      <style>{`.g-phone .intro{display:block!important}.g-phone .wart{--wart-ar:4/3!important;margin:0 0 16px!important;border-radius:24px!important}`}</style>
      <h1>Сцены к словам</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {seg(theme, setTheme, [["light", "День"], ["dark", "Ночь"]])}
        {seg(look, setLook, [["classic", "Классика"], ["ice", "Лёд"], ["match", "Матч"]])}
        {seg(moving ? "on" : "off", (v) => setMoving(v === "on"), [["on", "Движение"], ["off", "Кадр"]])}
      </div>
      {words.map((w) => (
        <section key={w.id} style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start", marginTop: 12 }}>
          <div className="card g-phone" style={{ width: 343 }}>
            <div className="intro">
              <WordArt wordId={w.id} label={w.example} animated={moving} />
              <div className="word"><h2>{w.en}</h2></div>
              <div className="ru">{w.ru}</div>
              <div className="mute sm" style={{ marginTop: 8 }}><b>{w.example}</b><br />{w.exampleRu}</div>
            </div>
          </div>
          <div style={{ width: 380 }}><WordArt wordId={w.id} animated={moving} /></div>
          <div style={{ display: "grid", gap: 16 }}>
            <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", padding: 10 }}>
              <WordArt wordId={w.id} size="list" />
              <div><b>{w.en}</b><div className="mute sm">{w.ru}</div></div>
            </div>
            <div style={{ width: 240 }}><WordArt wordId={w.id} size="still" /></div>
          </div>
        </section>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Gallery />);
