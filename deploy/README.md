# Деплой на VPS

Сервер: Docker, общий Caddy проекта spillthetea (`spillthetea-caddy-1`, порты 80/443, Let's Encrypt HTTP-01).
Проект живёт в `/opt/heated-rivalry`, код — в `/opt/heated-rivalry/src` (копия репозитория без `.git`).

- Контейнер `heated-rivalry` (порт 8787 только внутри сети `heated_rivalry_edge`, сеть `internal` — без интернета).
- Модель Kokoro зашита в образ, кэш озвучки — том `heated_rivalry_tts`.
- Модель оценки произношения (wav2vec2, фонемы espeak, int8 ~320 МБ) тоже зашита в образ. Работает отдельным процессом
  внутри контейнера (`server/pron-worker.ts`) **по требованию**: приложение будит его в начале занятия с говорением
  (`POST /api/pron/warm`), после 10 минут без записей он выключается — в покое память как без оценки. При нехватке памяти
  ядро убивает первым его (`oom_score_adj` 1000), а не сервер. Записи голоса не сохраняются.
  Лимит памяти контейнера — `APP_MEM_LIMIT`, по умолчанию 2304m (было 1536m: 2026-11-21 Kokoro fp32 + оценка при старте
  не уместились, контейнер перезапускался по OOM). Хост — 3,9 ГБ, остальные контейнеры ~0,9 ГБ.
  Проверить: `ssh root@195.133.197.130 'docker stats --no-stream heated-rivalry'`. Отключить оценку — `PRON_DISABLED=1`
  в `compose.yaml` (задания «Скажи» тогда пишут «оценка недоступна» и пропускаются).
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
$H progress                     # чей прогресс на сервере, когда изменён и сохранён
$H progress:reset evgeny        # сбросить прогресс (слова, дни, предложения), настройки оставить; устройства его не вернут. Сначала deploy/backup.sh
```
Passkey из связки ключей iCloud синхронизируется на все устройства с тем же Apple ID — привязывать каждое не нужно.

## Бэкапы
Раз в день мак забирает с сервера согласованную копию базы (`VACUUM INTO` внутри контейнера) в `~/Backups/heated-rivalry/`
— **одна копия на день** (`auth-ГГГГ-ММ-ДД.db`; повторный запуск в тот же день заменяет её свежей) — и хранит **3 последних дня**:
появилась копия за 4-й день — самая старая удаляется. Каждая копия проверяется (`integrity_check`) до ротации.
Если не вышло — уведомление на маке и запись в `~/Library/Logs/heated-rivalry-backup.log`.
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
deploy/deploy.sh          # origin/main → его чистая копия: typecheck, unit, e2e → бэкап → выкатка → проверка
deploy/deploy.sh status   # версии: локально / GitHub / прод (метка коммита в образе)
```
Выкатывается ровно `origin/main`; проверки идут на его отдельной копии (git worktree), из неё же собирается архив.
Незакоммиченное в рабочей папке на прод не попадает. Скрипт откажется, если в локальном main есть незапушенные коммиты
или падает хоть один тест. Образ помечен коммитом (`org.opencontainers.image.revision`); `unknown` на проде — собрали
в обход скрипта. Руками (`git archive … | ssh`, `docker compose up --build` на сервере) не выкатываем.

## Подключить домен
После DNS-записи `A heated-rivalry-trainer → 195.133.197.130`: `/opt/heated-rivalry/src/deploy/caddy-install.sh`
(сам проверит, что DNS уже указывает на сервер; если нет — ничего не меняет). Откат: `caddy-install.sh --remove`.

## Закрыть сайт целиком (аварийно)
В блоке heated-rivalry в Caddyfile заменить `encode`/`reverse_proxy` на `respond 500`, затем `caddy-reload.sh`.

## Откатить
`caddy-install.sh --remove`; `systemctl disable --now heated-rivalry-edge.timer`;
`docker compose -f /opt/heated-rivalry/src/deploy/compose.yaml down` (том с кэшем озвучки — `docker volume rm heated_rivalry_tts`).
