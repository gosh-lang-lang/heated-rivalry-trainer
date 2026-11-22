# Деплой на VPS

Сервер: Docker, общий Caddy проекта spillthetea (`spillthetea-caddy-1`, порты 80/443, Let's Encrypt HTTP-01).
Проект живёт в `/opt/heated-rivalry`. **Исходников и сборки на сервере нет:** образ собирается на маке (`deploy/deploy.sh`)
и приходит готовым (`docker save | zstd | ssh docker load`). На сервере только то, что нужно для работы:
- образы `heated-rivalry:<коммит>` — текущий (он же `:latest`) и один предыдущий, для отката;
- `/opt/heated-rivalry/deploy/` — `compose.yaml`, `edge-connect.sh`, `caddy-site.conf`, `caddy-install.sh`, `caddy-reload.sh`,
  `server-backup.sh` (список — `RUNTIME` в `deploy.sh`); юниты systemd — в `/etc/systemd/system/heated-rivalry-*`;
- `/opt/heated-rivalry/backups/` — ежедневные копии базы на сервере (см. «Бэкапы»);
- тома `heated_rivalry_auth` (база) и `heated_rivalry_tts` (кэш озвучки).

- Контейнер `heated-rivalry` (порт 8787 только внутри сети `heated_rivalry_edge`, сеть `internal` — без интернета).
- Модель Kokoro зашита в образ, кэш озвучки — том `heated_rivalry_tts`.
- Caddy подключается к сети таймером `heated-rivalry-edge.timer` (файлы spillthetea/motivator не меняются).
- Сайт — помеченный блок в `/opt/spillthetea/caddy/Caddyfile` (текст — `deploy/caddy-site.conf`).
- **Вход только по passkey.** Регистрации нет: пользователей и одноразовые ссылки привязки создаёт команда на сервере.
  База — том `heated_rivalry_auth` (`/data/auth/auth.db`): пользователи, passkey, сессии **и прогресс** (таблица `progress`).
  Прогресс живёт на сервере, браузер держит только кэш — **этот том терять нельзя**, см. «Бэкапы».

## Пользователи и passkey
```sh
H="docker exec heated-rivalry node --disable-warning=ExperimentalWarning server/cli.ts"
$H user:add evgeny Евгений      # создать пользователя
$H enroll evgeny 60             # одноразовая ссылка привязки passkey (60 минут)
$H users                        # пользователи, сколько passkey и сессий
$H passkeys evgeny              # привязанные passkey
$H passkey:remove <начало id>   # отозвать passkey (потерянное устройство)
$H sessions evgeny              # где выполнен вход: устройство, когда вошёл, когда был в сети
$H logout evgeny                # завершить все сессии (по одному устройству — в приложении: Настройки → Вход)
$H progress                     # чей прогресс на сервере, когда изменён и сохранён, часовой пояс уроков
$H progress:reset evgeny        # сбросить прогресс (слова и дни), настройки оставить; устройства его не вернут. Сначала deploy/backup.sh
```
Passkey из связки ключей iCloud синхронизируется на все устройства с тем же Apple ID — привязывать каждое не нужно.

**Дни уроков считает сервер** — по своим часам (часы контейнера = часы VPS) и часовому поясу пользователя
(`state.tz`, `app/src/core/serverday.ts`). Пояс сервер берёт с устройства при первой синхронизации; меняет его сам
пользователь в приложении (Настройки → Занятия → «Часовой пояс уроков»), не чаще раза в сутки. Пока пояса нет
(старая версия приложения в кэше) — `DEFAULT_TZ` из окружения контейнера, по умолчанию `Europe/Moscow`.
Пояс виден в `$H progress`.

**Сюжеты наград:** необязательное `cardSubject` в результате части 2 хранится и синхронизируется вместе
с прогрессом. Общий `core/state.ts → parseState` при чтении старой копии фиксирует прежние сюжеты завершённых
уроков, не меняя результаты, даты и связи слов. Новые награды связываются с номером урока; `core/curriculum.ts`
задаёт общие границы сезонов и переноса для клиента и сервера. SQL-миграции и ручные изменения базы не нужны.

## Бэкапы
Две независимые копии: на сервере (переживёт выключенный мак) и на маке (переживёт потерю сервера).

**На сервере:** `heated-rivalry-backup.timer` каждый день в 03:30 запускает `/opt/heated-rivalry/deploy/server-backup.sh` —
снимок той же `VACUUM INTO` в `/opt/heated-rivalry/backups/auth-ГГГГ-ММ-ДД.db` (папка только для root), проверка
`integrity_check` до ротации, хранит **14 дней**. Журнал: `journalctl -u heated-rivalry-backup`.
```sh
systemctl start heated-rivalry-backup          # снять копию сейчас
systemctl list-timers heated-rivalry-backup    # когда следующий
# установка (один раз): юниты из deploy/ → /etc/systemd/system, затем systemctl daemon-reload && systemctl enable --now heated-rivalry-backup.timer
```
Восстановить из серверной копии — как ниже, только `F` уже на сервере: `cat /opt/heated-rivalry/backups/auth-….db | docker run …`.

**На маке:** раз в день мак забирает с сервера согласованную копию базы (`VACUUM INTO` внутри контейнера) в `~/Backups/heated-rivalry/`
— **одна копия на день** (`auth-ГГГГ-ММ-ДД.db`; повторный запуск в тот же день заменяет её свежей) — и хранит **3 последних дня**:
появилась копия за 4-й день — самая старая удаляется. Каждая копия проверяется (`integrity_check`) до ротации.
Если не вышло — уведомление на маке и запись в `~/Library/Logs/heated-rivalry-backup.log`.
Контейнер не работает (упал, перезапускается по кругу) — копия снимается из тома `heated_rivalry_auth` одноразовым
контейнером на том же образе: иначе лежащий прод нельзя было бы и починить, `deploy.sh` начинается с бэкапа.
```sh
deploy/backup.sh                    # снять копию сейчас (перед рискованным деплоем — обязательно)
deploy/backup-install.sh            # задача launchd: каждый день в 04:00 (проспал — сделает после пробуждения)
deploy/backup-install.sh --remove   # убрать задачу
launchctl kickstart gui/$(id -u)/xyz.spill-the-tea.heated-rivalry.backup   # запустить задачу сейчас
```
Восстановить из копии:
```sh
F=~/Backups/heated-rivalry/auth-….db
ssh root@195.133.197.130 'docker stop heated-rivalry'
cat "$F" | ssh root@195.133.197.130 'docker run --rm -i -v heated_rivalry_auth:/data/auth alpine sh -c "rm -f /data/auth/auth.db-wal /data/auth/auth.db-shm && cat > /data/auth/auth.db && chown 1000:1000 /data/auth/auth.db"'
ssh root@195.133.197.130 'docker start heated-rivalry'
```

## Обновить
**Только скриптом** и только то, что уже на GitHub:
```sh
deploy/deploy.sh          # origin/main → чистая копия: typecheck, unit, e2e → сборка образа на маке → бэкап → образ на сервер → проверка
deploy/deploy.sh status   # версии: локально / GitHub / прод (метка коммита в образе)
```
Выкатывается ровно `origin/main`; проверки идут на его отдельной копии (git worktree), из неё же на маке собирается образ
`heated-rivalry:<коммит>` под `linux/amd64` (Docker на маке — colima; сборка ~2 минуты). На сервер уходят образ
(`docker save | zstd | ssh docker load`) и файлы `RUNTIME`; запуск — `docker compose up --no-build --pull never`.
После проверки скрипт оставляет на сервере и на маке текущий и один предыдущий образ, остальные удаляет.
Незакоммиченное в рабочей папке на прод не попадает. Скрипт откажется, если в локальном main есть незапушенные коммиты,
падает хоть один тест или не собрался образ. Образ помечен коммитом (`org.opencontainers.image.revision`);
`unknown` на проде — собрали в обход скрипта. На сервере ничего не собираем.

**Проверки до выкатки — на GitHub:** `.github/workflows/ci.yml` прогоняет typecheck, unit и e2e на каждый push в `main`
и каждый PR; красный — письмо от GitHub. **Прод жив?** — `.github/workflows/uptime.yml` каждые 15 минут проверяет
`/api/health` и `/login` снаружи; упал — письмо (уведомления о неудачных workflow включены в настройках GitHub по умолчанию).

**Откат на предыдущую версию** (образ ещё на сервере):
```sh
ssh root@195.133.197.130 'docker image ls heated-rivalry'     # текущий и предыдущий, теги — коммиты
ssh root@195.133.197.130 'cd /opt/heated-rivalry/deploy && TAG=<предыдущий коммит> docker compose up -d --no-build --pull never'
```

## Подключить домен
После DNS-записи `A heated-rivalry-trainer → 195.133.197.130`: `/opt/heated-rivalry/deploy/caddy-install.sh`
(сам проверит, что DNS уже указывает на сервер; если нет — ничего не меняет). Откат: `caddy-install.sh --remove`.

## Изменился `deploy/caddy-site.conf`
`deploy.sh` Caddy не трогает. После выкатки — `/opt/heated-rivalry/deploy/caddy-install.sh` (заменит помеченный блок
и перезагрузит Caddy; при ошибке вернёт прежний). Предел тела запроса (`max_size`) — не ниже `STATE_MAX_BYTES`
сервера (2 МБ), иначе синхронизация прогресса молча встанет, когда он перерастёт предел.

## Закрыть сайт целиком (аварийно)
В блоке heated-rivalry в Caddyfile заменить `encode`/`reverse_proxy` на `respond 500`, затем `caddy-reload.sh`.

## Откатить
`caddy-install.sh --remove`; `systemctl disable --now heated-rivalry-edge.timer`;
`docker compose -f /opt/heated-rivalry/deploy/compose.yaml down`; `systemctl disable --now heated-rivalry-backup.timer` (том с кэшем озвучки — `docker volume rm heated_rivalry_tts`).
