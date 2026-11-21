/**
 * Оценка произношения на сервере: запись (PCM 16 кГц) + текст → PronResult (src/core/pron.ts).
 * Звуки распознаёт отдельный процесс pron-worker.ts; здесь — связь с ним и сборка ответа.
 * Запись не сохраняется: после ответа от неё ничего не остаётся.
 */
import { fork, type ChildProcess } from "node:child_process";
import { expectedFromIpa, ipaAtoms, modelAtoms, scorePron, textWords, type PronResult } from "../src/core/pron.ts";

export const PRON_MODEL = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";

/** Услышанная единица модели и другие, которые модель допускала на том же отрезке. */
export interface Unit {
  u: string;
  alt?: string[];
}
/** Вариант попадает в сомнения модели, если его вероятность на отрезке не ниже этой. */
export const ALT_PROB = 0.15;

/**
 * Жадное декодирование CTC: лучший класс в каждом кадре, повторы схлопываются, пустой (<pad>) и служебные — прочь.
 * Для каждой единицы — заметные (≥ ALT_PROB) другие варианты на её кадрах.
 */
export const ctcUnits = (logits: Float32Array, frames: number, size: number, units: readonly string[]): Unit[] => {
  const out: Unit[] = [];
  let prev = -1;
  let cur: { u: string; alt: Map<string, number> } | null = null;
  const flush = () => {
    if (!cur) return;
    const alt = [...cur.alt].filter(([u, p]) => u !== cur!.u && p >= ALT_PROB).map(([u]) => u);
    out.push(alt.length ? { u: cur.u, alt } : { u: cur.u });
    cur = null;
  };
  for (let t = 0; t < frames; t++) {
    const row = logits.subarray(t * size, (t + 1) * size);
    let best = 0;
    for (let v = 1; v < size; v++) if (row[v] > row[best]) best = v;
    if (best !== prev) {
      flush();
      const u = units[best];
      if (u && !u.startsWith("<")) cur = { u, alt: new Map() };
    }
    prev = best;
    if (cur) {
      // softmax кадра: заметные соседи лучшего
      let z = 0;
      for (let v = 0; v < size; v++) z += Math.exp(row[v] - row[best]);
      for (let v = 0; v < size; v++) {
        const p = Math.exp(row[v] - row[best]) / z;
        const u = units[v];
        if (p >= ALT_PROB && u && !u.startsWith("<")) cur.alt.set(u, Math.max(cur.alt.get(u) ?? 0, p));
      }
    }
  }
  flush();
  return out;
};

/** PCM 16 бит (little-endian) → Float32 −1…1. */
export const pcm16ToFloat = (buf: Uint8Array): Float32Array => {
  const n = buf.length >> 1,
    out = new Float32Array(n),
    dv = new DataView(buf.buffer, buf.byteOffset, n * 2);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true) / 32768;
  return out;
};

/** Модель: что прозвучало (единицы словаря модели) и как читается текст (куски IPA от espeak). */
export interface PronModel {
  hear(pcm: Float32Array): Promise<Unit[]>;
  ipa(text: string): Promise<string[]>;
  ready: Promise<void>;
}

export interface PronEngine {
  assess(pcm: Float32Array, text: string): Promise<PronResult>;
  ready: Promise<void>;
  /** записей в работе (ждут или распознаются) */
  busy(): number;
}

/** Ожидаемые звуки по словам: из фразы целиком (слабые формы служебных слов), иначе — по одному слову. */
export const expectedAtoms = async (model: Pick<PronModel, "ipa">, words: string[]): Promise<string[][]> => {
  const whole = expectedFromIpa(words, await model.ipa(words.join(" ")));
  if (whole) return whole;
  return Promise.all(words.map(async (w) => ipaAtoms((await model.ipa(w)).join(" "))));
};

export const createPronEngine = (model: PronModel): PronEngine => {
  let busy = 0;
  const ipaCache = new Map<string, Promise<string[][]>>();
  const expected = (words: string[]) => {
    const k = words.join(" ").toLowerCase();
    let p = ipaCache.get(k);
    if (!p) {
      p = expectedAtoms(model, words);
      p.catch(() => ipaCache.delete(k));
      if (ipaCache.size > 2000) ipaCache.clear();
      ipaCache.set(k, p);
    }
    return p;
  };
  const assess = async (pcm: Float32Array, text: string) => {
    busy++;
    try {
      const words = textWords(text);
      const [exp, heard] = await Promise.all([expected(words), model.hear(pcm)]);
      return scorePron(words, exp, modelAtoms(heard));
    } finally {
      busy--;
    }
  };
  return {
    assess,
    get ready() {
      return model.ready;
    },
    busy: () => busy,
  };
};

/** Процесс с моделью выключается, если записей не было столько (мс): память нужна только во время занятий. */
export const PRON_IDLE_MS = 10 * 60 * 1000;

/**
 * Модель в отдельном процессе (pron-worker.ts). Процесс запускается по требованию — первым запросом или `ready`
 * (приложение «будит» его в начале занятия, POST /api/pron/warm) — и выключается после `idleMs` без записей:
 * в покое сервер занимает столько же памяти, сколько без оценки. Упал (в том числе убит при нехватке памяти) —
 * запускается заново при следующем запросе.
 */
export const processModel = ({ idleMs = PRON_IDLE_MS, script = new URL("./pron-worker.ts", import.meta.url) }: { idleMs?: number; script?: URL } = {}): PronModel => {
  let child: ChildProcess | null = null;
  let ready: Promise<void> = Promise.resolve();
  let nextId = 0;
  let idle: ReturnType<typeof setTimeout> | null = null;
  const touch = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => {
      if (pending.size) return touch();
      child?.kill();
      child = null;
    }, idleMs);
    idle.unref();
  };
  const pending = new Map<number, { res: (v: never) => void; rej: (e: unknown) => void }>();
  const start = () => {
    const c = fork(script, [], { serialization: "advanced", stdio: ["ignore", "inherit", "inherit", "ipc"] });
    child = c;
    c.unref();
    c.channel?.unref();
    ready = new Promise<void>((res, rej) => {
      const onReady = (m: { ready?: boolean; error?: string }) => {
        if (m.ready === undefined) return;
        c.off("message", onReady);
        if (m.ready) res();
        else rej(new Error(m.error));
      };
      c.on("message", onReady);
      c.once("exit", () => rej(new Error("процесс оценки завершился")));
    });
    ready.catch((e) => console.error("оценка произношения не запустилась:", e));
    c.on("message", (m: { id?: number; units?: Unit[]; ipa?: string[]; error?: string }) => {
      if (m.id === undefined) return;
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error !== undefined) p?.rej(new Error(m.error));
      else p?.res((m.units ?? m.ipa ?? []) as never);
    });
    c.once("exit", (code) => {
      if (child === c) child = null;
      if (code !== 0 && code !== null) console.error(`процесс оценки произношения завершился (${code})`);
      pending.forEach((p) => p.rej(new Error(`процесс оценки завершился (${code})`)));
      pending.clear();
    });
  };
  const wake = () => {
    if (!child) start();
    touch();
    return ready;
  };
  const call = async <T>(msg: { kind: "hear"; pcm: Float32Array } | { kind: "ipa"; text: string }) => {
    await wake();
    return new Promise<T>((res, rej) => {
      const id = nextId++;
      pending.set(id, { res, rej });
      child!.send({ id, ...msg });
    });
  };
  return {
    hear: (pcm) => call<Unit[]>({ kind: "hear", pcm }),
    ipa: (text) => call<string[]>({ kind: "ipa", text }),
    get ready() {
      return wake();
    },
  };
};
