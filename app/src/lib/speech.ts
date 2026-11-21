import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_VOICE, isTtsVoice, TTS_VOICES, ttsCacheSource, type TtsVoice } from "../core/tts";
import { rankVoices } from "../core/voices";
import { goLogin } from "./auth";

/*
 * Озвучка.
 * 1) Нейросетевой голос с нашего сервера (Kokoro): POST /api/tts → ссылка на mp3 в кэше сервера.
 * 2) Если сервер недоступен — лучший системный английский голос (speechSynthesis).
 */

/* ---------- выбор голоса ---------- */

// Выбор хранится в личных настройках (AppState.settings.voice) и один на все устройства;
// App передаёт его сюда через applyVoice. Здесь — только текущий голос для озвучки.
let ttsVoice = DEFAULT_VOICE;

/** Голос, выбранный до переезда настроек на сервер (жил только в этом браузере). Читается один раз и стирается. */
const LEGACY_VOICE_KEY = "hr2_tts_voice";
export const takeLegacyVoice = (): string | null => {
  try {
    const v = localStorage.getItem(LEGACY_VOICE_KEY);
    localStorage.removeItem(LEGACY_VOICE_KEY);
    return isTtsVoice(v) ? v : null;
  } catch {
    return null;
  }
};

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
    const done = () => playing?.text === text && setPlaying(null);
    u.onend = done;
    u.onerror = done;
    setPlaying({ voice: "system", text, loading: false });
    speechSynthesis.speak(u);
  } catch {
    setPlaying(null); // молча: озвучка — не обязательная часть
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
/*
 * iOS (Safari и приложение на экране «Домой») даёт играть звук только тому, что хоть раз запустили касанием.
 * Озвучка же стартует после сетевого запроса — уже не «в касании». Поэтому на касании будим оба канала:
 *  - audio — тишиной (пока он не сыграл ни разу; если в этот момент готовится фраза — не перебиваем, ждём следующего касания);
 *  - speechSynthesis — пустой фразой: без этого запасной системный голос на iOS молчит, когда сервер недоступен
 *    (так было 21.11.2026: прод падал, сервер отвечал 502, и ни озвучка, ни кнопка не давали звука).
 * Если браузер всё же отказал (NotAllowedError) — будим снова на следующем касании.
 */
let audioReady = false;
let speechReady = false;
const unlock = () => {
  if (audio && !audioReady && !playing?.loading) {
    audio.src = SILENCE;
    audio.play().catch(() => {});
  }
  if (!speechReady) {
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {
      /* нет speechSynthesis */
    }
    speechReady = true;
  }
  if (audioReady || !audio) document.removeEventListener("pointerdown", unlock, true);
};
const armUnlock = () => {
  if (typeof document !== "undefined") document.addEventListener("pointerdown", unlock, true);
};
armUnlock();

const urls = new Map<string, Promise<string>>();
let retryAt = 0;

/**
 * Адрес файла считаем сами — так же, как сервер (core/tts.ts ttsCacheSource → sha1), и передаём текст и голос:
 * готовый файл сервер отдаёт сразу, неготовый — озвучивает и отдаёт в том же запросе. Один запрос вместо двух.
 * Нет WebCrypto (сайт не по https) — обычный путь через POST /api/tts.
 */
export const directUrl = async (text: string, voice: string): Promise<string | null> => {
  try {
    const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(ttsCacheSource(text, voice)));
    const key = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
    return `/api/tts/${key}.mp3?t=${encodeURIComponent(text)}&v=${encodeURIComponent(voice)}`;
  } catch {
    return null;
  }
};

const serverUrl = (text: string, voice: string): Promise<string> => {
  const k = voice + "|" + text;
  let p = urls.get(k);
  if (!p) {
    p = fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, voice }) })
      .then((r) => {
        if (r.status === 401) goLogin(); // сессия закончилась
        return r.ok ? r.json() : Promise.reject(new Error(String(r.status)));
      })
      .then((j: { url: string }) => j.url);
    p.catch(() => urls.delete(k));
    urls.set(k, p);
  }
  return p;
};

