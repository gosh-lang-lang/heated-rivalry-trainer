import { test as base } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Изолированная среда для тестов входа: на каждый тест — свой продакшен-сервер на свободном порту
 * и своя пустая база во временной папке. После теста сервер останавливается, папка удаляется.
 * Тесты не зависят друг от друга, от порядка и от повторных прогонов.
 */
export interface AuthEnv {
  origin: string;
  /** server/cli.ts против базы этого теста */
  cli: (...args: string[]) => string;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });

const waitHealthy = async (origin: string, proc: ChildProcess, log: () => string) => {
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) throw new Error("сервер упал при старте:\n" + log());
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return;
    } catch {
      /* ещё не слушает */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("сервер не поднялся за 10 с:\n" + log());
};

export const test = base.extend<{ auth: AuthEnv }>({
  auth: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "hr-auth-e2e-"));
    const port = await freePort();
    const origin = `http://localhost:${port}`;
    const env = { ...process.env, NODE_ENV: "production", PORT: String(port), AUTH_ORIGIN: origin, AUTH_DB: join(dir, "auth.db"), TTS_DISABLED: "1", PRON_DISABLED: "1" };
    let out = "";
    const proc = spawn("node", ["--disable-warning=ExperimentalWarning", "server/index.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout!.on("data", (d) => (out += d));
    proc.stderr!.on("data", (d) => (out += d));
    try {
      await waitHealthy(origin, proc, () => out);
      const cli = (...args: string[]) => execFileSync("node", ["--disable-warning=ExperimentalWarning", "server/cli.ts", ...args], { env, encoding: "utf8" });
      await use({ origin, cli });
    } finally {
      proc.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  },
  // все относительные адреса теста — к его собственному серверу
  baseURL: async ({ auth }, use) => use(auth.origin),
});

export { expect } from "@playwright/test";
