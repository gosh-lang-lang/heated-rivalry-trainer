#!/bin/bash
# Бэкап базы на самом сервере — вторая копия к ежедневной на маке (deploy/backup.sh): если мак выключен или в отъезде,
# копии всё равно есть. Снимок auth.db (пользователи, passkey, сессии, прогресс) раз в день в $DIR/auth-ГГГГ-ММ-ДД.db,
# хранит KEEP последних дней. Запускает таймер heated-rivalry-backup.timer (deploy/README.md), можно и руками.
# От потери диска не спасает — для этого копия на маке.
# Переменные: HR_BACKUP_DIR (/opt/heated-rivalry/backups), HR_BACKUP_KEEP (14).
set -euo pipefail
DIR="${HR_BACKUP_DIR:-/opt/heated-rivalry/backups}"
KEEP="${HR_BACKUP_KEEP:-14}"

log() { echo "$(date '+%F %T') $*"; }
fail() { log "ОШИБКА: $*" >&2; exit 1; }

mkdir -p "$DIR"
chmod 700 "$DIR" # в базе — сессии и ключи входа
umask 077
day=$(date +%Y-%m-%d)
part="$DIR/.auth-$day.$$.part"
out=$(mktemp -d)
trap 'rm -rf "$part" "$out"' EXIT

# согласованный снимок (база в режиме WAL — простое копирование файла может поймать её посреди записи)
js='const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync("/data/auth/auth.db");
  db.prepare("VACUUM INTO ?").run(process.env.F);
  db.close();'
if [ "$(docker inspect -f '{{.State.Running}} {{.State.Restarting}}' heated-rivalry 2>/dev/null)" = "true false" ]; then
  f=/tmp/hr-server-backup-$$.db
  docker exec -e F="$f" heated-rivalry node --disable-warning=ExperimentalWarning -e "$js"
  docker exec heated-rivalry cat "$f" >"$part"
  docker exec heated-rivalry rm -f "$f" >/dev/null 2>&1 || true
else
  log "контейнер не работает — снимок из тома heated_rivalry_auth"
  image=$(docker inspect -f '{{.Image}}' heated-rivalry)
  docker run --rm --network none -u 0 -e F=/out/auth.db -v heated_rivalry_auth:/data/auth -v "$out":/out \
    --entrypoint node "$image" --disable-warning=ExperimentalWarning -e "$js"
  cat "$out/auth.db" >"$part"
fi

# проверка до ротации: битый снимок не должен вытеснить хорошие (sqlite3 на сервере нет — python3 есть)
check=$(python3 - "$part" <<'PY'
import sqlite3, sys
try:
    c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
    ok = c.execute("PRAGMA integrity_check").fetchone()[0]
    users = c.execute("SELECT count(*) FROM users").fetchone()[0]
    print(f"{ok} {users}")
except Exception as e:
    print(f"error {e}")
PY
)
read -r status users <<<"$check"
[ "$status" = ok ] || fail "снимок повреждён или без таблицы users: $check"

final="$DIR/auth-$day.db"
mv -f "$part" "$final"
ls -1 "$DIR"/auth-????-??-??.db | sort -r | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do
  rm -f -- "$old"
  log "удалена старая копия $(basename "$old")"
done
log "готово: $(basename "$final"), $(du -h "$final" | cut -f1), пользователей: $users; копий: $(ls -1 "$DIR"/auth-????-??-??.db | wc -l)"
