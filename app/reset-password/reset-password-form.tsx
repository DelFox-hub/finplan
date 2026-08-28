"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      setCheckingSession(false);
      setHasSession(Boolean(data.session) && !error);
      if (error || !data.session) {
        setMessage("Сессия восстановления не найдена. Запроси новую ссылку на email.");
      }
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !hasSession) return;

    setMessage("");

    if (password.length < 6) {
      setMessage("Пароль должен содержать не меньше 6 символов.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Пароли не совпадают.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        console.error("Supabase password update error:", error);
        setMessage(`Не удалось изменить пароль: ${error.message}`);
        return;
      }

      window.location.replace("/app");
    } catch (err) {
      console.error("Password update failed:", err);
      setMessage("Не удалось изменить пароль. Проверь подключение и попробуй ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="loginShell">
      <form className="loginCard" onSubmit={submit} autoComplete="on">
        <div className="brandMark">₸</div>
        <h1>Новый пароль</h1>
        <p>Задай новый пароль для финансового дневника.</p>

        <label htmlFor="new-password">
          Новый пароль
          <input
            id="new-password"
            name="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            disabled={checkingSession || !hasSession}
          />
        </label>

        <label htmlFor="confirm-password">
          Повторите пароль
          <input
            id="confirm-password"
            name="confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            disabled={checkingSession || !hasSession}
          />
        </label>

        <button className="primaryBtn" type="submit" disabled={checkingSession || !hasSession || submitting}>
          {checkingSession ? "Проверка ссылки..." : submitting ? "Сохранение..." : "Сохранить пароль"}
        </button>

        {!checkingSession && !hasSession && (
          <Link className="loginLink" href="/forgot-password">
            Запросить новую ссылку
          </Link>
        )}

        {message && <div className="loginMessage">{message}</div>}
      </form>
    </main>
  );
}
