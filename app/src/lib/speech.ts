import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_VOICE, isTtsVoice, TTS_VOICES, type TtsVoice } from "../core/tts";
import { rankVoices } from "../core/voices";

/*
 * Озвучка.
 * 1) Нейросетевой голос с нашего сервера (Kokoro): POST /api/tts → ссылка на mp3 в кэше сервера.
 * 2) Если сервер недоступен — лучший системный английский голос (speechSynthesis).
 */

/* ---------- выбор голоса (на устройство) ---------- */

const VOICE_KEY = "hr2_tts_voice";
const readVoice = (): string => {
  try {
    const v = localStorage.getItem(VOICE_KEY);
    return isTtsVoice(v) ? v : DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
};
let ttsVoice = readVoice();

/* ---------- состояние для экрана настроек ---------- */

type ServerState = "unknown" | "ok" | "down";
let server: ServerState = "unknown";
let sysVoice: SpeechSynthesisVoice | null = null;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};
const setServer = (s: ServerState) => {
  if (s !== server) {
    server = s;
    notify();
  }
};

/* ---------- системный голос (запасной) ---------- */

const refreshSystem = () => {
  try {
    sysVoice = rankVoices(speechSynthesis.getVoices())[0] ?? null;
  } catch {
    sysVoice = null;
  }
  notify();
};
try {
  refreshSystem();
  speechSynthesis.addEventListener("voiceschanged", refreshSystem);
} catch {
  /* нет speechSynthesis */
}

const systemSay = (text: string) => {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (sysVoice) u.voice = sysVoice;
    u.lang = sysVoice ? sysVoice.lang : "en-GB";
    u.rate = 0.92;
    speechSynthesis.speak(u);
  } catch {
    /* молча: озвучка — не обязательная часть */
  }
};

/* ---------- голос с сервера ---------- */

const audio: HTMLAudioElement | null = typeof Audio === "undefined" ? null : new Audio();
/** Тишина 0,05 с: «будит» audio на первом касании — иначе iOS не даст играть после сетевого запроса. */
const SILENCE = (() => {
  const n = 1200,
    b = new Uint8Array(44 + n * 2),
    d = new DataView(b.buffer);
  const s = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  s(0, "RIFF"), d.setUint32(4, 36 + n * 2, true), s(8, "WAVEfmt "), d.setUint32(16, 16, true), d.setUint16(20, 1, true);
  d.setUint16(22, 1, true), d.setUint32(24, 24000, true), d.setUint32(28, 48000, true), d.setUint16(32, 2, true), d.setUint16(34, 16, true);
  s(36, "data"), d.setUint32(40, n * 2, true);
  return "data:audio/wav;base64," + btoa(String.fromCharCode(...b));
})();
if (audio && typeof document !== "undefined") {
  const unlock = () => {
    if (!audio.src) {
      audio.src = SILENCE;
      audio.play().catch(() => {});
    }
    document.removeEventListener("pointerdown", unlock, true);
  };
  document.addEventListener("pointerdown", unlock, true);
}

const urls = new Map<string, Promise<string>>();
let retryAt = 0;

const serverUrl = (text: string, voice: string): Promise<string> => {
  const k = voice + "|" + text;
  let p = urls.get(k);
  if (!p) {
    p = fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, voice }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { url: string }) => j.url);
    p.catch(() => urls.delete(k));
    urls.set(k, p);
  }
  return p;
};

let seq = 0;

/** Какой голос сейчас готовится или звучит — для индикатора в выборе голоса. */
let playing: { voice: string; loading: boolean } | null = null;
const setPlaying = (p: typeof playing) => {
  playing = p;
  notify();
};
if (audio) {
  audio.addEventListener("playing", () => playing && setPlaying({ ...playing, loading: false }));
  audio.addEventListener("ended", () => setPlaying(null));
  audio.addEventListener("pause", () => playing && !playing.loading && setPlaying(null));
}

/** Озвучить (голосом из настроек или указанным). Новый вызов прерывает предыдущий. */
export const say = (text: string, voice: string = ttsVoice) => {
  const id = ++seq;
  try {
    speechSynthesis.cancel();
  } catch {
    /* нет speechSynthesis */
  }
  audio?.pause();
  if (!audio || Date.now() < retryAt) {
    setPlaying(null);
    return systemSay(text);
  }
  setPlaying({ voice, loading: true });
  serverUrl(text, voice)
    .then((url) => {
      if (id !== seq) return;
      setServer("ok");
      audio.src = url;
      return audio.play();
    })
    .catch(() => {
      if (id !== seq) return;
      setServer("down");
      setPlaying(null);
      retryAt = Date.now() + 30_000; // сервер лежит — полминуты не пытаемся
      systemSay(text);
    });
};

/** Заранее подготовить озвучку (например, следующего шага). */
export const prefetch = (text: string) => {
  if (Date.now() >= retryAt) serverUrl(text, ttsVoice).catch(() => {});
};

export const setVoice = (id: string) => {
  if (!isTtsVoice(id)) return;
  ttsVoice = id;
  try {
    localStorage.setItem(VOICE_KEY, id);
  } catch {
    /* выбор действует до перезагрузки */
  }
  retryAt = 0;
  notify();
};

export interface VoicesView {
  voices: TtsVoice[];
  current: string;
  server: ServerState;
  /** имя системного голоса, который звучит, если сервер недоступен */
  fallback: string | null;
  playing: { voice: string; loading: boolean } | null;
}

export const useVoices = (): VoicesView => {
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => version,
  );
  return { voices: TTS_VOICES, current: ttsVoice, server, fallback: sysVoice?.name ?? null, playing };
};

/* ---------- распознавание речи: SpeechRecognition, где он есть ---------- */

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

const Ctor: RecognitionCtor | undefined =
  typeof window === "undefined"
    ? undefined
    : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);

export const dictationSupported = !!Ctor;

/** Микрофон: onFinal получает распознанные куски, listening — идёт ли запись. */
export const useDictation = (onFinal: (text: string) => void) => {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onFinal);
  cb.current = onFinal;

  const stop = useCallback(() => {
    try {
      rec.current?.stop();
    } catch {
      /* уже остановлен */
    }
  }, []);

  const start = useCallback(() => {
    if (!Ctor) return;
    setError("");
    const r = new Ctor();
    r.lang = "en-GB";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) cb.current(e.results[i][0].transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("Нет доступа к микрофону — разреши его в настройках браузера.");
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { supported: dictationSupported, listening, error, start, stop };
};
