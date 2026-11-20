# Деплой на VPS

Сервер: Docker, общий Caddy проекта spillthetea (`spillthetea-caddy-1`, порты 80/443, Let's Encrypt HTTP-01).
Проект живёт в `/opt/heated-rivalry`, код — в `/opt/heated-rivalry/src` (копия репозитория без `.git`).

- Контейнер `heated-rivalry` (порт 8787 только внутри сети `heated_rivalry_edge`, сеть `internal` — без интернета).
- Модель Kokoro зашита в образ, кэш озвучки — том `heated_rivalry_tts`.
- Caddy подключается к сети таймером `heated-rivalry-edge.timer` (файлы spillthetea/motivator не меняются).
- Сайт — помеченный блок в `/opt/spillthetea/caddy/Caddyfile` (текст — `deploy/caddy-site.conf`).
- **Вход только по passkey.** Регистрации нет: пользователей и одноразовые ссылки привязки создаёт команда на сервере.
  База входа — том `heated_rivalry_auth` (`/data/auth/auth.db`).

## Пользователи и passkey
```sh
H="docker exec heated-rivalry node --disable-warning=ExperimentalWarning server/cli.ts"
$H user:add evgeny Евгений      # создать пользователя
$H enroll evgeny 60             # одноразовая ссылка привязки passkey (60 минут)
$H users                        # пользователи, сколько passkey и сессий
$H passkeys evgeny              # привязанные passkey
$H passkey:remove <начало id>   # отозвать passkey (потерянное устройство)
$H logout evgeny                # завершить все сессии
```
Passkey из связки ключей iCloud синхронизируется на все устройства с тем же Apple ID — привязывать каждое не нужно.

## Обновить
```sh
# с ноутбука, из корня репозитория
git archive HEAD | ssh root@195.133.197.130 'rm -rf /opt/heated-rivalry/src.new && mkdir -p /opt/heated-rivalry/src.new && tar -x -C /opt/heated-rivalry/src.new && rm -rf /opt/heated-rivalry/src && mv /opt/heated-rivalry/src.new /opt/heated-rivalry/src'
ssh root@195.133.197.130 'cd /opt/heated-rivalry/src/deploy && docker compose up -d --build'
```

## Подключить домен
После DNS-записи `A heated-rivalry-trainer → 195.133.197.130`: `/opt/heated-rivalry/src/deploy/caddy-install.sh`
(сам проверит, что DNS уже указывает на сервер; если нет — ничего не меняет). Откат: `caddy-install.sh --remove`.

## Закрыть сайт целиком (аварийно)
В блоке heated-rivalry в Caddyfile заменить `encode`/`reverse_proxy` на `respond 500`, затем `caddy-reload.sh`.

## Откатить
`caddy-install.sh --remove`; `systemctl disable --now heated-rivalry-edge.timer`;
`docker compose -f /opt/heated-rivalry/src/deploy/compose.yaml down` (том с кэшем озвучки — `docker volume rm heated_rivalry_tts`).
