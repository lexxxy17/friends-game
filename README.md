# Friends Game — архитектура (Supabase + Telegram Mini Apps)

Три приложения:
- API (Node.js, Express) — `api/server` (порт по умолчанию 4000)
- Клиент (ученик) — React/Vite `apps/student` (+ Telegram WebApp SDK)
- Админка (преподаватель) — React/Vite `apps/admin`

Данные в Supabase (Postgres + Storage). SQL-схема: `supabase/schema.sql`.

## Запуск локально

1) Настройте переменные окружения:

Создайте `api/server/.env`:
```
API_PORT=4000
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_KEY=dev-admin
BOT_TOKEN=...            # опционально, для уведомлений
TEACHER_CHAT_ID=...      # опционально
```

2) Установите зависимости и запустите:

```bash
# API
cd api/server && npm i && npm start

# Ученик
cd ../../apps/student && npm i && npm run dev

# Админка
cd ../admin && npm i && npm run dev
```

3) Откройте:
- API: http://localhost:4000/health
- Ученик: http://localhost:5173
- Админка: http://localhost:5174

В React-приложениях можно задать `VITE_API_URL` и `VITE_ADMIN_KEY` в `.env` файлах.

## Supabase

- Примените `supabase/schema.sql` (SQL Editor).
- Создайте storage bucket `images` (public).

Таблицы: `words`, `packs`, `pack_words`, `students`, `assignments`, `reports`.

## Telegram Mini App

- Добавьте в @BotFather webapp URL для ученика и админки (при продахостинге).
- В ученике используется заголовок `x-telegram-initdata` (WebApp.initData) для авто-создания студента.

## Примечание

В корне остался предыдущий прототип на JSON-файлах (`server.js`, `public/*`). Он больше не нужен и будет удалён при миграции на Supabase/React полностью, оставлен для сравнения на время разработки.