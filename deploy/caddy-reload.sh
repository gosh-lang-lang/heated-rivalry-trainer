#!/bin/sh
# Проверить и применить Caddyfile spillthetea без перезапуска контейнера (остальные сайты не прерываются).
set -eu
docker exec spillthetea-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec spillthetea-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
