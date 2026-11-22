/**
 * Скрипты деплоя (deploy/*.sh) — без сервера: ssh, npm и curl подменены записывающими заглушками.
 *   deploy.sh — выкатывает ровно origin/main (проверяет его чистую копию, на маке собирает образ, на сервер —
 *               только образ и deploy/, без исходников), ничего с красными тестами или сломанной сборкой.
 *   deploy.sh edge — только регистрация сайта в vps-edge: без npm, сборки, бэкапа, образа и compose up.
 *   backup.sh — проверяет копию до ротации, хранит KEEP последних дней.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { STATE_MAX_BYTES } from "./progress.ts";

const DEPLOY = resolve(import.meta.dirname, "../../deploy");
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "hr-deploy-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const script = (path: string, body: string) => {
  writeFileSync(path, `#!/bin/bash\n${body}\n`);
  chmodSync(path, 0o755);
};

/** Заглушки команд: пишут вызовы в журнал; поведение — через переменные FAKE_*. */
const fakeBin = (root: string) => {
  const bin = join(root, "bin");
  mkdirSync(bin);
  const log = join(root, "calls.log");
  script(join(bin, "npm"), `echo "npm $*" >> "${log}"; [[ -n "\${FAKE_NPM_FAIL:-}" && "$*" == *"$FAKE_NPM_FAIL"* ]] && exit 1; exit 0`);
  script(
    join(bin, "ssh"),
    `last="\${@: -1}"
if [[ "$last" == *"edge=ready"* ]]; then echo "ssh edge-ready" >> "${log}"; [[ "\${FAKE_EDGE_READY:-1}" == 0 ]] && echo edge=not-ready || echo edge=ready; exit 0; fi
if [[ "$last" == *"StartedAt"* ]]; then n=$(cat "${root}/started.n" 2>/dev/null || echo 0); echo $((n+1)) > "${root}/started.n"; echo "started-\${FAKE_STARTED_CHANGES:+$n}"; exit 0; fi
if [[ "$*" == *"docker inspect"* ]]; then echo "\${FAKE_PROD_REV:-unknown} healthy"; exit 0; fi
if [[ "$last" == *"list-unit-files"* ]]; then echo "ssh $last" >> "${log}"; echo "\${FAKE_EDGE_UNITS:-0}"; exit 0; fi
if [[ "$last" == *"edge register"* ]]; then
  cat > "${root}/edge.tar"; echo "ssh $last" >> "${log}"
  rc="\${FAKE_EDGE_RC:-0}"; [[ "$rc" == 0 ]] && echo "edge register heated-rivalry: \${FAKE_EDGE_STATUS:-OK}" || echo "edge register heated-rivalry: FAILED"; exit "$rc"
fi
if [[ "$last" == *"tar -x"* ]]; then cat > "${root}/shipped.tar"; else cat > /dev/null; fi
echo "ssh $(echo "$last" | tr '\\n' ' ')" >> "${log}"`,
  );
  script(join(bin, "curl"), `if [[ "$*" == *api/health* || "$*" == */login* ]]; then echo 200; else echo 302; fi`);
  // docker на маке: сборка (FAKE_DOCKER_FAIL=build — падает), save — байты образа; zstd — как есть
  script(
    join(bin, "docker"),
    `echo "docker $*" >> "${log}"; [[ -n "\${FAKE_DOCKER_FAIL:-}" && "$*" == *"$FAKE_DOCKER_FAIL"* ]] && exit 1; [[ "$1" == save ]] && echo IMAGE-BYTES; exit 0`,
  );
  script(join(bin, "zstd"), `cat`);
  return { bin, log, calls: () => (existsSync(log) ? readFileSync(log, "utf8") : "") };
};

