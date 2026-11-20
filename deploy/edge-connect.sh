#!/bin/sh
# Держит общий Caddy подключённым к сети приложения (после пересоздания контейнера Caddy подключение теряется).
# Запускается таймером heated-rivalry-edge.timer раз в минуту. Ничего не делает, если всё уже подключено.
set -eu
NET=heated_rivalry_edge
CADDY=spillthetea-caddy-1
docker network inspect "$NET" >/dev/null 2>&1 || exit 0
docker inspect "$CADDY" >/dev/null 2>&1 || exit 0
if ! docker inspect -f '{{json .NetworkSettings.Networks}}' "$CADDY" | grep -q "\"$NET\""; then
  docker network connect "$NET" "$CADDY"
  echo "connected $CADDY to $NET"
fi
