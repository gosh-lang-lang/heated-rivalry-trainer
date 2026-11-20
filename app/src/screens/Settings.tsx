import { Fragment, useState, type ComponentType, type SVGProps } from "react";
import type { SetState, SettingsSection, View } from "../App";
import { NEW_PER_DAY_OPTIONS } from "../core/state";
import type { AppState, ThemePref } from "../core/types";
import { ACCENT_LABEL, VOICE_SAMPLE } from "../core/tts";
import { Back, Book, Check, Chevron, Key, Laptop, Palette, Phone, Play, Speaker, Tablet } from "../lib/icons";
import { logout, revokeDevice, revokeOtherDevices, useDevices, useMe, type Devices, type Me } from "../lib/auth";
import { seenAgo, type DeviceKind } from "../core/device";
import { plural } from "../core/text";
import { say, useVoices } from "../lib/speech";
import { LOOKS, useLook } from "../lib/glass";
import { SKATER_BLACK, SKATER_RED } from "../lib/skaters";
import { changeSetting } from "../core/state";

/** Разделы настроек — в порядке строк на корне. Цвет значка — styles.css → .s-ic.t-<id>. */
const SECTIONS: { id: SettingsSection; title: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "lessons", title: "Занятия", Icon: Book },
  { id: "voice", title: "Озвучка", Icon: Speaker },
  { id: "look", title: "Оформление", Icon: Palette },
  { id: "account", title: "Вход и устройства", Icon: Key },
];
const THEME_LABEL: Record<ThemePref, string> = { system: "как в системе", light: "день", dark: "ночь" };

/**
 * Настройки, как в iOS: корень — сгруппированный список разделов (значок, название, текущее значение, ›),
 * раздел — своя страница внутри настроек с кнопкой «‹ Настройки». Открытый раздел — в состоянии вида (View.section)
 * и в истории браузера (App.go): жест «назад» в Safari и кнопка «назад» браузера возвращают к списку, а не из настроек.
 * На десктопе — список слева, выбранный раздел справа (по умолчанию первый); в историю не пишется.
 * На телефоне — вкладка «Настройки», на десктопе — пункт верхнего меню.
 */