describe("deploy.sh", () => {
  /** Репозиторий-копия с «GitHub» (голый репозиторий рядом) и deploy.sh из проекта; backup.sh — заглушка. */
  const repo = () => {
    const root = tmp();
    const git = (...a: string[]) => execFileSync("git", a, { cwd: join(root, "work"), encoding: "utf8" }).trim();
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", join(root, "origin.git")]);
    execFileSync("git", ["clone", "-q", join(root, "origin.git"), join(root, "work")], { stdio: "ignore" });
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    git("checkout", "-q", "-B", "main");
    mkdirSync(join(root, "work/deploy"));
    copyFileSync(join(DEPLOY, "deploy.sh"), join(root, "work/deploy/deploy.sh"));
    for (const f of ["compose.yaml", "server-backup.sh", "edge/tenant.conf", "edge/site.caddy"]) {
      mkdirSync(dirname(join(root, "work/deploy", f)), { recursive: true });
      writeFileSync(join(root, "work/deploy", f), "#\n");
    }
    mkdirSync(join(root, "work/app"));
    writeFileSync(join(root, "work/app/secret-source.ts"), "исходник — на сервер не уходит");
    const f = fakeBin(root);
    script(join(root, "work/deploy/backup.sh"), `echo backup >> "${f.log}"`);
    git("add", "-A");
    git("commit", "-qm", "init");
    git("push", "-q", "origin", "main");
    const run = (env: Record<string, string> = {}, ...args: string[]) => {
      const r = spawnSync(join(root, "work/deploy/deploy.sh"), args, {
        env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, HR_HOST: "root@203.0.113.7", ...env },
        encoding: "utf8",
      });
      return { code: r.status, out: r.stdout + r.stderr };
    };
    return { root, git, run, calls: f.calls };
  };

  const edgeTar = (root: string) => execFileSync("tar", ["-tf", join(root, "edge.tar")], { encoding: "utf8" }).trim().split("\n").filter((n) => !n.endsWith("/")).sort();

  const shipped = (root: string) => execFileSync("tar", ["-tf", join(root, "shipped.tar")], { encoding: "utf8" }).trim().split("\n").sort();

  it("всё на GitHub и тесты зелёные: проверки чистой копии → сборка на маке → бэкап → образ и deploy/ на сервер → проверка", () => {
    const { root, git, run, calls } = repo();
    const rev = git("rev-parse", "HEAD");
    const r = run({ FAKE_PROD_REV: rev });
    expect(r.out).toContain(`прод на ${rev.slice(0, 7)}`);
    expect(r.code).toBe(0);
    const lines = calls().trim().split("\n");
    const npm = lines.filter((l) => l.startsWith("npm"));
    // проверки идут в отдельной копии коммита, не в рабочей папке
    expect(npm.every((l) => l.startsWith("npm --prefix ") && !l.startsWith(`npm --prefix app `) && l.includes("/src/app"))).toBe(true);
    expect(npm.map((l) => l.split(" ").slice(3).join(" "))).toEqual([
      "ci --no-audit --no-fund", // node_modules в заглушке нет — ставим
      "run -s typecheck",
      "test --silent",
      "run -s e2e -- --reporter=dot",
    ]);
    // образ — на маке, из той же чистой копии коммита, под архитектуру сервера
    const build = lines.find((l) => l.startsWith("docker buildx build"))!;
    expect(build).toContain("--platform linux/amd64");
    expect(build).toContain(`--build-arg APP_VERSION=${rev} -t heated-rivalry:${rev} --load `);
    expect(build).toMatch(/\/src$/); // контекст — копия коммита, не рабочая папка
    const at = (p: string) => lines.findIndex((l) => l.startsWith(p));
    expect(at("docker buildx")).toBeLessThan(at("backup"));
    expect(at("backup")).toBeLessThan(at("ssh"));
    // сайт регистрируется в vps-edge после бэкапа, таймер снимается до подмены deploy/ и загрузки образа
    const order = ["backup", "ssh /opt/vps-edge/bin/edge register heated-rivalry", "ssh systemctl disable --now heated-rivalry-edge.timer", "ssh set -e; D=/opt/heated-rivalry", "ssh zstd -d"].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(edgeTar(root)).toEqual(["deploy/edge/site.caddy", "deploy/edge/tenant.conf"]);
    // на сервер: deploy/ (без исходников), образ через docker load, запуск без сборки
    expect(lines.some((l) => l.startsWith("ssh ") && l.includes("docker load"))).toBe(true);
    expect(lines.some((l) => l.startsWith(`docker save heated-rivalry:${rev}`))).toBe(true);
    const up = lines.find((l) => l.includes("docker compose up"))!;
    expect(up).toContain(`TAG=${rev} docker compose up -d --no-build`);
    expect(lines.some((l) => l.startsWith("ssh ") && /docker (compose )?build|--build\b/.test(l))).toBe(false); // на сервере не собираем
    // на сервер — только файлы для работы: ни исходников app/, ни скриптов выкатки и бэкапа
    expect(shipped(root)).toEqual(["deploy/", "deploy/compose.yaml", "deploy/server-backup.sh"]);
    expect(calls()).not.toContain("heated-rivalry-backup");
    expect(git("worktree", "list").split("\n")).toHaveLength(1); // временная копия убрана
  });

  it("незакоммиченное в рабочей папке не мешает и на прод не попадает", () => {
    const { root, git, run } = repo();
    writeFileSync(join(root, "work/draft.css"), "чужая работа");
    writeFileSync(join(root, "work/deploy/backup.sh"), "#!/bin/bash\necho backup\n"); // и правка отслеживаемого файла
    const r = run({ FAKE_PROD_REV: git("rev-parse", "HEAD") });
    expect(r.code).toBe(0);
    expect(r.out).toContain("незакоммиченных файлов — на прод они не попадут");
    expect(shipped(root)).not.toContain("draft.css");
    expect(readFileSync(join(root, "work/draft.css"), "utf8")).toBe("чужая работа"); // рабочую папку не трогали
  });

  it("коммит не отправлен на GitHub — отказ до любых действий", () => {
    const { root, git, run, calls } = repo();
    writeFileSync(join(root, "work/new.txt"), "x");
    git("add", "-A");
    git("commit", "-qm", "local only");
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("незапушенных коммитов");
    expect(calls()).toBe("");
  });

  it("с другой ветки выкатывается всё равно origin/main", () => {
    const { root, git, run } = repo();
    const rev = git("rev-parse", "HEAD");
    git("checkout", "-q", "-b", "feature");
    writeFileSync(join(root, "work/feature.txt"), "x");
    git("add", "-A");
    git("commit", "-qm", "feature");
    const { calls } = { calls: () => readFileSync(join(root, "calls.log"), "utf8") };
    const r = run({ FAKE_PROD_REV: rev });
    expect(r.code).toBe(0);
    expect(shipped(root)).not.toContain("feature.txt");
    expect(calls()).toContain(`-t heated-rivalry:${rev} `); // образ — из origin/main, не из ветки
  });

  it("сборка образа не удалась — ни бэкапа, ни выкатки", () => {
    const { git, run, calls } = repo();
    const r = run({ FAKE_DOCKER_FAIL: "buildx", FAKE_PROD_REV: git("rev-parse", "HEAD") });
    expect(r.code).not.toBe(0);
    expect(calls()).not.toContain("backup");
    expect(calls()).not.toContain("ssh");
  });

  it.each(["typecheck", "test --silent", "e2e"])("красный %s — ни бэкапа, ни выкатки", (step) => {
    const { git, run, calls } = repo();
    const r = run({ FAKE_NPM_FAIL: step, FAKE_PROD_REV: git("rev-parse", "HEAD") });
    expect(r.code).not.toBe(0);
    expect(calls()).not.toContain("backup");
    expect(calls()).not.toContain("ssh");
  });

  it("на проде оказался не тот коммит — ошибка", () => {
    const { run } = repo();
    const r = run({ FAKE_PROD_REV: "0000000000000000000000000000000000000000" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("на проде 0000000");
  });

  it("edge не готов или отказал — выкатка не идёт дальше: ни регистрации, ни подмены, ни образа", () => {
    const a = repo();
    const r = a.run({ FAKE_EDGE_READY: "0", FAKE_PROD_REV: a.git("rev-parse", "HEAD") });
    expect(r.code).toBe(1);
    expect(a.calls()).not.toContain("edge register");
    expect(a.calls()).not.toContain("tar -x");
    expect(a.calls()).not.toContain("docker load");
    const b = repo();
    const r5 = b.run({ FAKE_EDGE_RC: "5", FAKE_PROD_REV: b.git("rev-parse", "HEAD") });
    expect(r5.code).toBe(1);
    expect(r5.out).toContain("edge откатил");
    expect(b.calls()).not.toContain("systemctl");
    expect(b.calls()).not.toContain("tar -x");
    expect(b.calls()).not.toContain("docker load");
  });

  describe("edge", () => {
    it("только регистрация: без npm, сборки, бэкапа, образа и compose up; порядок register → снятие таймера → подмена deploy/", () => {
      const { root, git, run, calls } = repo();
      const rev = git("rev-parse", "HEAD");
      const r = run({ FAKE_PROD_REV: rev }, "edge");
      expect(r.code, r.out).toBe(0);
      expect(r.out).toContain(`✓ edge: heated-rivalry зарегистрирован в vps-edge (${rev.slice(0, 7)})`);
      const c = calls();
      for (const no of ["npm", "docker buildx", "docker save", "docker load", "backup", "compose up"]) expect(c).not.toContain(no);
      const lines = c.trim().split("\n");
      const at = (p: string) => lines.findIndex((l) => l.startsWith(p));
      const order = ["ssh edge-ready", "ssh /opt/vps-edge/bin/edge register heated-rivalry", "ssh systemctl disable --now heated-rivalry-edge.timer", "ssh set -e; D=/opt/heated-rivalry", "ssh systemctl list-unit-files"].map(at);
      expect(order.every((i) => i >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(edgeTar(root)).toEqual(["deploy/edge/site.caddy", "deploy/edge/tenant.conf"]);
      expect(shipped(root)).toEqual(["deploy/", "deploy/compose.yaml", "deploy/server-backup.sh"]);
      expect(c).not.toContain("heated-rivalry-backup");
    });

    it("edge=not-ready — отказ: ни регистрации, ни подмены", () => {
      const { run, calls } = repo();
      const r = run({ FAKE_EDGE_READY: "0" }, "edge");
      expect(r.code).toBe(1);
      expect(calls()).not.toContain("edge register");
      expect(calls()).not.toContain("tar -x");
    });

    it("edge register завершился кодом 5 — отказ: таймер не снят, deploy/ не подменён", () => {
      const { run, calls } = repo();
      const r = run({ FAKE_EDGE_RC: "5" }, "edge");
      expect(r.code).toBe(1);
      expect(calls()).not.toContain("systemctl");
      expect(calls()).not.toContain("tar -x");
    });

    it("edge exit 9 — выход с кодом 9, таймер не снят, deploy/ не подменён", () => {
      const { run, calls } = repo();
      const r = run({ FAKE_EDGE_RC: "9" }, "edge");
      expect(r.code).toBe(9);
      expect(r.out).toContain("КРИТИЧНО");
      expect(calls()).not.toContain("systemctl");
      expect(calls()).not.toContain("tar -x");
    });

    it("OFFLINE при коде 0 — отказ", () => {
      const { run, calls } = repo();
      const r = run({ FAKE_EDGE_STATUS: "OFFLINE" }, "edge");
      expect(r.code).toBe(1);
      expect(calls()).not.toContain("systemctl");
    });

    it("потеря ssh (255) — СОСТОЯНИЕ НЕИЗВЕСТНО", () => {
      const { run, calls } = repo();
      const r = run({ FAKE_EDGE_RC: "255" }, "edge");
      expect(r.code).toBe(1);
      expect(r.out).toContain("СОСТОЯНИЕ НЕИЗВЕСТНО");
      expect(calls()).not.toContain("tar -x");
    });

    it("контейнер приложения перезапускался — ошибка", () => {
      const { run } = repo();
      const r = run({ FAKE_STARTED_CHANGES: "1" }, "edge");
      expect(r.code).toBe(1);
      expect(r.out).toContain("перезапускался");
    });

    it("остались юниты heated-rivalry-edge* — ошибка", () => {
      const { run } = repo();
      const r = run({ FAKE_EDGE_UNITS: "2" }, "edge");
      expect(r.code).toBe(1);
      expect(r.out).toContain("остались юниты");
    });

    it("незапушенный коммит — отказ до любого ssh", () => {
      const { root, git, run, calls } = repo();
      writeFileSync(join(root, "work/new.txt"), "x");
      git("add", "-A");
      git("commit", "-qm", "local only");
      const r = run({}, "edge");
      expect(r.code).toBe(1);
      expect(r.out).toContain("незапушенных коммитов");
      expect(calls()).toBe("");
    });
  });

  it("status сравнивает локальную версию, GitHub и прод", () => {
    const { root, git, run } = repo();
    const rev = git("rev-parse", "HEAD");
    expect(run({ FAKE_PROD_REV: rev }, "status").out).toContain("✓ всё одной версии");
    expect(run({ FAKE_PROD_REV: "unknown" }, "status").out).toContain("≠ версии расходятся");
    writeFileSync(join(root, "work/new.txt"), "x");
    expect(run({ FAKE_PROD_REV: rev }, "status").out).toContain("незакоммиченных");
  });
});

describe("backup.sh", () => {
  const today = execFileSync("date", ["+%Y-%m-%d"], { encoding: "utf8" }).trim();
  const setup = (snapshot: "good" | "corrupt") => {
    const root = tmp();
    const f = fakeBin(root);
    const db = join(root, "snapshot.db");
    if (snapshot === "good") {
      const d = new DatabaseSync(db);
      d.exec("CREATE TABLE users (id INTEGER); INSERT INTO users VALUES (1); CREATE TABLE progress (user_id INTEGER); INSERT INTO progress VALUES (1);");
      d.close();
    } else writeFileSync(db, "это не база");
    script(join(f.bin, "ssh"), `cat "${db}"`); // «сервер» отдаёт снимок
    const dir = join(root, "backups");
    mkdirSync(dir);
    const run = () =>
      spawnSync(join(DEPLOY, "backup.sh"), [], {
        env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, HR_HOST: "x", HR_BACKUP_DIR: dir, HR_NOTIFY: "0" },
        encoding: "utf8",
      });
    return { dir, run };
  };

  it("снимок за сегодня + 2 самых свежих старых; лишние удалены", () => {
    const { dir, run } = setup("good");
    for (const d of ["2020-01-01", "2020-01-02", "2020-01-03", "2020-01-04"]) writeFileSync(join(dir, `auth-${d}.db`), "old");
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("пользователей: 1, с прогрессом: 1");
    expect(readdirSync(dir).sort()).toEqual(["auth-2020-01-03.db", "auth-2020-01-04.db", `auth-${today}.db`]);
  });

  it("второй запуск за день заменяет сегодняшнюю копию, не плодит новую", () => {
    const { dir, run } = setup("good");
    writeFileSync(join(dir, `auth-${today}.db`), "утренняя");
    expect(run().status).toBe(0);
    expect(readdirSync(dir)).toEqual([`auth-${today}.db`]);
    expect(readFileSync(join(dir, `auth-${today}.db`), "utf8")).not.toBe("утренняя");
  });

  it("битый снимок — ошибка, хорошие копии не тронуты, мусора нет", () => {
    const { dir, run } = setup("corrupt");
    for (const d of ["2020-01-01", "2020-01-02", "2020-01-03"]) writeFileSync(join(dir, `auth-${d}.db`), "old");
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("повреждена");
    expect(readdirSync(dir, { withFileTypes: false }).sort()).toEqual(["auth-2020-01-01.db", "auth-2020-01-02.db", "auth-2020-01-03.db"]);
  });
});

describe("deploy/edge", () => {
  it("Caddy пропускает прогресс того размера, что принимает сервер (иначе синхронизация молча встанет)", () => {
    const m = readFileSync(join(DEPLOY, "edge/site.caddy"), "utf8").match(/max_size\s+(\d+)(KB|MB)/);
    expect(m).not.toBeNull();
    const bytes = Number(m![1]) * (m![2] === "MB" ? 1024 * 1024 : 1024);
    expect(bytes).toBeGreaterThanOrEqual(STATE_MAX_BYTES);
  });

  it("проверки здоровья в tenant.conf — ровно две, как в миграционном bundle vps-edge", () => {
    const health = readFileSync(join(DEPLOY, "edge/tenant.conf"), "utf8")
      .split("\n")
      .filter((l) => l.startsWith("health="));
    expect(health).toEqual([
      "health=https://heated-rivalry-trainer.spill-the-tea.xyz/api/health 200",
      "health=https://heated-rivalry-trainer.spill-the-tea.xyz/login 200",
    ]);
  });
});

describe("server-backup.sh (на сервере)", () => {
  const today = execFileSync("date", ["+%Y-%m-%d"], { encoding: "utf8" }).trim();
  /** «Сервер»: docker отдаёт снимок (running — контейнер работает, иначе — одноразовым контейнером в /out). */
  const setup = (snapshot: "good" | "corrupt", running = true) => {
    const root = tmp();
    const db = join(root, "snapshot.db");
    if (snapshot === "good") {
      const d = new DatabaseSync(db);
      d.exec("CREATE TABLE users (id INTEGER); INSERT INTO users VALUES (1), (2);");
      d.close();
    } else writeFileSync(db, "это не база");
    const bin = join(root, "bin");
    mkdirSync(bin);
    const log = join(root, "docker.log");
    script(
      join(bin, "docker"),
      `echo "docker $*" >> "${log}"
case "$1" in
  inspect) [[ "$*" == *State.Running* ]] && echo "${running ? "true false" : "false true"}" || echo sha256:img ;;
  exec) [[ "$*" == *" cat "* ]] && cat "${db}" ;;
  run) for a in "$@"; do [[ "$a" == *:/out ]] && cp "${db}" "\${a%:/out}/auth.db"; done ;;
esac
exit 0`,
    );
    const dir = join(root, "backups");
    const run = () =>
      spawnSync(join(DEPLOY, "server-backup.sh"), [], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HR_BACKUP_DIR: dir, HR_BACKUP_KEEP: "3" }, encoding: "utf8" });
    return { dir, run, calls: () => readFileSync(log, "utf8") };
  };

  it("снимок за сегодня + 2 самых свежих старых; лишние удалены; папка закрыта от чужих", () => {
    const { dir, run } = setup("good");
    mkdirSync(dir);
    for (const d of ["2020-01-01", "2020-01-02", "2020-01-03", "2020-01-04"]) writeFileSync(join(dir, `auth-${d}.db`), "old");
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("пользователей: 2");
    expect(readdirSync(dir).sort()).toEqual(["auth-2020-01-03.db", "auth-2020-01-04.db", `auth-${today}.db`]);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("второй запуск за день заменяет сегодняшнюю копию", () => {
    const { dir, run } = setup("good");
    mkdirSync(dir);
    writeFileSync(join(dir, `auth-${today}.db`), "утренняя");
    expect(run().status).toBe(0);
    expect(readdirSync(dir)).toEqual([`auth-${today}.db`]);
    expect(readFileSync(join(dir, `auth-${today}.db`), "utf8")).not.toBe("утренняя");
  });

  it("битый снимок — ошибка, хорошие копии не тронуты, мусора нет", () => {
    const { dir, run } = setup("corrupt");
    mkdirSync(dir);
    for (const d of ["2020-01-01", "2020-01-02", "2020-01-03"]) writeFileSync(join(dir, `auth-${d}.db`), "good");
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("снимок повреждён");
    expect(readdirSync(dir).sort()).toEqual(["auth-2020-01-01.db", "auth-2020-01-02.db", "auth-2020-01-03.db"]);
  });

  it("контейнер лежит — снимок из тома одноразовым контейнером того же образа, без сети", () => {
    const { dir, run, calls } = setup("good", false);
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(readdirSync(dir)).toEqual([`auth-${today}.db`]);
    expect(calls()).toMatch(/docker run --rm --network none .*-v heated_rivalry_auth:\/data\/auth .*sha256:img/);
  });
});

