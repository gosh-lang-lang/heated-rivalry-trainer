/**
 * Вход без passkey для локальной сборки (AUTH_DEV_BYPASS) и доп. адреса записи (AUTH_DEV_ORIGINS)
 * работают только вне production. На проде те же переменные ничего не открывают.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { authConfigFromEnv } from "./auth.ts";

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });

const running: { proc: ChildProcess; dir: string }[] = [];
afterEach(() => running.splice(0).forEach(({ proc, dir }) => (proc.kill(), rmSync(dir, { recursive: true, force: true }))));

const start = async (env: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "hr-bypass-"));
  const port = await freePort();
  const proc = spawn("node", ["--disable-warning=ExperimentalWarning", "server/index.ts"], {
    env: { ...process.env, PORT: String(port), AUTH_DB: join(dir, "auth.db"), TTS_DISABLED: "1", AUTH_ORIGIN: "http://localhost:5180", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  running.push({ proc, dir });
  await new Promise<void>((resolve, reject) => {
    proc.stdout!.on("data", (d: Buffer) => d.toString().includes("сервер:") && resolve());
    proc.on("exit", (c) => reject(new Error(`сервер упал: ${c}`)));
  });
  return `http://localhost:${port}`;
};

describe("локальная сборка без passkey", () => {
  it("в production AUTH_DEV_BYPASS ничего не открывает: 401, без cookie", async () => {
    const base = await start({ NODE_ENV: "production", AUTH_DEV_BYPASS: "1", AUTH_DEV_ORIGINS: "https://evil.example" });
    const r = await fetch(`${base}/api/state`, { redirect: "manual" });
    expect(r.status).toBe(401);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect((await fetch(`${base}/api/auth/me`)).status).toBe(401);
  });

  it("вне production: сессия пользователю dev заводится сама, запрос повторяется уже с ней", async () => {
    const base = await start({ AUTH_DEV_BYPASS: "1" });
    const first = await fetch(`${base}/api/auth/me`, { redirect: "manual" });
    expect(first.status).toBe(307);
    const cookie = first.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toMatch(/^hr_session=/);
    const me = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { name: string } }).user.name).toBe("dev");
  });

  it("без AUTH_DEV_BYPASS вне production — обычный вход", async () => {
    const base = await start({});
    expect((await fetch(`${base}/api/state`, { redirect: "manual" })).status).toBe(401);
  });
});

describe("доп. адреса записи (AUTH_DEV_ORIGINS)", () => {
  it("вне production — добавляются к основному адресу", () => {
    const cfg = authConfigFromEnv({ AUTH_ORIGIN: "http://192.168.1.19:5180", AUTH_DEV_ORIGINS: "http://localhost:5180/, http://x:1" });
    expect(cfg.devOrigins).toEqual(["http://localhost:5180", "http://x:1"]);
  });
  it("в production — игнорируются", () => {
    expect(authConfigFromEnv({ NODE_ENV: "production", AUTH_ORIGIN: "https://a.example", AUTH_DEV_ORIGINS: "https://evil.example" }).devOrigins).toEqual([]);
  });
});
