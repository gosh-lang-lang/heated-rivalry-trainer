#!/bin/bash
# Выкатка на прод — только этим скриптом и только того, что уже лежит на GitHub.
#   deploy/deploy.sh          проверки → бэкап → выкатка коммита origin/main → проверка, что прод на нём
#   deploy/deploy.sh status   какие версии сейчас: локальная, GitHub, прод
# Не выкатит, если: не ветка main, есть незакоммиченные или неотправленные изменения,
# не проходят typecheck / unit / e2e. На проде в образе остаётся метка коммита
# (org.opencontainers.image.revision); unknown — значит собрали в обход скрипта.
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

say "Git: всё закоммичено и отправлено на GitHub"
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || fail "выкатываем только ветку main"
[[ -z "$(git status --porcelain)" ]] || { git status --short; fail "есть незакоммиченные изменения — сначала коммит и push"; }
git fetch -q origin main
REV=$(git rev-parse HEAD)
[[ "$REV" == "$(git rev-parse origin/main)" ]] || fail "локальный main и GitHub расходятся — сначала git push (или git pull)"
echo "коммит ${REV:0:7}: $(git log -1 --format=%s)"

say "Проверки: typecheck, unit, e2e"
npm --prefix app run -s typecheck
npm --prefix app test --silent
npm --prefix app run -s e2e -- --reporter=dot

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
