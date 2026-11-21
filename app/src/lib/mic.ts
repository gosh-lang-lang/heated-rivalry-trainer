import { useSyncExternalStore } from "react";
import { createEndpointer, resample, rms, toPcm16, trimSilence } from "../core/audio";
import { PRON_RATE, type PronResult } from "../core/pron";

/*
 * Микрофон для заданий «Скажи».
 * Разрешение спрашиваем один раз за занятие: поток открывается при первом «Поехали» (если в занятии есть говорение)
 * или при первой записи и живёт до конца занятия. Между записями дорожка выключена (track.enabled = false):
 * iOS не держит микрофон, озвучка звучит как обычно, а повторного вопроса о разрешении нет.
 * Запись идёт сырым звуком (Web Audio), сама заканчивается после паузы, обрезается и уходит на сервер в 16 кГц.
 */

export type MicState = "off" | "asking" | "on" | "denied" | "none";

type AudioCtor = typeof AudioContext;
const Ctx: AudioCtor | undefined =
  typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext);

export const micSupported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!Ctx;

let state: MicState = "off";
let stream: MediaStream | null = null;
let ctx: AudioContext | null = null;
let opening: Promise<MicState> | null = null;
const subs = new Set<() => void>();
const set = (s: MicState) => {
  state = s;
  subs.forEach((f) => f());
};

/** Safari 17+: тип аудиосессии. Во время записи — «запись и воспроизведение», после — как обычно. */
const audioSession = (type: "play-and-record" | "auto") => {
  const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (s)
    try {
      s.type = type;
    } catch {
      /* старый Safari */
    }
};

const tracks = (on: boolean) => stream?.getAudioTracks().forEach((t) => (t.enabled = on));

/** Открыть микрофон (спросит разрешение, если его ещё нет). Вызывать из нажатия — iOS иначе не запустит звук. */
export const openMic = (): Promise<MicState> => {
  if (state === "on" && stream?.active) {
    void ctx?.resume();
    return Promise.resolve(state);
  }
  if (opening) return opening;
  if (!micSupported()) {
    set("none");
    return Promise.resolve(state);
  }
  // контекст — сразу, в нажатии: после await iOS его не запустит
  ctx ??= new Ctx!();
  void ctx.resume();
  set("asking");
  opening = navigator.mediaDevices
    .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    .then((s) => {
      stream = s;
      tracks(false);
      set("on");
      return state;
    })
    .catch((e: unknown) => {
      const name = (e as { name?: string })?.name;
      set(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "none");
      return state;
    })
    .finally(() => (opening = null));
  return opening;
};

/** Конец занятия: микрофон выключается целиком. */
export const closeMic = () => {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  void ctx?.close().catch(() => {});
  ctx = null;
  audioSession("auto");
  if (state === "on" || state === "asking") set("off");
};

export const useMicState = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state,
  );

export interface Recording {
  /** закончить сейчас (иначе — сама, после паузы) */
  stop(): void;
  /** звук 16 кГц, PCM 16 бит, без тишины по краям; null — тишина или микрофон недоступен */
  done: Promise<Uint8Array | null>;
}

/**
 * Записать фразу. onLevel — громкость 0…1 для индикатора. Запись заканчивается сама после паузы `silenceMs`
 * (слово — короче, фраза — длиннее), не позже `maxMs`.
 */
export const record = async (o: { silenceMs: number; maxMs: number; onLevel?: (l: number) => void }): Promise<Recording | null> => {
  if ((await openMic()) !== "on" || !ctx || !stream) return null;
  await ctx.resume().catch(() => {});
  audioSession("play-and-record");
  tracks(true);
  const ac = ctx;
  const src = ac.createMediaStreamSource(stream);
  const proc = ac.createScriptProcessor(2048, 1, 1);
  const chunks: Float32Array[] = [];
  const end = createEndpointer({ silenceMs: o.silenceMs, maxMs: o.maxMs });
  let finish!: () => void;
  const stopped = new Promise<void>((r) => (finish = r));
  proc.onaudioprocess = (e) => {
    const x = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(x);
    const l = rms(x);
    o.onLevel?.(l);
    if (end(l, (x.length / ac.sampleRate) * 1000) === "stop") finish();
  };
  src.connect(proc);
  proc.connect(ac.destination); // без выхода Safari не зовёт onaudioprocess
  const done = stopped.then(() => {
    proc.onaudioprocess = null;
    src.disconnect();
    proc.disconnect();
    tracks(false);
    audioSession("auto");
    const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) all.set(c, (at += c.length) - c.length);
    const trimmed = trimSilence(all, ac.sampleRate);
    return trimmed.length ? toPcm16(resample(trimmed, ac.sampleRate, PRON_RATE)) : null;
  });
  return { stop: finish, done };
};

/** Начало занятия с говорением: сервер заранее загружает модель оценки (она запускается по требованию). */
export const warmPron = () => void fetch("/api/pron/warm", { method: "POST" }).catch(() => {});

/** Оценка на сервере. null — сервер недоступен или оценка отключена. */
export const assessPron = async (text: string, pcm: Uint8Array): Promise<PronResult | null> => {
  try {
    const r = await fetch(`/api/pron?t=${encodeURIComponent(text)}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: pcm as BodyInit,
    });
    if (!r.ok) return null;
    return (await r.json()) as PronResult;
  } catch {
    return null;
  }
};
