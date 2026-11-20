#!/bin/sh
# Добавить блок сайта в общий Caddyfile spillthetea и применить его — только если DNS уже указывает на этот сервер
# (иначе Caddy сразу пойдёт за сертификатом, получит отказ и потратит лимит попыток Let's Encrypt).
#   caddy-install.sh           — добавить/обновить блок
#   caddy-install.sh --remove  — убрать блок (откат)
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
CADDYFILE=/opt/spillthetea/caddy/Caddyfile
DOMAIN=heated-rivalry-trainer.spill-the-tea.xyz
BEGIN='# >>> heated-rivalry site block'
END='# <<< heated-rivalry site block <<<'

strip_block() { awk -v b="$BEGIN" -v e="$END" 'index($0,b)==1{skip=1} !skip{print} index($0,e)==1{skip=0}' "$CADDYFILE"; }

cp "$CADDYFILE" "$CADDYFILE.bak.heated-rivalry"
if [ "${1:-}" = "--remove" ]; then
  strip_block > "$CADDYFILE.new"
else
  ME=$(curl -fsS4 --max-time 5 https://api.ipify.org || true)
  DNS=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')
  if [ -z "$ME" ] || [ "$DNS" != "$ME" ]; then
    echo "DNS ещё не готов: $DOMAIN → '${DNS:-нет записи}', сервер — '${ME:-?}'. Блок не добавлен." >&2
    exit 2
  fi
  { strip_block; printf '\n'; cat "$HERE/caddy-site.conf"; } > "$CADDYFILE.new"
fi
# файл смонтирован в контейнер как bind-mount одного файла: переписываем содержимое, а не заменяем inode
cat "$CADDYFILE.new" > "$CADDYFILE" && rm "$CADDYFILE.new"
if ! "$HERE/caddy-reload.sh"; then
  echo "Caddy не принял конфиг — возвращаю прежний" >&2
  cat "$CADDYFILE.bak.heated-rivalry" > "$CADDYFILE"
  "$HERE/caddy-reload.sh" || true
  exit 1
fi
echo "Готово: блок $DOMAIN ${1:+удалён}${1:-применён}"
