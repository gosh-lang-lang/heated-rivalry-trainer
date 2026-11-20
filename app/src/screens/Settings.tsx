import { Fragment, useState } from "react";
import type { SetState } from "../App";
import { todayKey } from "../core/dates";
import { exportState, NEW_PER_DAY_OPTIONS, parseState } from "../core/state";
import type { AppState } from "../core/types";
import { ACCENT_LABEL, VOICE_SAMPLE, voiceMeta, type TtsVoice } from "../core/tts";
import { Back, Check, Chevron, Play } from "../lib/icons";
import { say, setVoice, useVoices } from "../lib/speech";

/** Настройки: новые слова за утро, голос озвучки, перенос данных. На телефоне — вкладка «Настройки», на десктопе — пункт верхнего меню. */
export function Settings({ state, setState, onBack }: { state: AppState; setState: SetState; onBack: () => void }) {
  return (
    <>
      <div className="pagehead">
        <button className="x" aria-label="Назад" onClick={onBack}><Back /></button>
        <h1>Настройки</h1>
      </div>
      <div className="wrap settings-page">
        <div className="set-col">
          <div className="sgroup">Занятия</div>
          <NewPerDay state={state} setState={setState} />
          <div className="sgroup">Озвучка</div>
          <VoicePicker />
        </div>
        <div className="set-col">
          <div className="sgroup">Данные</div>
          <DataTransfer state={state} setState={setState} />
        </div>
      </div>
    </>
  );
}

export function NewPerDay({ state, setState }: { state: AppState; setState: SetState }) {
  return (
    <section className="card">
      <h3>Новых слов за утро</h3>
      <div className="seg">
        {NEW_PER_DAY_OPTIONS.map((n) => (
          <button key={n} aria-pressed={state.settings.newPerDay === n} onClick={() => setState({ ...state, settings: { ...state.settings, newPerDay: n } })}>{n}</button>
        ))}
      </div>
      <p className="mute sm" style={{ margin: "10px 0 0" }}>Новую партию слов из книги присылай в чат фотографией — я добавлю её сюда.</p>
    </section>
  );
}

export function VoicePicker() {
  const { voices, current, server, fallback, playing } = useVoices();
  const [open, setOpen] = useState(false);
  const cur = voices.find((v) => v.id === current) ?? voices[0];

  const avatar = (v: TtsVoice, on = false) => (
    <span className={`vav ${v.accent}${on ? " sel" : ""}`} aria-hidden="true">{on ? <Check /> : v.name[0]}</span>
  );
  const text = (v: TtsVoice, inGroup = false) => (
    <span className="vtx">
      <span className="vname"><b>{v.name}</b>{v.best && <span className="vbadge">лучший</span>}</span>
      <small>{[inGroup ? (v.gender === "f" ? "женский" : "мужской") : voiceMeta(v), v.note].filter(Boolean).join(" · ")}</small>
    </span>
  );

  return (
    <section className="card">
      <h3>Голос</h3>
      <button className="vsel" aria-expanded={open} aria-controls="vlist" onClick={() => setOpen(!open)}>
        {avatar(cur)}
        {text(cur)}
        <Chevron className="chev" />
      </button>

      {open && (
        <div className="vlist" id="vlist" role="radiogroup" aria-label="Голос озвучки">
          {(["us", "gb"] as const).map((acc) => (
            <Fragment key={acc}>
              <div className="vgroup">{acc === "us" ? "🇺🇸" : "🇬🇧"} {ACCENT_LABEL[acc]}</div>
              {voices
                .filter((v) => v.accent === acc)
                .map((v) => {
                  const on = v.id === current;
                  const p = playing?.voice === v.id ? playing : null;
                  return (
                    <div className="vrow" data-on={on} key={v.id}>
                      <button
                        className="vpick"
                        role="radio"
                        aria-checked={on}
                        onClick={() => {
                          setVoice(v.id);
                          say(VOICE_SAMPLE, v.id);
                          setOpen(false);
                        }}
                      >
                        {avatar(v, on)}
                        {text(v, true)}
                      </button>
                      <button className={`vplay${p ? " on" : ""}`} aria-label={`Послушать ${v.name}`} onClick={() => say(VOICE_SAMPLE, v.id)}>
                        {p?.loading ? <span className="spin" /> : p ? <span className="eq"><i /><i /><i /></span> : <Play />}
                      </button>
                    </div>
                  );
                })}
            </Fragment>
          ))}
        </div>
      )}

      <p className="mute sm" style={{ margin: "12px 0 0" }}>
        {server === "down"
          ? `Сервер озвучки недоступен — сейчас звучит системный голос${fallback ? ` (${fallback})` : ""}.`
          : open
            ? "▶ — послушать, не меняя голос. Нажми на голос, чтобы выбрать."
            : "Нейросетевой голос Kokoro, озвучка на сервере."}
      </p>
    </section>
  );
}

export function DataTransfer({ state, setState }: { state: AppState; setState: SetState }) {
  const [mode, setMode] = useState<"" | "export" | "import" | "done">("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const json = mode === "export" ? exportState(state) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setMsg("Скопировано.");
    } catch {
      setMsg("Не получилось скопировать — выдели текст в поле и скопируй вручную.");
    }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = `heated-rivalry-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const doImport = (raw: string) => {
    try {
      setState(parseState(raw));
      setMode("done");
      setMsg("");
    } catch (err) {
      setMsg("Не получилось: " + (err instanceof Error ? err.message : "неверный JSON"));
    }
  };

  return (
    <section className="card xio">
      <h3>Перенос данных</h3>
      <p className="mute sm" style={{ margin: "4px 0 12px" }}>Весь прогресс одним JSON. Сюда же загружается экспорт из прототипа.</p>
      <div className="row2">
        <button className="btn ghost" aria-pressed={mode === "export"} onClick={() => { setMode("export"); setMsg(""); }}>Экспорт</button>
        <button className="btn ghost" aria-pressed={mode === "import"} onClick={() => { setMode("import"); setMsg(""); setText(""); }}>Импорт</button>
      </div>
      {mode === "export" && (
        <>
          <textarea className="inp" readOnly value={json} onFocus={(e) => e.currentTarget.select()} />
          <div className="row2" style={{ marginTop: 10 }}>
            <button className="btn" onClick={copy}>Скопировать</button>
            <button className="btn ghost" onClick={download}>Скачать файл</button>
          </div>
        </>
      )}
      {mode === "import" && (
        <>
          <textarea className="inp" placeholder="Вставь сюда JSON из экспорта" value={text} onChange={(e) => setText(e.target.value)} />
          <label className="btn ghost wide" style={{ marginTop: 10, display: "grid", placeItems: "center" }}>
            Выбрать файл…
            <input type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
          </label>
          <button className="btn bad wide" style={{ marginTop: 10 }} disabled={!text.trim()} onClick={() => doImport(text)}>Заменить мой прогресс</button>
          <p className="mute sm" style={{ margin: "8px 0 0" }}>Текущий прогресс на этом устройстве будет заменён.</p>
        </>
      )}
      {mode === "done" && <p className="done-tag" style={{ margin: "10px 0 0" }}><Check /> Прогресс загружен</p>}
      {msg && <p className="mute sm" style={{ margin: "8px 0 0" }}>{msg}</p>}
    </section>
  );
}
