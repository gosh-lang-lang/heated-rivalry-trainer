# Heated Rivalry — тренажёр слов

Описание проекта, модель данных, план и статус — **[PROJECT_BRIEF.md](PROJECT_BRIEF.md)** (единственный документ о проекте).
Сервер и выкатка — [deploy/README.md](deploy/README.md). Наблюдения из использования — [FEEDBACK.md](FEEDBACK.md).

## Правила работы
- **Документация — часть задачи.** Изменилось поведение, модель данных, решение пользователя или устройство
  деплоя — в том же коммите обновить PROJECT_BRIEF.md (раздел 6 «Статус», с датой) и, если касается сервера, deploy/README.md.
- **Тесты — часть задачи.** Новая логика в `app/src/core` или `app/server` — unit-тест рядом (`*.test.ts`);
  новый сценарий в интерфейсе — e2e в `app/e2e`. Перед коммитом: `npm --prefix app run typecheck && npm --prefix app test && npm --prefix app run e2e`.
  Покрытие unit-тестами: `npx --prefix app vitest run --coverage` (cli.ts, поток Kokoro, auth.ts и index.ts там 0% —
  их проверяют подпроцессы и e2e `auth.spec.ts`, которые счётчик не видит).
  Что где проверяется — PROJECT_BRIEF.md, раздел 6, «Тесты».
- **На прод — только `deploy/deploy.sh`.** Он выкатывает ровно `origin/main`: проверяет typecheck/unit/e2e на чистой копии
  этого коммита (git worktree), делает бэкап, собирает из неё же. Незакоммиченное в папке (в том числе правки параллельных
  сессий) на прод не попадает; незапушенные коммиты в main — отказ. Руками (`git archive | ssh`, `docker compose up --build`
  на сервере) не выкатывать. Версии локально / GitHub / прод: `deploy/deploy.sh status`.
- **В папке могут параллельно работать другие сессии.** Коммить только свои файлы (`git add <файлы>`, не `git add -A`),
  чужие незакоммиченные правки не трогать и не откатывать.
- Коммиты — на русском, по одному на законченное изменение; push в `origin main` перед выкаткой.

## Запуск локально
`npm --prefix app run server` (API и озвучка, :8787) и `npm --prefix app run dev` (Vite, :5173, проксирует /api).
Без passkey локально: `AUTH_DEV_BYPASS=1 npm --prefix app run server` — вход как пользователь `dev` (в production не работает).
