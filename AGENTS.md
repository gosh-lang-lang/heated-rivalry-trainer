# AGENTS.md — Heated Rivalry vocabulary trainer

Onboarding for planner, implementer and reviewer agents. Read this first; open other files only for the part you change.
Owner-facing text and human documentation are in Russian; this file and CLAUDE.md are English.

## Language rule
**Agent files (AGENTS.md, CLAUDE.md) are written in English; human documentation stays in Russian and is not rewritten by agents.**
Human docs: README.md, deploy/README.md, docs/CHANGELOG.md, PROJECT_BRIEF.md, FEEDBACK.md. Commits are in Russian.

## Purpose
A PWA word trainer (English vocabulary from the "Heated Rivalry" story): spaced repetition, lessons, rewards, word art,
neural TTS (Kokoro) on our own server. Passkey-only login, no sign-up. Progress lives on the server (SQLite), the browser
holds only a cache. Hosted at https://heated-rivalry-trainer.spill-the-tea.xyz on the shared VPS.
The repo (gosh-lang-lang/heated-rivalry-trainer) belongs to another GitHub org than the owner's other projects: when working
from a sibling project's session, change only what the task names (edge integration for the vps-edge move).

## Human docs (do not retell, do not rewrite, link only)
- `PROJECT_BRIEF.md` — project description, data model, plan, how things work now; section 6 "Tests" says what is verified where.
- `docs/CHANGELOG.md` — dated log of changes and user decisions, newest first.
- `deploy/README.md` — server layout, users/passkeys CLI, backups and restore, update, rollback, domain, emergency close.
- `FEEDBACK.md` — observations from real use.
- `README.md` — repo entry point for people.

## Rules of work (all former CLAUDE.md rules, translated)
1. **Documentation is part of the task.** If behavior, data model, a user decision or the deploy setup changed, in the same
   commit: add a dated entry on top of docs/CHANGELOG.md (what and why); if the way the system works changed, fix the
   description in PROJECT_BRIEF.md (no history there); if it concerns the server, fix deploy/README.md.
2. **Tests are part of the task.** New logic in `app/src/core` or `app/server` gets a unit test next to it (`*.test.ts`);
   a new UI scenario gets an e2e test in `app/e2e`. Before committing run
   `npm --prefix app run typecheck && npm --prefix app test && npm --prefix app run e2e`.
   Unit coverage: `npx --prefix app vitest run --coverage` (cli.ts, the Kokoro worker thread, auth.ts and index.ts show 0%
   there: they are exercised by subprocesses and by e2e `auth.spec.ts`, which the counter cannot see).
   What is checked where: PROJECT_BRIEF.md, section 6, "Tests".
