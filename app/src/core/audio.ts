/**
 * Запись для оценки произношения — чистая обработка звука (без DOM): громкость, конец фразы по тишине,
 * обрезка тишины по краям, перевод в 16 кГц и PCM 16 бит. Меньше звука — быстрее отправка и распознавание.
 */

/** Средняя громкость куска (RMS), 0…1. */
export const rms = (x: Float32Array): number => {
  let s = 0;
  for (const v of x) s += v * v;
  return x.length ? Math.sqrt(s / x.length) : 0;
};

export interface EndpointOptions {
  /** тишина после речи, после которой запись заканчивается, мс */
  silenceMs: number;
  /** запись не длиннее, мс */
  maxMs: number;
  /** если речи так и не было — заканчиваем через столько, мс */
  idleMs?: number;
}

/** Порог речи: не тише этого и в разы громче фона первых кусков. */
export const SPEECH_MIN = 0.012;
const NOISE_MS = 250;
/** Порог речи не выше этого, как бы громко ни было в начале. */
const NOISE_CAP = 0.06;
/** Речь началась, если громкие куски набрались на столько, мс. */
const SPEECH_MS = 120;

/**
 * Конец записи по тишине: кормим громкостью кусков по мере записи.
 * "wait" — ещё ждём речь, "speech" — говорят, "stop" — закончили (тишина после речи, предел длины или речи не было).
 */
export const createEndpointer = (o: EndpointOptions) => {
  let total = 0,
    noise = Infinity,
    speech = 0,
    silence = 0;
  return (level: number, ms: number): "wait" | "speech" | "stop" => {
    total += ms;
    if (total <= NOISE_MS) noise = Math.min(noise, level);
    // фон оцениваем по первым кускам; если заговорили сразу, «фон» — это речь: порог не выше NOISE_CAP
    const thr = Math.max(SPEECH_MIN, Math.min(NOISE_CAP, (Number.isFinite(noise) ? noise : 0) * 3));
    if (level >= thr) {
      speech += ms;
      silence = 0;
    } else if (speech >= SPEECH_MS) silence += ms;
    if (total >= o.maxMs) return "stop";
    if (speech >= SPEECH_MS) return silence >= o.silenceMs ? "stop" : "speech";
    return total >= (o.idleMs ?? 6000) ? "stop" : "wait";
  };
};

/**
 * Обрезает тишину по краям: оставляет от первого до последнего громкого куска (20 мс) и `padS` секунд вокруг.
 * Совсем тихая запись — пустой массив.
 */
export const trimSilence = (x: Float32Array, rate: number, padS = 0.2): Float32Array => {
  const win = Math.max(1, Math.round(rate * 0.02));
  const levels: number[] = [];
  for (let i = 0; i < x.length; i += win) levels.push(rms(x.subarray(i, i + win)));
  if (!levels.length) return new Float32Array(0);
  const sorted = [...levels].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  // фон — тихие 10% кусков; но если пауз нет совсем (речь с первой до последней миллисекунды), порог — не выше четверти пика
  const thr = Math.max(SPEECH_MIN, Math.min(floor * 3, sorted[sorted.length - 1] / 4));
  const first = levels.findIndex((l) => l >= thr);
  if (first < 0) return new Float32Array(0);
  let last = levels.length - 1;
  while (levels[last] < thr) last--;
  const pad = Math.round(padS * rate);
  return x.slice(Math.max(0, first * win - pad), Math.min(x.length, (last + 1) * win + pad));
};

/** Перевод в другую частоту: усреднение по окну (против наложения частот) и линейная интерполяция. */
export const resample = (x: Float32Array, from: number, to: number): Float32Array => {
  if (from === to) return x.slice();
  const ratio = from / to,
    n = Math.floor(x.length / ratio),
    y = new Float32Array(n);
  const half = Math.max(0, Math.floor(ratio / 2));
  for (let i = 0; i < n; i++) {
    const c = i * ratio,
      k = Math.floor(c),
      f = c - k;
    const at = (j: number) => {
      if (!half) return x[Math.min(x.length - 1, j)] ?? 0;
      let s = 0,
        cnt = 0;
      for (let t = j - half; t <= j + half; t++)
        if (t >= 0 && t < x.length) {
          s += x[t];
          cnt++;
        }
      return cnt ? s / cnt : 0;
    };
    y[i] = at(k) * (1 - f) + at(k + 1) * f;
  }
  return y;
};

/** −1…1 → PCM 16 бит little-endian. */
export const toPcm16 = (x: Float32Array): Uint8Array => {
  const out = new Uint8Array(x.length * 2),
    dv = new DataView(out.buffer);
  for (let i = 0; i < x.length; i++) {
    const v = Math.max(-1, Math.min(1, x[i]));
    dv.setInt16(i * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true);
  }
  return out;
};
