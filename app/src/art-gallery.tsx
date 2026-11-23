/**
 * Витрина иллюстраций к словам — только для разработки: vite dev отдаёт /art.html (в сборку не входит).
 * Каждая сцена во всех местах, где она живёт: карточка нового слова на телефоне (кадр 4:3) и на десктопе (квадрат),
 * строка списка (56 px), неподвижная картинка. Переключатели — день/ночь, оформление, движение.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { DECK } from "./data";
import { longestRun } from "./core/text";
import { SCENES } from "./core/word-art";
import { hasWordArt, WordArt } from "./lib/WordArt";
import { say } from "./lib/speech";
import approved from "./core/word-art-04.sources.json";
import "./styles.css";
import "./glass.css";

type Look = "classic" | "ice" | "match";

function Practice() {
  const words = Object.keys(approved).map((id) => DECK.byId[id]);
  const [index, setIndex] = useState(() => Math.max(0, words.findIndex((w) => w.id === new URLSearchParams(location.search).get("word"))));
  const [dark, setDark] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [typing, setTyping] = useState(false);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [moving, setMoving] = useState(true);
  const w = words[index];
  const animationReady = Object.keys(SCENES[w.id].motion).length > 0;
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; document.documentElement.dataset.glass = "ice"; }, [dark]);
  const move = (step: number) => {
    const next = Math.max(0, Math.min(words.length - 1, index + step));
    setIndex(next);
    const url = new URL(location.href);
    url.searchParams.set("word", words[next].id);
    history.replaceState(null, "", url);
    setReveal(false); setAnswer(""); setChecked(false);
  };
  const correct = answer.trim().toLowerCase() === w.blank.toLowerCase();
  return <main className="wrap" style={{ maxWidth: 520, margin: "0 auto" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><p>{index + 1} / {words.length}</p><button onClick={() => setDark(!dark)}>{dark ? "День" : "Ночь"}</button></div>
    <div className="seg"><button aria-pressed={!typing} onClick={() => { setTyping(false); setChecked(false); }}>Знакомство</button><button aria-pressed={typing} onClick={() => { setTyping(true); setReveal(false); setAnswer(""); setChecked(false); }}>Впиши</button></div>
    <p className="mute sm">Анимация готова: {words.filter((word) => Object.keys(SCENES[word.id].motion).length > 0).length} / {words.length}</p>
    <select aria-label="Выбрать слово" className="practice-input" value={index} onChange={(e) => move(Number(e.target.value) - index)}>{words.map((word, i) => <option key={word.id} value={i}>{word.en}{Object.keys(SCENES[word.id].motion).length ? " · анимация" : ""}</option>)}</select>
    <article className="card g-phone" style={{ marginTop: 16 }}>
      <style>{`.g-phone .wart{--wart-ar:4/3;margin-bottom:16px;border-radius:20px}.practice-input{width:100%;box-sizing:border-box;padding:14px;font:inherit;border:2px solid #8097b5;border-radius:12px;background:transparent;color:inherit}`}</style>
      <WordArt wordId={w.id} animated={moving} label={typing ? "Иллюстрация к предложению" : w.example} />
      {animationReady ? <button onClick={() => setMoving(!moving)} aria-pressed={moving}>{moving ? "Остановить картинку" : "Оживить картинку"}</button> : <p className="mute sm">Отдельные анимационные слои ещё готовятся.</p>}
      {!typing && <><h1>{w.en}</h1><p className="mute">{w.ipa}</p></>}
      <p style={{ fontSize: 21, lineHeight: 1.5 }}>{typing ? w.example.replace(w.blank, "______") : w.example}</p>
      {typing ? <form onSubmit={(e) => { e.preventDefault(); setChecked(true); }}><input className="practice-input" aria-label="Пропущенное слово" autoComplete="off" autoCapitalize="none" value={answer} onChange={(e) => { setAnswer(e.target.value); setChecked(false); }} /><button style={{ marginTop: 12 }} type="submit">Проверить</button>{checked && <p role="status">{correct ? "Верно!" : `Правильный ответ: ${w.blank}`}</p>}</form> : <button onClick={() => say(w.example)}>▶ Послушать пример</button>}
      <p><button onClick={() => setReveal(!reveal)}>{reveal ? "Скрыть перевод" : "Показать перевод"}</button></p>
      {reveal && <div><p className="ru">{w.ru}</p><p>{w.exampleRu}</p></div>}
    </article>
    <nav style={{ display: "flex", justifyContent: "space-between", marginTop: 16, gap: 12 }}><button disabled={index === 0} onClick={() => move(-1)}>← Назад</button><button disabled={index === words.length - 1} onClick={() => move(1)}>Дальше →</button></nav>
    <p className="mute sm">Просмотр без сохранения учебного прогресса.</p>
  </main>;
}

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

  // ?ids=a,b — только эти сцены (вся витрина тяжёлая)
  const only = new URLSearchParams(location.search).get("ids")?.split(",");
  const words = (only ?? Object.keys(SCENES)).filter(hasWordArt).map((id) => DECK.byId[id]);
  const seg = <T extends string>(val: T, set: (v: T) => void, opts: [T, string][]) => (
    <div className="seg">{opts.map(([v, l]) => <button key={v} aria-pressed={val === v} onClick={() => set(v)}>{l}</button>)}</div>
  );
  return (
    <div className="wrap" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* карточка «как на телефоне» при любой ширине окна */}
      <style>{`.g-phone .intro{display:block!important}.g-phone .intro .wart{--wart-ar:4/3;margin:0 0 16px!important;border-radius:24px!important}`}</style>
      <h1>Сцены к словам</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {seg(theme, setTheme, [["light", "День"], ["dark", "Ночь"]])}
        {seg(look, setLook, [["classic", "Классика"], ["ice", "Лёд"], ["match", "Матч"]])}
        {seg(moving ? "on" : "off", (v) => setMoving(v === "on"), [["on", "Движение"], ["off", "Кадр"]])}
      </div>
      {words.map((w) => (
        <section key={w.id} style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start", marginTop: 12 }}>
          <div className="card g-phone" style={{ width: 343, maxWidth: "100%" }}>
            <div className="intro">
              <WordArt wordId={w.id} label={w.example} animated={moving} />
              <div className="word"><h2 style={{ "--lw": longestRun(w.en) } as CSSProperties}>{w.en}</h2></div>
              <div className="ru">{w.ru}</div>
              <div className="mute sm" style={{ marginTop: 8 }}><b>{w.example}</b><br />{w.exampleRu}</div>
            </div>
          </div>
          <div style={{ width: 380, maxWidth: "100%" }}><WordArt wordId={w.id} animated={moving} /></div>
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

createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("practice") ? <Practice /> : <Gallery />);
