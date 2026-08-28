"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const configured = hasSupabasePublicEnv();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || sent) return;

    setMessage("");

    if (!configured) {
      setMessage("Supabase не настроен.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const cleanEmail = email.trim();
      if (!cleanEmail) {
        setMessage("Укажи email.");
        return;
      }

      const redirectTo = `${window.location.origin}/auth/recovery`;
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });

      if (error) {
        console.error("Supabase password recovery error:", {
          message: error.message,
          status: error.status,
          code: error.code,
        });
        const details = [
          error.message,
          error.code ? `code: ${error.code}` : "",
          error.status ? `status: ${error.status}` : "",
        ].filter(Boolean).join(" · ");
        setMessage(`Supabase: ${details}`);
        return;
      }

      setSent(true);
      setMessage("Если этот email привязан к дневнику, ссылка для смены пароля отправлена на него.");
    } catch (err) {
      console.error("Password recovery request failed:", err);
      setMessage(
        err instanceof Error
          ? `Ошибка запроса: ${err.message}`
          : "Не удалось отправить письмо из-за неизвестной ошибки."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="loginShell">
      <form className="loginCard" onSubmit={submit} autoComplete="on">
        <div className="brandMark">₸</div>
        <h1>Сброс пароля</h1>
        <p>Укажи email от финансового дневника.</p>

        <label htmlFor="recovery-email">
          Email
          <input
            id="recovery-email"
            name="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            disabled={sent}
          />
        </label>

        <button className="primaryBtn" type="submit" disabled={!configured || submitting || sent}>
          {submitting ? "Отправка..." : sent ? "Письмо отправлено" : "Отправить ссылку"}
        </button>

        <Link className="loginLink" href="/login">
          Вернуться ко входу
        </Link>

        {message && <div className="loginMessage">{message}</div>}
      </form>
    </main>
  );
}
