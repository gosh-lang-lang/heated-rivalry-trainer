#!/bin/bash
# Бэкап базы с VPS на этот мак: пользователи, passkey, сессии и прогресс (/data/auth/auth.db в контейнере).
# Хранит KEEP последних копий, более старые удаляет. Запускается раз в день (backup-install.sh), можно и руками.
#   deploy/backup.sh
# Переменные: HR_HOST (root@195.133.197.130), HR_BACKUP_DIR (~/Backups/heated-rivalry), HR_BACKUP_KEEP (3).
# Восстановить: см. deploy/README.md, раздел «Бэкапы».
set -euo pipefail
HOST="${HR_HOST:-root@195.133.197.130}"
DIR="${HR_BACKUP_DIR:-$HOME/Backups/heated-rivalry}"
KEEP="${HR_BACKUP_KEEP:-3}"

log() { echo "$(date '+%F %T') $*"; }
fail() {
  log "ОШИБКА: $*" >&2
  osascript -e "display notification \"$*\" with title \"Бэкап Heated Rivalry не удался\"" >/dev/null 2>&1 || true
  exit 1
}

mkdir -p "$DIR"
stamp=$(date +%Y-%m-%d_%H%M%S)
part="$DIR/.auth-$stamp.db.part"
trap 'rm -f "$part"' EXIT

# Согласованный снимок через VACUUM INTO внутри контейнера: база в режиме WAL, и простое копирование файла
# может поймать её посреди записи. Снимок идёт в stdout ssh и сразу удаляется на сервере.
snapshot() {
  ssh -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 "$HOST" 'bash -s' >"$part" <<'REMOTE'
set -euo pipefail
f=/tmp/hr-backup-$$.db
trap 'docker exec heated-rivalry rm -f "$f" >/dev/null 2>&1 || true' EXIT
docker exec -e F="$f" heated-rivalry node --disable-warning=ExperimentalWarning -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync("/data/auth/auth.db");
  db.prepare("VACUUM INTO ?").run(process.env.F);
  db.close();'
docker exec heated-rivalry cat "$f"
REMOTE
}

# после сна мака сеть поднимается не сразу — три попытки
for try in 1 2 3; do
  if snapshot 2>"$part.err"; then break; fi
  err=$(tail -n 3 "$part.err" | tr '\n' ' ')
  [ "$try" = 3 ] && { rm -f "$part.err"; fail "не удалось снять копию с $HOST: $err"; }
  log "попытка $try не удалась ($err), повтор через минуту"
  sleep 60
done
rm -f "$part.err"

# копию проверяем до ротации: битый файл не должен вытеснить хорошие
[ "$(sqlite3 "$part" 'PRAGMA integrity_check;' 2>&1)" = "ok" ] || fail "снятая копия повреждена"
users=$(sqlite3 "$part" 'SELECT count(*) FROM users;' 2>/dev/null) || fail "в копии нет таблицы users"
progress=$(sqlite3 "$part" 'SELECT count(*) FROM progress;' 2>/dev/null || echo "—")

final="$DIR/auth-$stamp.db"
mv "$part" "$final"

# ротация: имена с датой сортируются по времени, оставляем KEEP самых новых
ls -1 "$DIR"/auth-*.db | sort -r | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do
  rm -f -- "$old"
  log "удалена старая копия $(basename "$old")"
done

log "готово: $(basename "$final"), $(du -h "$final" | cut -f1 | tr -d ' '), пользователей: $users, с прогрессом: $progress; копий: $(ls -1 "$DIR"/auth-*.db | wc -l | tr -d ' ')"
