"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      setMessage("Не вошло. Проверь логин/пароль или создай пользователя в Supabase Auth.");
      return;
    }

    window.location.href = "/app";
  }

  return (
    <main className="loginShell">
      <form className="loginCard" onSubmit={submit}>
        <div className="brandMark">₸</div>
        <h1>Финансовый дневник</h1>
        <p>Личный вход по логину и паролю. Данные закрыты Supabase Auth и RLS.</p>

        <label>
          Логин / email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            required
          />
        </label>

        <label>
          Пароль
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        <button className="primaryBtn" type="submit">
          Войти
        </button>

        {message && <div className="loginMessage">{message}</div>}
      </form>
    </main>
  );
}
