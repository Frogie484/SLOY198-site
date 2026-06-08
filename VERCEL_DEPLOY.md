# Развёртывание на Vercel

1. Подключите к проекту приватное хранилище Vercel Blob.
   - Для нового OIDC-подключения достаточно `BLOB_STORE_ID`; `VERCEL_OIDC_TOKEN` Vercel предоставляет функции автоматически.
   - Старое подключение через `BLOB_READ_WRITE_TOKEN` также поддерживается.
   - `BLOB_WEBHOOK_PUBLIC_KEY` используется для проверки webhook-подписей и не требуется операциям `get()`/`put()`.
2. В Environment Variables добавьте:
   - `ADMIN_LOGIN`
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET` — длинная случайная строка для подписи cookie.
   - `EDUCATION_SESSION_SECRET` — отдельная длинная строка для cookie доступа к курсам.
   - `ENABLE_TEST_COURSE_ACCESS=true` — только если публичный тестовый доступ нужен на production.
3. Выполните новый deployment.

Если логин и пароль не заданы, временно используются:

```text
admin
sloy198-change-me
```

Расписание, заявки, курсы, уроки, пользователи и покупки сохраняются в приватном Blob
`sloy198/private/schedule.json`.
Видео сохраняются отдельно в `sloy198/private/courses/...` и выдаются клиенту только
через короткоживущие подписанные URL после проверки доступа.

Для будущего подключения ЮKassa предусмотрены переменные:

- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`

После deployment проверьте:

1. Вход в `/admin`.
2. Создание опубликованного курса и урока.
3. Загрузку MP4, WebM или MOV в private Vercel Blob.
4. Выдачу тестового доступа из админки по ID пользователя.
5. Воспроизведение урока на `/education.html`.

Локальная команда `npm run dev` продолжает использовать `data/schedule.json`.
