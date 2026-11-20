/**
 * Скрипты деплоя (deploy/*.sh) — без сервера: ssh, npm и curl подменены записывающими заглушками.
 *   deploy.sh — выкатывает ровно origin/main (проверяет его чистую копию), ничего с красными тестами.
 *   backup.sh — проверяет копию до ротации, хранит KEEP последних дней.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

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
    `if [[ "$*" == *"docker inspect"* ]]; then echo "\${FAKE_PROD_REV:-unknown} healthy"; exit 0; fi
if [[ "\${@: -1}" == *"tar -x"* ]]; then cat > "${root}/shipped.tar"; else cat > /dev/null; fi
echo "ssh $(echo "\${@: -1}" | tr '\\n' ' ')" >> "${log}"`,
  );
  script(join(bin, "curl"), `if [[ "$*" == *api/health* ]]; then echo 200; else echo 302; fi`);
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

  const shipped = (root: string) => execFileSync("tar", ["-tf", join(root, "shipped.tar")], { encoding: "utf8" }).trim().split("\n").sort();

  it("всё на GitHub и тесты зелёные: проверки чистой копии → бэкап → выкатка этого коммита → проверка прода", () => {
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
    expect(lines.slice(4).map((l) => l.split(" ")[0])).toEqual(["backup", "ssh", "ssh"]);
    expect(lines[6]).toContain(`APP_VERSION=${rev} docker compose up -d --build`);
    expect(shipped(root)).toEqual(["deploy/", "deploy/backup.sh", "deploy/deploy.sh"]);
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
    const r = run({ FAKE_PROD_REV: rev });
    expect(r.code).toBe(0);
    expect(shipped(root)).not.toContain("feature.txt");
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
