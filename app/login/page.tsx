"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/browser";

export default function LoginPage() {
  const configured = hasSupabasePublicEnv();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setMessage("");

    if (!configured) {
      setMessage("Supabase не настроен. Добавь NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в переменные окружения Vercel.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        setMessage("Не вошло. Проверь логин и пароль.");
        return;
      }

      // A real navigation after a successful form submit also gives browser
      // password managers a clear signal that the submitted credentials worked.
      window.location.assign("/app");
    } catch {
      setMessage("Не удалось подключиться к серверу. Попробуй ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="loginShell">
      <form className="loginCard" onSubmit={submit} autoComplete="on">
        <div className="brandMark">₸</div>
        <h1>Финансовый дневник</h1>
        <p>Личный вход по логину и паролю. Данные закрыты Supabase Auth и RLS.</p>

        <label htmlFor="login-email">
          Логин / email
          <input
            id="login-email"
            name="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>

        <label htmlFor="login-password">
          Пароль
          <input
            id="login-password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        <button className="primaryBtn" type="submit" disabled={!configured || submitting}>
          {submitting ? "Вход..." : "Войти"}
        </button>

        <Link className="loginLink" href="/forgot-password">
          Забыли пароль?
        </Link>

        {!configured && (
          <div className="loginMessage">
            Для входа добавь NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в Environment Variables проекта Vercel.
          </div>
        )}
        {message && <div className="loginMessage">{message}</div>}
      </form>
    </main>
  );
}
