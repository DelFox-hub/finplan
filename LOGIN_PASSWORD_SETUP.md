# Вход логин/пароль

Magic link убран.

## Как создать логин и пароль

1. Supabase → Authentication → Users.
2. Нажми `Add user`.
3. Введи свой email.
4. Задай пароль.
5. Подтверди/создай пользователя.
6. Этот же email укажи:
   - в SQL `REPLACE_WITH_YOUR_EMAIL@example.com`;
   - в Vercel env `ALLOWED_EMAIL`.

## Как зайти

После деплоя:

```txt
https://твой-сайт.vercel.app/login
```

Вводишь email + пароль.

## Защита

Данные закрыты двумя уровнями:

1. Серверная проверка `ALLOWED_EMAIL`.
2. RLS в Supabase: строки доступны только `auth.uid()` владельца и только если email совпадает с `app_config.allowed_email`.

## Сброс пароля

В Supabase открой `Authentication → URL Configuration` и добавь в `Redirect URLs`:

```txt
https://твой-сайт.vercel.app/login
```

Для локальной проверки при необходимости:

```txt
http://localhost:3000/login
```

Сброс работает на той же странице входа:

1. `Забыли пароль?` — форма ввода email открывается без перехода на отдельный экран.
2. Supabase отправляет письмо.
3. Ссылка возвращает на `/login?mode=recovery`.
4. Та же страница входа показывает поля нового пароля.
5. После сохранения открывается `/app`.

Старые ссылки на `/auth/recovery` сохранены для совместимости и автоматически переводят на новую форму.
