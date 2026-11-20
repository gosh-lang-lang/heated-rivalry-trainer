import { Fragment, useState } from "react";
import type { SetState } from "../App";
import { NEW_PER_DAY_OPTIONS } from "../core/state";
import type { AppState } from "../core/types";
import { ACCENT_LABEL, VOICE_SAMPLE, voiceMeta, type TtsVoice } from "../core/tts";
import { Back, Check, Chevron, Play } from "../lib/icons";
import { logout, useMe } from "../lib/auth";
import { say, useVoices } from "../lib/speech";
import { LOOKS, useLook } from "../lib/glass";
import { SKATER_BLACK, SKATER_RED } from "../lib/skaters";
import { changeSetting } from "../core/state";

/** Настройки: новые слова за урок, голос озвучки, оформление, вход. На телефоне — вкладка «Настройки», на десктопе — пункт верхнего меню. */
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
          <VoicePicker value={state.settings.voice} onPick={(id) => setState(changeSetting(state, "voice", id))} />
          <div className="sgroup">Оформление</div>
          <LookPicker />
        </div>
        <div className="set-col">
          <div className="sgroup">Вход</div>
          <Account />
        </div>
      </div>
    </>
  );
}

/** Оформление: «Классика», «Лёд» или «Матч». У каждого — мини-превью (шапка и две карточки) в текущей теме дня / ночи. */
function LookPicker() {
  const [look, setLook] = useLook();
  return (
    <section className="card">
      <h3>Тема</h3>
      <div className="looks" role="radiogroup" aria-label="Оформление">
        {LOOKS.map(([id, name, note]) => (
          <button key={id} className="look" role="radio" aria-checked={look === id} onClick={() => setLook(id)}>
            <span className={`lk-prev lk-${id}`} aria-hidden="true">
              {id === "match" && (
                <>
                  <i className="lk-sk a" dangerouslySetInnerHTML={{ __html: SKATER_RED }} />
                  <i className="lk-sk b" dangerouslySetInnerHTML={{ __html: SKATER_BLACK }} />
                </>
              )}
              <i className="lk-hero" />
              <i className="lk-c1" />
              <i className="lk-c2" />
            </span>
            <span className="lk-name"><b>{name}</b>{look === id && <Check />}</span>
            <small>{note}</small>
          </button>
        ))}
      </div>
      <p className="mute sm" style={{ margin: "12px 0 0" }}>День или ночь — тумблером в шапке главной.</p>
    </section>
  );
}

function Account() {
  const me = useMe();
  return (
    <section className="card account">
      <h3>{me ? me.user.displayName : "Аккаунт"}</h3>
      <p className="mute sm" style={{ margin: "4px 0 12px" }}>
        {me ? `Вход по passkey · привязано: ${me.passkeys}. Новое устройство с тем же Apple ID получит passkey само.` : "Вход по passkey."}
      </p>
      <button className="btn ghost wide" onClick={() => void logout()}>Выйти</button>
    </section>
  );
}

export function NewPerDay({ state, setState }: { state: AppState; setState: SetState }) {
  return (
    <section className="card">
      <h3>Новых слов за урок</h3>
      <div className="seg">
        {NEW_PER_DAY_OPTIONS.map((n) => (
          <button key={n} aria-pressed={state.settings.newPerDay === n} onClick={() => setState(changeSetting(state, "newPerDay", n))}>{n}</button>
        ))}
      </div>
      <p className="mute sm" style={{ margin: "10px 0 0" }}>Новую партию слов из книги присылай в чат фотографией — я добавлю её сюда.</p>
    </section>
  );
}

/** Выбор голоса. value — из личных настроек (общих для всех устройств), onPick — изменить их. */
export function VoicePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const { voices, server, fallback, playing } = useVoices();
  const current = value;
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
                          onPick(v.id);
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
