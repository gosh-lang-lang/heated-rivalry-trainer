#!/bin/bash
# Выкатка на прод — только этим скриптом и только того, что уже лежит на GitHub.
#   deploy/deploy.sh          проверки → бэкап → выкатка коммита origin/main → проверка, что прод на нём
#   deploy/deploy.sh status   какие версии сейчас: локальная, GitHub, прод
# Выкатывается ровно origin/main: его отдельная чистая копия (git worktree) проходит typecheck / unit / e2e,
# из неё же собирается архив. Незакоммиченное в рабочей папке (в том числе правки параллельных сессий)
# на прод не попадает и выкатку не блокирует. Не выкатит, если в локальном main есть незапушенные коммиты
# (значит, на GitHub ещё не то, что задумано) или проверки красные.
# На проде в образе остаётся метка коммита (org.opencontainers.image.revision); unknown — собрали в обход скрипта.
# Переменные: HR_HOST (root@195.133.197.130).
set -euo pipefail
HOST="${HR_HOST:-root@195.133.197.130}"
SITE="https://heated-rivalry-trainer.spill-the-tea.xyz"
IP="${HOST#*@}"   # проверяем сам сервер, не завися от DNS-кэша роутера
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

prod_rev() {
  ssh -o ConnectTimeout=10 "$HOST" \
    'docker inspect heated-rivalry --format "{{with index .Config.Labels \"org.opencontainers.image.revision\"}}{{.}}{{else}}unknown{{end}} {{.State.Health.Status}}" 2>/dev/null || echo "нет-контейнера -"'
}

if [[ "${1:-}" == "status" ]]; then
  git fetch -q origin main
  local_rev=$(git rev-parse HEAD); gh_rev=$(git rev-parse origin/main)
  read -r p_rev p_health <<<"$(prod_rev)"
  dirty=$(git status --porcelain | wc -l | tr -d ' ')
  printf 'локально  %s %s\n' "${local_rev:0:7}" "$( [[ $dirty == 0 ]] && echo '(чисто)' || echo "(+ $dirty незакоммиченных файлов)")"
  printf 'GitHub    %s\n' "${gh_rev:0:7}"
  printf 'прод      %s (%s)\n' "${p_rev:0:7}" "$p_health"
  [[ $dirty == 0 && $local_rev == "$gh_rev" && $p_rev == "$gh_rev" ]] && echo "✓ всё одной версии" || echo "≠ версии расходятся"
  exit 0
fi
[[ $# -eq 0 ]] || fail "неизвестный аргумент: $1 (есть только status)"

say "Что выкатываем: origin/main"
git fetch -q origin main
REV=$(git rev-parse origin/main)
ahead=$(git rev-list --count origin/main..main 2>/dev/null || echo 0)
[[ "$ahead" == 0 ]] || fail "в локальном main $ahead незапушенных коммитов — сначала git push"
echo "коммит ${REV:0:7}: $(git log -1 --format=%s "$REV")"
dirty=$(git status --porcelain | wc -l | tr -d ' ')
[[ "$dirty" == 0 ]] || echo "в рабочей папке $dirty незакоммиченных файлов — на прод они не попадут"

say "Проверки чистой копии коммита: typecheck, unit, e2e"
WT="$(mktemp -d)/src"
trap 'git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; git -C "$ROOT" worktree prune' EXIT
git worktree add -q --detach "$WT" "$REV"
# зависимости — копия node_modules рабочей папки (на APFS мгновенно), если lock-файл тот же; иначе — npm ci
if [[ -d app/node_modules ]] && cmp -s app/package-lock.json "$WT/app/package-lock.json"; then
  cp -Rc app/node_modules "$WT/app/" 2>/dev/null || cp -R app/node_modules "$WT/app/"
else
  npm --prefix "$WT/app" ci --no-audit --no-fund
fi
npm --prefix "$WT/app" run -s typecheck
npm --prefix "$WT/app" test --silent
E2E_PORT=5190 E2E_FRESH=1 npm --prefix "$WT/app" run -s e2e -- --reporter=dot

say "Бэкап базы с прода"
"$ROOT/deploy/backup.sh"

say "Выкатка ${REV:0:7}"
git archive "$REV" | ssh "$HOST" 'set -e; rm -rf /opt/heated-rivalry/src.new; mkdir -p /opt/heated-rivalry/src.new
  tar -x -C /opt/heated-rivalry/src.new; rm -rf /opt/heated-rivalry/src; mv /opt/heated-rivalry/src.new /opt/heated-rivalry/src'
ssh "$HOST" "cd /opt/heated-rivalry/src/deploy && APP_VERSION=$REV docker compose up -d --build --quiet-pull"

say "Проверка прода"
for _ in $(seq 1 40); do
  read -r p_rev p_health <<<"$(prod_rev)"
  [[ "$p_health" == "healthy" ]] && break
  sleep 3
done
[[ "$p_rev" == "$REV" ]] || fail "на проде $p_rev, ожидали $REV"
[[ "$p_health" == "healthy" ]] || fail "контейнер не здоров: $p_health (docker logs heated-rivalry)"
code=$(curl -s -o /dev/null -w '%{http_code}' --resolve "${SITE#https://}:443:$IP" "$SITE/api/health")
[[ "$code" == "200" ]] || fail "$SITE/api/health ответил $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: text/html' --resolve "${SITE#https://}:443:$IP" "$SITE/")
[[ "$code" == "302" ]] || fail "без входа / должен отдавать 302 на /login, а отдал $code"
printf '\n\033[32m✓ прод на %s\033[0m\n' "${REV:0:7}"
