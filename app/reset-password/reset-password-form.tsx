"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setMessage("");

    if (password !== confirmPassword) {
      setMessage("Пароли не совпадают.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessage("Не удалось изменить пароль. Проверь требования к паролю или запроси новую ссылку.");
        return;
      }

      window.location.replace("/app");
    } catch {
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
            required
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
            required
          />
        </label>

        <button className="primaryBtn" type="submit" disabled={submitting}>
          {submitting ? "Сохранение..." : "Сохранить пароль"}
        </button>

        {message && <div className="loginMessage">{message}</div>}
      </form>
    </main>
  );
}
