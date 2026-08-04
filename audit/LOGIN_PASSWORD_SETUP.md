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
