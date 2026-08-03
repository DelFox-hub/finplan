"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");


    if (mode === "magic") {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo }
      });

      setMessage(error ? error.message : "Письмо для входа отправлено. Проверь почту.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.href = "/app";
  }

  return (
    <main className="loginShell">
      <form className="loginCard" onSubmit={submit}>
        <div className="brandMark">₸</div>
        <h1>Финансовый дневник</h1>
        <p>Личный вход. Данные хранятся в Supabase и закрыты RLS-политиками.</p>

        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>

        <div className="loginModes">
          <button type="button" className={mode === "magic" ? "active" : ""} onClick={() => setMode("magic")}>
            Magic link
          </button>
          <button type="button" className={mode === "password" ? "active" : ""} onClick={() => setMode("password")}>
            Пароль
          </button>
        </div>

        {mode === "password" && (
          <label>
            Пароль
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          </label>
        )}

        <button className="primaryBtn" type="submit">
          Войти
        </button>

        {message && <div className="loginMessage">{message}</div>}
      </form>
    </main>
  );
}