export function Settings({
  state,
  setState,
  section,
  wide,
  go,
  onBack,
}: {
  state: AppState;
  setState: SetState;
  section?: SettingsSection;
  wide: boolean;
  go: (v: View) => void;
  onBack: () => void;
}) {
  // один запрос на весь экран: список устройств нужен и строке на корне, и разделу «Вход и устройства»
  const me = useMe();
  const devices = useDevices();
  const { voices } = useVoices();
  const open = section ?? (wide ? SECTIONS[0].id : undefined);

  const { newPerDay, voice, look, theme } = state.settings;
  const count = devices.data?.sessions.length ?? 0;
  const value: Record<SettingsSection, string> = {
    lessons: `${newPerDay} ${plural(newPerDay, "новое слово", "новых слова", "новых слов")} за урок`,
    voice: (voices.find((v) => v.id === voice) ?? voices[0])?.name ?? "",
    look: `${LOOKS.find(([id]) => id === look)?.[1] ?? ""} · ${THEME_LABEL[theme]}`,
    account: devices.data ? `${count} ${plural(count, "устройство", "устройства", "устройств")}` : devices.failed ? "нет связи" : "…",
  };

  const body = (id: SettingsSection) =>
    id === "lessons" ? (
      <NewPerDay state={state} setState={setState} />
    ) : id === "voice" ? (
      <VoicePicker value={voice} onPick={(v) => setState(changeSetting(state, "voice", v))} />
    ) : id === "look" ? (
      <LookPicker />
    ) : (
      <Account me={me} devices={devices} />
    );

  const row = ({ id, title, Icon }: (typeof SECTIONS)[number]) => (
    <button key={id} className="srow" aria-current={wide && open === id ? "true" : undefined} onClick={() => go({ name: "settings", section: id })}>
      <span className={`s-ic t-${id}`} aria-hidden="true"><Icon /></span>
      <span className="s-tx">
        <span className="s-t">{title}</span>{" "}
        <span className="s-v">{value[id]}</span>
      </span>
      <Chevron className="s-ch" aria-hidden="true" />
    </button>
  );

  // телефон и планшет: открыт раздел — его страница с возвратом к списку
  if (!wide && open) {
    const s = SECTIONS.find((x) => x.id === open)!;
    return (
      <>
        <div className="pagehead set-head">
          <button className="sback" aria-label="Назад в настройки" onClick={() => go({ name: "settings" })}>
            <Back aria-hidden="true" />
            Настройки
          </button>
          <h1>{s.title}</h1>
        </div>
        <div className="wrap settings-page">{body(open)}</div>
      </>
    );
  }

  const detail = open && SECTIONS.find((x) => x.id === open);
  return (
    <>
      <div className="pagehead">
        <button className="x" aria-label="Назад" onClick={onBack}><Back /></button>
        <h1>Настройки</h1>
      </div>
      <div className="wrap settings-page">
        <div className="set-nav">
          <div className="card slist">{SECTIONS.slice(0, 3).map(row)}</div>
          <div className="sgroup">{me ? me.user.displayName : "Аккаунт"}</div>
          <div className="card slist">{SECTIONS.slice(3).map(row)}</div>
        </div>
        {detail && (
          <section className="set-detail" aria-labelledby="set-detail-h">
            <h2 id="set-detail-h">{detail.title}</h2>
            {body(detail.id)}
          </section>
        )}
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

const KIND_ICON: Record<DeviceKind, typeof Phone> = { phone: Phone, tablet: Tablet, computer: Laptop };

const passkeyNote = ({ count, synced }: Devices["passkeys"]) =>
  count === 0
    ? "Passkey не привязан"
    : `Passkey: ${count} (${
        synced === count ? "iCloud, на всех устройствах Apple" : synced === 0 ? "только на устройстве, где создан" : `${synced} в iCloud, ${count - synced} на отдельном устройстве`
      })`;

/**
 * «Вход и устройства»: устройства, где выполнен вход (сессии), — выйти на любом из них или везде, кроме этого; passkey — только для сведения.
 * Удалять passkey отсюда нельзя: passkey из iCloud один на все устройства Apple — удалив его, не войдёшь нигде (отзыв — server/cli.ts).
 */
function Account({ me, devices }: { me: Me | null; devices: ReturnType<typeof useDevices> }) {
  const { data, failed, reload } = devices;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");
  const now = Date.now();
  const others = data?.sessions.filter((s) => !s.current) ?? [];

  const run = async (key: string, act: () => Promise<boolean>) => {
    setBusy(key);
    setErr("");
    const ok = await act();
    if (!ok) setErr("Не получилось — проверь интернет и попробуй ещё раз.");
    await reload();
    setBusy(null);
    setConfirm(false);
  };

  return (
    <section className="card account">
      <h3>{me ? me.user.displayName : "Аккаунт"}</h3>
      <p className="mute sm" style={{ margin: "2px 0 0" }}>Где выполнен вход</p>

      {data ? (
        <ul className="devs" aria-label="Где выполнен вход">
          {data.sessions.map((s) => {
            const Icon = KIND_ICON[s.kind];
            return (
              <li className="dev" key={s.id} data-current={s.current || undefined}>
                <span className="dev-ic" aria-hidden="true"><Icon /></span>
                <span className="dev-tx">
                  <b>{s.name}</b>
                  <small>{s.current ? `это устройство · ${seenAgo(now, now)}` : seenAgo(s.lastSeenAt, now)}</small>
                </span>
                {!s.current && (
                  <button className="dev-out" aria-label={`Выйти: ${s.name}, ${seenAgo(s.lastSeenAt, now)}`} disabled={busy !== null} onClick={() => void run(s.id, () => revokeDevice(s.id))}>
                    {busy === s.id ? <span className="spin" /> : "Выйти"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mute sm dev-wait">{failed ? "Список устройств не загрузился — нет связи с сервером." : "Загружаю список устройств…"}</p>
      )}

      {others.length > 0 &&
        (confirm ? (
          <div className="dev-confirm" role="group" aria-label="Подтверждение">
            <p>
              Выйти на {others.length === 1 ? "другом устройстве" : `других устройствах (${others.length})`}? Там нужно будет снова войти по passkey.
            </p>
            <div className="dev-confirm-btns">
              <button className="btn bad" disabled={busy !== null} onClick={() => void run("others", revokeOtherDevices)}>
                {busy === "others" ? <span className="spin" /> : "Да, выйти"}
              </button>
              <button className="btn ghost" disabled={busy !== null} onClick={() => setConfirm(false)}>Отмена</button>
            </div>
          </div>
        ) : (
          <button className="btn ghost wide dev-all" disabled={busy !== null} onClick={() => setConfirm(true)}>Выйти везде, кроме этого</button>
        ))}
      {err && <p className="dev-err" role="alert">{err}</p>}

      <div className="dev-keys">
        <span className="dev-ic" aria-hidden="true"><Key /></span>
        <p className="mute sm">
          {data ? passkeyNote(data.passkeys) : me ? `Passkey: ${me.passkeys}` : "Вход по passkey"}. Новое устройство с тем же Apple ID получит passkey само.
        </p>
      </div>
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
/** Выбор голоса — весь список сразу (у озвучки свой экран). value — из личных настроек, onPick — изменить их. */
export function VoicePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const { voices, server, fallback, playing } = useVoices();

  return (
    <div className="vpage">
      <p className="mute sm vhint">
        {server === "down"
          ? `Сервер озвучки недоступен — сейчас звучит системный голос${fallback ? ` (${fallback})` : ""}.`
          : "Нажми на голос, чтобы выбрать: он сразу прочитает образец. ▶ — послушать, не меняя."}
      </p>
      <div className="vlist" role="radiogroup" aria-label="Голос озвучки">
        {(["us", "gb"] as const).map((acc) => (
          <Fragment key={acc}>
            <div className="vgroup">{acc === "us" ? "🇺🇸" : "🇬🇧"} {ACCENT_LABEL[acc]}</div>
            {voices
              .filter((v) => v.accent === acc)
              .map((v) => {
                const on = v.id === value;
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
                      }}
                    >
                      <span className={`vav ${v.accent}${on ? " sel" : ""}`} aria-hidden="true">{on ? <Check /> : v.name[0]}</span>
                      <span className="vtx">
                        <span className="vname"><b>{v.name}</b>{v.best && <span className="vbadge">лучший</span>}</span>
                        <small>{[v.gender === "f" ? "женский" : "мужской", v.note].filter(Boolean).join(" · ")}</small>
                      </span>
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
      <p className="mute sm vfoot">Нейросетевой голос Kokoro, озвучка на сервере. Выбор — один на все твои устройства.</p>
    </div>
  );
}
