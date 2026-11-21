/**
 * Процесс оценки по требованию (processModel): не запускается вместе с сервером, выключается без записей,
 * упал — запускается заново. Вместо модели — подделка pron-worker.fake.ts (отвечает своим pid).
 */
import { describe, expect, it } from "vitest";
import { processModel } from "./pron.ts";

const script = new URL("./pron-worker.fake.ts", import.meta.url);
const pid = async (m: ReturnType<typeof processModel>) => Number((await m.hear(new Float32Array(4)))[0].u);
const alive = (p: number) => {
  try {
    process.kill(p, 0);
    return true;
  } catch {
    return false;
  }
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("процесс оценки произношения", () => {
  it("запускается первым запросом, один на все запросы, выключается без записей и снова запускается", { timeout: 20_000 }, async () => {
    const m = processModel({ idleMs: 700, script });
    const a = await pid(m);
    expect(await pid(m)).toBe(a);
    await wait(1500);
    expect(alive(a)).toBe(false);
    const b = await pid(m);
    expect(b).not.toBe(a);
    process.kill(b, "SIGKILL"); // как при нехватке памяти
    await wait(300);
    expect(await pid(m)).not.toBe(b);
  });

  it("ready «будит» процесс заранее", { timeout: 20_000 }, async () => {
    const m = processModel({ idleMs: 60_000, script });
    await m.ready;
    const a = await pid(m);
    expect(alive(a)).toBe(true);
    process.kill(a, "SIGKILL");
  });
});
