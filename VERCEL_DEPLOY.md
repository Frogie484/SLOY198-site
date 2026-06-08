# Развёртывание на Vercel

1. Подключите к проекту приватное хранилище Vercel Blob.
   - Для нового OIDC-подключения достаточно `BLOB_STORE_ID`; `VERCEL_OIDC_TOKEN` Vercel предоставляет функции автоматически.
   - Старое подключение через `BLOB_READ_WRITE_TOKEN` также поддерживается.
   - `BLOB_WEBHOOK_PUBLIC_KEY` используется для проверки webhook-подписей и не требуется операциям `get()`/`put()`.
2. В Environment Variables добавьте:
   - `ADMIN_LOGIN`
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET` — длинная случайная строка для подписи cookie.
3. Выполните новый deployment.

Если логин и пароль не заданы, временно используются:

```text
admin
sloy198-change-me
```

Расписание и заявки сохраняются в приватном Blob `sloy198/private/schedule.json`.
Локальная команда `npm run dev` продолжает использовать `data/schedule.json`.
