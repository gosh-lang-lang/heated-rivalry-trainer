import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cacheKey, createQueue, type Generate } from "./tts.ts";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "hr-tts-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Подделка генерации: каждая фраза ждёт, пока тест её «допустит»; порядок вызовов записывается. */
const manual = () => {
  const calls: string[] = [];
  const waiting = new Map<string, { res: (b: Uint8Array) => void; rej: (e: unknown) => void }>();
  const generate: Generate = (text, voice) =>
    new Promise((res, rej) => {
      calls.push(`${voice}:${text}`);
      waiting.set(`${voice}:${text}`, { res, rej });
    });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const finish = async (id: string, ok = true) => {
    await tick();
    const w = waiting.get(id)!;
    expect(w, `не генерируется: ${id}`).toBeDefined();
    waiting.delete(id);
    if (ok) w.res(new TextEncoder().encode(`mp3 ${id}`));
    else w.rej(new Error("модель упала"));
    await tick();
  };
  return { calls, generate, finish, tick };
};

describe("очередь озвучки", () => {
  it("озвучивает фразу в файл и второй раз берёт из кэша", async () => {
    const dir = tmp();
    let n = 0;
    const q = createQueue(dir, async () => (n++, new Uint8Array([1, 2, 3])));
    expect(q.has("hello", "af_heart")).toBe(false);
    const key = await q.ensure("hello", "af_heart");
    expect(key).toBe(cacheKey("hello", "af_heart"));
    expect(readFileSync(q.file(key))).toEqual(Buffer.from([1, 2, 3]));
    expect(q.has("hello", "af_heart")).toBe(true);
    await q.ensure("hello", "af_heart");
    expect(n).toBe(1);
    expect(q.stats()).toEqual({ queued: 0, generated: 1 });
    expect(readdirSync(dir)).toEqual([`${key}.mp3`]); // временных файлов не осталось
  });

  it("кэш переживает перезапуск: новая очередь видит готовые файлы", async () => {
    const dir = tmp();
    await createQueue(dir, async () => new Uint8Array([9])).ensure("hi", "bf_emma");
    let called = false;
    const q2 = createQueue(dir, async () => ((called = true), new Uint8Array()));
    expect(q2.has("hi", "bf_emma")).toBe(true);
    await q2.ensure("hi", "bf_emma");
    expect(called).toBe(false);
  });

  it("голос — часть ключа: та же фраза другим голосом — отдельный файл", () => {
    expect(cacheKey("hello", "af_heart")).not.toBe(cacheKey("hello", "bf_emma"));
    expect(cacheKey("hello", "af_heart")).toMatch(/^[0-9a-f]{20}$/);
  });

  it("одновременные запросы одной фразы — одна генерация", async () => {
    const m = manual();
    const q = createQueue(tmp(), m.generate);
    const a = q.ensure("same", "af_heart");
    const b = q.ensure("same", "af_heart", "lo");
    expect(q.has("same", "af_heart")).toBe(true); // уже в очереди — лимит не трогаем
    await m.finish("af_heart:same");
    expect(await a).toBe(await b);
    expect(m.calls).toEqual(["af_heart:same"]);
  });

  it("запросы пользователя обгоняют прогрев; ожидаемую фоновую фразу поднимает вперёд", async () => {
    const m = manual();
    const q = createQueue(tmp(), m.generate);
    void q.ensure("w1", "v", "lo"); // уже генерируется
    void q.ensure("w2", "v", "lo");
    void q.ensure("w3", "v", "lo");
    void q.ensure("user", "v", "hi");
    void q.ensure("w3", "v", "hi"); // пользователь ждёт w3 — вперёд w2
    expect(q.stats().queued).toBe(3);
    for (const id of ["v:w1", "v:user", "v:w3", "v:w2"]) await m.finish(id);
    expect(m.calls).toEqual(["v:w1", "v:user", "v:w3", "v:w2"]);
    expect(q.stats()).toEqual({ queued: 0, generated: 4 });
  });

  it("ошибка генерации: запрос получает ошибку, файла нет, очередь идёт дальше, повтор возможен", async () => {
    const m = manual();
    const q = createQueue(tmp(), m.generate);
    const bad = q.ensure("bad", "v");
    const next = q.ensure("next", "v");
    await m.finish("v:bad", false);
    await expect(bad).rejects.toThrow("модель упала");
    expect(q.has("bad", "v")).toBe(false);
    await m.finish("v:next");
    expect(existsSync(q.file(await next))).toBe(true);
    const again = q.ensure("bad", "v");
    await m.finish("v:bad");
    await expect(again).resolves.toBe(cacheKey("bad", "v"));
  });

  it("ошибка фоновой фразы не роняет процесс", async () => {
    const m = manual();
    const q = createQueue(tmp(), m.generate);
    void q.ensure("bg", "v", "lo"); // результат никто не ждёт
    await m.finish("v:bg", false);
    await m.tick();
    expect(q.stats().queued).toBe(0);
  });
});
