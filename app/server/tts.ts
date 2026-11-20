/**
 * Озвучка на сервере: Kokoro (локальная нейросеть, отдельный поток) → MP3 → файл в кэше.
 * Один файл на (голос, скорость, текст). Генерация идёт по очереди:
 * запросы пользователя — вперёд, прогрев колоды — в фоне.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { ttsCacheSource } from "../src/core/tts.ts";

export const cacheKey = (text: string, voice: string) => createHash("sha1").update(ttsCacheSource(text, voice)).digest("hex").slice(0, 20);

export interface TtsEngine {
  /** Есть ли уже готовый файл. */
  has(text: string, voice: string): boolean;
  /** Готовит файл (если его ещё нет) и возвращает ключ. */
  ensure(text: string, voice: string, priority?: "hi" | "lo"): Promise<string>;
  file(key: string): string;
  ready: Promise<void>;
  stats(): { queued: number; generated: number };
}

interface Job {
  key: string;
  text: string;
  voice: string;
  done: Promise<string>;
  resolve: (k: string) => void;
  reject: (e: unknown) => void;
}

export const createEngine = (cacheDir: string, dtype: "fp32" | "q8" = "fp32"): TtsEngine => {
  mkdirSync(cacheDir, { recursive: true });
  const file = (key: string) => join(cacheDir, `${key}.mp3`);

  /* ---------- поток с моделью ---------- */
  const worker = new Worker(new URL("./tts-worker.ts", import.meta.url), { workerData: { dtype } });
  worker.unref();
  const ready = new Promise<void>((res, rej) => {
    const onReady = (m: { ready?: boolean; error?: string }) => {
      if (m.ready === undefined) return;
      worker.off("message", onReady);
      if (m.ready) res();
      else rej(new Error(m.error));
    };
    worker.on("message", onReady);
  });
  let nextId = 0;
  const pending = new Map<number, { res: (b: Uint8Array) => void; rej: (e: unknown) => void }>();
  worker.on("message", (m: { id?: number; mp3?: Uint8Array; error?: string }) => {
    if (m.id === undefined) return;
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.mp3) p?.res(m.mp3);
    else p?.rej(new Error(m.error));
  });
  worker.on("error", (e) => pending.forEach((p) => p.rej(e)));
  const generate = (text: string, voice: string) =>
    new Promise<Uint8Array>((res, rej) => {
      const id = nextId++;
      pending.set(id, { res, rej });
      worker.postMessage({ id, text, voice });
    });

  /* ---------- очередь ---------- */
  const hi: Job[] = [];
  const lo: Job[] = [];
  const jobs = new Map<string, Job>();
  let running = false;
  let generated = 0;

  const pump = async () => {
    if (running) return;
    running = true;
    for (let j = hi.shift() ?? lo.shift(); j; j = hi.shift() ?? lo.shift()) {
      try {
        const mp3 = await generate(j.text, j.voice);
        const tmp = file(j.key) + ".tmp";
        writeFileSync(tmp, mp3);
        renameSync(tmp, file(j.key));
        generated++;
        j.resolve(j.key);
      } catch (e) {
        j.reject(e);
      } finally {
        jobs.delete(j.key);
      }
    }
    running = false;
  };

  const ensure = (text: string, voice: string, priority: "hi" | "lo" = "hi") => {
    const key = cacheKey(text, voice);
    if (existsSync(file(key))) return Promise.resolve(key);
    const queued = jobs.get(key);
    if (queued) {
      // фоновую задачу, которую ждёт пользователь, — в начало очереди
      const i = lo.indexOf(queued);
      if (priority === "hi" && i >= 0) hi.push(...lo.splice(i, 1));
      return queued.done;
    }
    let resolve!: (k: string) => void, reject!: (e: unknown) => void;
    const done = new Promise<string>((res, rej) => ((resolve = res), (reject = rej)));
    done.catch(() => {}); // фоновые ошибки не роняют процесс
    const j: Job = { key, text, voice, done, resolve, reject };
    jobs.set(key, j);
    (priority === "hi" ? hi : lo).push(j);
    void pump();
    return done;
  };

  const has = (text: string, voice: string) => existsSync(file(cacheKey(text, voice))) || jobs.has(cacheKey(text, voice));
  return { has, ensure, file, ready, stats: () => ({ queued: hi.length + lo.length, generated }) };
};