3. **Production only via `deploy/deploy.sh`.** It ships exactly `origin/main`: runs typecheck/unit/e2e on a clean copy of that
   commit (git worktree), builds the image from it **on the Mac**, takes a backup, and sends to the server only the image
   (`docker save | ssh docker load`) and the runtime files, no sources; nothing is built on the server. Uncommitted work in the
   folder (including parallel sessions' edits) does not reach prod; unpushed commits in local main make it refuse.
   Never deploy by hand. Versions local / GitHub / prod: `deploy/deploy.sh status`. On every push to main GitHub runs the
   checks itself (`.github/workflows/ci.yml`).
4. **Other sessions may work in the same folder in parallel.** Commit only your own files (`git add <files>`, never
   `git add -A`); do not touch or revert others' uncommitted changes.
5. **Commits are in Russian**, one per finished change; push to `origin main` before deploying.
6. **Run locally:** `npm --prefix app run server` (API and TTS, :8787) and `npm --prefix app run dev` (Vite, :5173, proxies
   /api). Without passkeys locally: `AUTH_DEV_BYPASS=1 npm --prefix app run server` logs in as user `dev` (does not work in production).

Cross-project owner rules (the host is shared):
- Do not commit or push unless the orchestrator/owner says so. Planners write plans only: no builds or containers while planning.
- Verify from a clean clone of HEAD (or a copy of `git ls-files -co --exclude-standard`), not from the working folder: an
  unanchored .gitignore rule once hid a source package in a sibling project and the deploy shipped without it.
- Never print secret values (.env contents, tokens, credentials); name keys only.

## Repo map
- `app/` — everything buildable. `app/src/` React client: `core/` pure logic + unit tests (srs, lesson, session, cards,
  achievements, serverday, ratelimit, word-art, voices...), `screens/`, `login/`, `lib/` (WordArt.tsx), `*.css`, `data.ts`
  (imports `../../words.json`). `app/server/` Node server (no framework): `index.ts` (HTTP, static, health), `auth.ts` +
  `auth-store.ts` (passkeys, sessions, SQLite), `progress.ts` (server-side progress and lesson day), `tts*.ts` + `mp3.ts`
  + `warm.ts` (Kokoro in a worker thread, cache, queue), `cli.ts` (admin CLI), `*.test.ts` incl. `deploy-scripts.test.ts`
  (tests deploy.sh/backup scripts with stubbed ssh/npm). `app/e2e/` Playwright. `app/public/words/<word>/*.webp` word art.
  `app/scripts/word-art.ts` art generation. `app/login.html`, `app/art.html`, `app/index.html` entry pages.
- `app/Dockerfile` — multi-stage, built from the repo root (`-f app/Dockerfile .`); bakes the Kokoro model into the image.
- `deploy/` — `deploy.sh`, `compose.yaml`, edge files (`caddy-site.conf`, `caddy-install.sh`, `caddy-reload.sh`,
  `edge-connect.sh`, `heated-rivalry-edge.{service,timer}`), backups (`backup.sh`, `backup-install.sh`, `server-backup.sh`,
  `heated-rivalry-backup.{service,timer}`), `README.md`.
- `design/` — mockups and the ChatGPT brief (reference only). `docs/` — CHANGELOG.md. `words.json` — the single source of words.
- `.claude/launch.json` — dev server configs (`app` :5173, `server` :8787).

## Stack and versions
Node 22 (CI and image: node:22-bookworm-slim), ESM TypeScript (`typescript` ^7, `tsc --noEmit`), the server runs `.ts`
directly via `node server/index.ts` (type stripping; `--disable-warning=ExperimentalWarning`). React ^19, Vite ^8,
vite-plugin-pwa, Vitest ^5 (unit), Playwright ^1.65 (e2e), `@simplewebauthn/{server,browser}` ^14, `kokoro-js` (model
`onnx-community/Kokoro-82M-v1.0-ONNX`, fp32, CPU), `@breezystack/lamejs` (MP3), `sharp`. Storage: SQLite (`/data/auth/auth.db`).
`onnxruntime-node` must not download CUDA: `npm_config_onnxruntime_node_install_cuda=skip` (set in CI and Dockerfile).
Server env: `PORT` (8787), `AUTH_DB`, `AUTH_ORIGIN`, `AUTH_DEV_BYPASS`, `DEFAULT_TZ` (Europe/Moscow), `TTS_CACHE_DIR`,
`TTS_DTYPE`, `TTS_RATE_LIMIT`, `TTS_MAX_QUEUE`, `TTS_DISABLED`, `TTS_WARM`; Vite proxy target `API_PORT`.

## Commands (run from the repo root; deps: `npm --prefix app ci`)
- Typecheck: `npm --prefix app run typecheck` (seconds).
- Unit: `npm --prefix app test` (vitest run). Includes `server/tts-worker.test.ts`, which needs the Kokoro model in
  `app/node_modules/@huggingface/transformers/.cache` (~330 MB, downloaded on first run; CI caches it).
- E2E: `npm --prefix app run e2e` (all Playwright projects); one project: `npx --prefix app playwright test --project=iphone`.
  Projects: `desktop-chrome`, `iphone` (WebKit), `auth` (production build, passkey via virtual authenticator, own server and DB
  per test, depends on `auth-build`). Port via `E2E_PORT` (default 5174); `E2E_FRESH=1` forces a fresh dev server.
  `/api/tts` is mocked, time is frozen at 2026-11-20 09:00 MSK. Full local run takes minutes; on a single CI machine it was ~25 min,
  hence the per-project matrix. Tests rely on button texts, roles, aria-labels, ids `chk`/`next`, `data-say`: keep them on redesign.
- Coverage: `npx --prefix app vitest run --coverage`. Build: `npm --prefix app run build`.
- There is no lint tool in this repo; `typecheck` is the static check.
- Durations are not measured here; prod image build on the Mac is ~2 min (per deploy/README.md).

## CI and monitor (.github/workflows)
- `ci.yml` "CI": on push to main, on every PR, and manual. Jobs: `unit` (typecheck + `npm test`, 20 min cap) and `e2e`
  matrix `desktop-chrome`/chromium, `iphone`/webkit, `auth`/chromium (30 min cap, `CI` mode: retries 2, test timeout 90 s,
  playwright report uploaded on failure). Red run = GitHub email. Concurrency cancels superseded runs per ref.
- `uptime.yml` "Прод жив": cron every 15 min (+manual): curls `/api/health` and `/login` on the prod URL, 3 tries each, 20 s apart;
  fails unless both are 200. GitHub pauses scheduled workflows after 60 days without commits.

## Deploy and server
- The only shipping path is `deploy/deploy.sh` (`status` subcommand compares local/GitHub/prod revision). Flow: fetch
  origin/main, refuse on unpushed local commits, worktree of that commit, typecheck+unit+e2e (`E2E_PORT=5190 E2E_FRESH=1`),
  `docker buildx build --platform linux/amd64` on the Mac (colima) tagged `heated-rivalry:<commit>` with
  `org.opencontainers.image.revision`, `deploy/backup.sh`, ship `RUNTIME` files and the image, `docker compose up -d --no-build
  --pull never`, wait for healthy, check `/api/health`=200 and `/`=302 (to `/login`), keep current + one previous image.
- `RUNTIME` (the only deploy files that reach the server, in `deploy.sh`): `compose.yaml edge-connect.sh caddy-site.conf
  caddy-install.sh caddy-reload.sh server-backup.sh`. Adding a file to `deploy/` that the server needs means extending `RUNTIME`.
- Server: root@195.133.197.130 (shared VPS, Ubuntu 24.04, 3 vCPU, ~3.8 GiB RAM; check `df -h /` before big steps), project in
  `/opt/heated-rivalry`, container `heated-rivalry`, mem 1536m / 1.5 CPU, network `heated_rivalry_edge` (internal), volumes
  `heated_rivalry_auth` (SQLite: users, passkeys, sessions, progress) and `heated_rivalry_tts` (voice cache).
  Prod `DEFAULT_TZ` falls back to Europe/Moscow; lesson days are computed by the server (`core/serverday.ts`).
- Server CLI (users, passkeys, progress):
  `docker exec heated-rivalry node --disable-warning=ExperimentalWarning server/cli.ts <cmd>` with `user:add <login> <name>`,
  `enroll <login> <minutes>`, `users`, `passkeys <login>`, `passkey:remove <id prefix>`, `sessions <login>`, `logout <login>`,
  `progress`, `progress:reset <login>` (run `deploy/backup.sh` first). Details: deploy/README.md.
- **Backups that must never be lost:** the `heated_rivalry_auth` volume holds all user progress. Two copies: server
  (`heated-rivalry-backup.timer`, 03:30 daily, `/opt/heated-rivalry/backups/`, 14 days) and Mac (`deploy/backup.sh`, launchd via
  `backup-install.sh` at 04:00, `~/Backups/heated-rivalry/`, one per day, 3 days). Never `docker volume rm` it, never recreate it;
  take `deploy/backup.sh` before any risky step. Restore procedure: deploy/README.md.
- Shared-VPS rules: nothing is built on the VPS; never prune or remove other projects' images, volumes, networks or containers
  (only our own `heated-rivalry:*` tags, by name); never run a global `docker system prune`. Other tenants: spillthetea,
  motivator, vps-health, vps-mail, vps-edge.

## Edge (as of 2026-11-22, until the vps-edge cutover)
- Caddy is the container `spillthetea-caddy-1` from the spillthetea project (80/443, Let's Encrypt HTTP-01, TLS-ALPN disabled).
  `deploy.sh` does not touch Caddy. `deploy/caddy-install.sh` appends/replaces the marked block from `deploy/caddy-site.conf`
  (`# >>> heated-rivalry site block ... <<<`) in `/opt/spillthetea/caddy/Caddyfile` (single-file bind), after checking that DNS
  already points at the server, backs up to `Caddyfile.bak.heated-rivalry`, reloads, reverts on error. `--remove` rolls back.
  `caddy-reload.sh` just reloads. Run `caddy-install.sh` on the server after changing `caddy-site.conf`.
- `heated-rivalry-edge.timer` (every 60 s) runs `edge-connect.sh`, which attaches `spillthetea-caddy-1` to `heated_rivalry_edge`
  if the connection was lost (Caddy recreation drops it). `request_body max_size` (3MB) must stay >= server `STATE_MAX_BYTES` (2 MB);
  a test in `deploy-scripts.test.ts` checks it.
- **Planned:** move Caddy into the vps-edge project (repo flattened-duck/vps-edge, local ~/dev/vps-edge, server /opt/vps-edge).
  This repo becomes a tenant: `site.caddy` + `tenant.conf` registered via `/opt/vps-edge/bin/edge register heated-rivalry`
  (validate, graceful reload, health compare, auto-revert), a `deploy.sh edge` subcommand, the edge timer retired and
  `caddy-*`/`edge-connect.sh` removed. Specification: `~/dev/vps-edge/docs/stages/stage2-4-tenants-contract.md`, stage 4
  (section 5). Not applied yet; the 80/443 cutover needs an explicit owner yes. Edge-only commits may go straight to main
  (reviewed first, applied on the VPS at once). Do not hand-edit the edge files beyond that contract.

## Gotchas
- Docs in this repo are Russian; match their style when the rules above require a docs update, but never rewrite them wholesale.
- `deploy.sh` ships `origin/main`, not your working tree: push first. Unpushed commits block it.
- A `deploy-scripts.test.ts` suite guards deploy.sh/backup.sh (stub ssh/npm); changing those scripts means updating it.
- e2e tests share frozen time and a seeded `Math.random`; `auth` project is separate and builds production, so it is slow.
- Lesson days are server-side per user timezone (`state.tz`); do not compute "today" on the client for progress.
- Auth: cookie `__Host-hr_session`, Origin checked on POST, post-login redirect only to own paths (`/\` bypass closed).
  Tokens stored as SHA-256 only. Do not weaken without a test in `auth.spec.ts`.
- Image has no sources and no dev deps; the server imports `app/src/core` (copied into the image) and `/srv/words.json`.
- The container network is internal (no internet); the model must stay baked in the image.