let seq = 0;

/** Что сейчас готовится или звучит — для нажатой кнопки «озвучить» и индикатора в выборе голоса. */
let playing: { voice: string; text: string; loading: boolean } | null = null;
const setPlaying = (p: typeof playing) => {
  playing = p;
  notify();
};
if (audio) {
  // тишина, которой будили звук, — не фраза: её начало и конец не трогают фразу, которая в это время готовится
  const phrase = () => audio.src !== SILENCE;
  audio.addEventListener("playing", () => {
    audioReady = true;
    if (playing && phrase()) setPlaying({ ...playing, loading: false });
  });
  audio.addEventListener("ended", () => phrase() && setPlaying(null));
  audio.addEventListener("pause", () => phrase() && playing && !playing.loading && playing.voice !== "system" && setPlaying(null));
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
  setPlaying({ voice, text, loading: true });
  const play = (url: string) => {
    if (id !== seq) return;
    audio.src = url;
    return audio.play();
  };
  /** Браузер не дал играть (не было касания) — сервер тут ни при чём: будим звук на следующем касании, пробуем системный голос. */
  const blocked = (e: unknown) => {
    if ((e as { name?: string })?.name !== "NotAllowedError") return false;
    audioReady = false;
    armUnlock();
    setPlaying(null);
    systemSay(text);
    return true;
  };
  /** Сервер недоступен или не ответил вовремя — полминуты говорим системным голосом. */
  const serverDown = () => {
    setServer("down");
    setPlaying(null);
    retryAt = Date.now() + RETRY_MS;
    systemSay(text);
  };
  const viaServer = () =>
    serverUrl(text, voice)
      .then((url) => {
        if (id !== seq) return;
        setServer("ok");
        return play(url);
      })
      .catch((e: unknown) => {
        if (id !== seq || (e as { name?: string })?.name === "AbortError" || blocked(e)) return;
        serverDown();
      });
  // сервер завис (502/504 приходят через десятки секунд) — не держим кнопку в «загрузке», говорим системным голосом
  setTimeout(() => {
    if (id !== seq || playing?.text !== text || !playing.loading) return;
    seq++; // поздний ответ сервера уже не должен зазвучать поверх
    audio.pause();
    audio.removeAttribute("src");
    audio.load(); // прерывает загрузку файла
    serverDown();
  }, SLOW_MS);
  void directUrl(text, voice).then((url) => {
    if (id !== seq) return;
    if (!url) return viaServer();
    const p = play(url);
    p?.then(
      () => setServer("ok"),
      (e: unknown) => {
        if (id !== seq || (e as { name?: string })?.name === "AbortError" || blocked(e)) return;
        void viaServer(); // не вышло (лимит, ошибка) — запасной путь: POST, потом системный голос
      },
    );
  });
};

/** Сколько ждать звука с сервера, прежде чем сказать системным голосом. Новая фраза на сервере озвучивается за 1–3 с. */
const SLOW_MS = 7000;
/** Сервер недоступен — столько не пытаемся к нему обращаться. */
const RETRY_MS = 30_000;

/** Что сейчас с этой фразой: готовится (loading), звучит (playing) или ничего. */
export const useSpeaking = (text: string): "loading" | "playing" | null => {
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => version,
  );
  return playing?.text === text ? (playing.loading ? "loading" : "playing") : null;
};

/** Заранее подготовить озвучку (например, следующего шага). */
export const prefetch = (text: string) => {
  if (Date.now() >= retryAt) serverUrl(text, ttsVoice).catch(() => {});
};

/** Применить голос из настроек (App вызывает при каждом изменении настроек). */
export const applyVoice = (id: string) => {
  const v = isTtsVoice(id) ? id : DEFAULT_VOICE;
  if (v === ttsVoice) return;
  ttsVoice = v;
  retryAt = 0;
  notify();
};

export interface VoicesView {
  voices: TtsVoice[];
  current: string;
  server: ServerState;
  /** имя системного голоса, который звучит, если сервер недоступен */
  fallback: string | null;
  playing: { voice: string; text: string; loading: boolean } | null;
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
