"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient, hasSupabasePublicEnv } from "@/lib/supabase/browser";

type View = "login" | "forgot" | "recovery";

export default function LoginPage() {
  const configured = hasSupabasePublicEnv();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(false);

  useEffect(() => {
    if (!configured) return;

    const url = new URL(window.location.href);
    const requestedMode = url.searchParams.get("mode");

    if (requestedMode === "forgot") {
      setView("forgot");
      return;
    }

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hasRecoveryPayload = Boolean(
      url.searchParams.get("code")
      || url.searchParams.get("token_hash")
      || hashParams.get("access_token")
      || requestedMode === "recovery"
    );

    if (!hasRecoveryPayload) return;

    setView("recovery");
    setCheckingRecovery(true);
    setMessage("Проверяю ссылку восстановления…");

    let cancelled = false;

    async function prepareRecovery() {
      const supabase = createClient();
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const otpType = url.searchParams.get("type") as EmailOtpType | null;
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      try {
        let error: { message: string } | null = null;

        if (code) {
          const result = await supabase.auth.exchangeCodeForSession(code);
          error = result.error;
        } else if (tokenHash && otpType) {
          const result = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          error = result.error;
        } else if (accessToken && refreshToken) {
          const result = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          error = result.error;
        } else {
          const { data, error: sessionError } = await supabase.auth.getSession();
          error = sessionError;
          if (!error && !data.session) {
            error = { message: "Сессия восстановления не найдена." };
          }
        }

        if (cancelled) return;

        if (error) {
          console.error("Supabase recovery error:", error);
          setRecoveryReady(false);
          setMessage("Ссылка недействительна или уже истекла. Запроси новую ссылку.");
          return;
        }

        window.history.replaceState({}, document.title, "/login?mode=recovery");
        setRecoveryReady(true);
        setMessage("");
      } catch (err) {
        if (cancelled) return;
        console.error("Recovery callback failed:", err);
        setRecoveryReady(false);
        setMessage("Не удалось проверить ссылку восстановления. Запроси новую ссылку.");
      } finally {
        if (!cancelled) setCheckingRecovery(false);
      }
    }

    void prepareRecovery();

    return () => {
      cancelled = true;
    };
  }, [configured]);

  async function submitLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setMessage("");

    if (!configured) {
      setMessage("Supabase не настроен. Добавь переменные окружения в Vercel.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage("Не вошло. Проверь логин и пароль.");
        return;
      }

      window.location.assign("/app");
    } catch {
      setMessage("Не удалось подключиться к серверу. Попробуй ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitForgot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setMessage("");

    if (!configured) {
      setMessage("Supabase не настроен.");
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage("Укажи email.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/login?mode=recovery`;
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });

      if (error) {
        console.error("Supabase password recovery error:", error);
        if (error.code === "over_email_send_rate_limit" || error.status === 429) {
          setMessage("Лимит писем Supabase исчерпан. Попробуй позже.");
        } else {
          setMessage(`Не удалось отправить письмо: ${error.message}`);
        }
        return;
      }

      setMessage("Ссылка для смены пароля отправлена на email.");
    } catch (err) {
      console.error("Password recovery request failed:", err);
      setMessage("Не удалось отправить письмо. Попробуй ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNewPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || checkingRecovery || !recoveryReady) return;

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
      setMessage("Не удалось изменить пароль. Попробуй ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  function openLogin() {
    setView("login");
    setPassword("");
    setConfirmPassword("");
    setMessage("");
    setRecoveryReady(false);
    window.history.replaceState({}, document.title, "/login");
  }

  function openForgot() {
    setView("forgot");
    setPassword("");
    setConfirmPassword("");
    setMessage("");
    window.history.replaceState({}, document.title, "/login?mode=forgot");
  }

  if (view === "forgot") {
    return (
      <main className="loginShell">
        <form className="loginCard" onSubmit={submitForgot} autoComplete="on">
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
            />
          </label>

          <button className="primaryBtn" type="submit" disabled={!configured || submitting}>
            {submitting ? "Отправка..." : "Отправить ссылку"}
          </button>

          <button className="loginLink loginLinkButton" type="button" onClick={openLogin}>
            Вернуться ко входу
          </button>

          {message && <div className="loginMessage">{message}</div>}
        </form>
      </main>
    );
  }

  if (view === "recovery") {
    return (
      <main className="loginShell">
        <form className="loginCard" onSubmit={submitNewPassword} autoComplete="on">
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
              disabled={checkingRecovery || !recoveryReady}
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
              disabled={checkingRecovery || !recoveryReady}
            />
          </label>

          <button
            className="primaryBtn"
            type="submit"
            disabled={checkingRecovery || !recoveryReady || submitting}
          >
            {checkingRecovery ? "Проверка ссылки..." : submitting ? "Сохранение..." : "Сохранить пароль"}
          </button>

          {!checkingRecovery && !recoveryReady && (
            <button className="loginLink loginLinkButton" type="button" onClick={openForgot}>
              Запросить новую ссылку
            </button>
          )}

          {message && <div className="loginMessage">{message}</div>}
        </form>
      </main>
    );
  }

  return (
    <main className="loginShell">
      <form className="loginCard" onSubmit={submitLogin} autoComplete="on">
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

        <button className="loginLink loginLinkButton" type="button" onClick={openForgot}>
          Забыли пароль?
        </button>

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
