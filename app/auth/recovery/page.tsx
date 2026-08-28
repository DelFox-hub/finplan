"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

export default function RecoveryCallbackPage() {
  const [message, setMessage] = useState("Проверяю ссылку восстановления…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function completeRecovery() {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const otpType = url.searchParams.get("type") as EmailOtpType | null;
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      try {
        let error: { message: string } | null = null;

        // PKCE callback: Supabase redirects back with ?code=...
        if (code) {
          const result = await supabase.auth.exchangeCodeForSession(code);
          error = result.error;
        }
        // SSR-friendly custom email templates may send token_hash + type.
        else if (tokenHash && otpType) {
          const result = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          error = result.error;
        }
        // Default Supabase recovery links can return the authenticated session
        // in the URL fragment. A server Route Handler cannot read this fragment,
        // so it must be consumed in the browser.
        else if (accessToken && refreshToken) {
          const result = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          error = result.error;
        }
        // In some browser flows supabase-js has already consumed the callback.
        else {
          const { data, error: sessionError } = await supabase.auth.getSession();
          error = sessionError;
          if (!error && !data.session) {
            error = { message: "В ссылке восстановления нет действующей сессии." };
          }
        }

        if (cancelled) return;

        if (error) {
          console.error("Supabase recovery callback error:", error);
          setFailed(true);
          setMessage("Ссылка восстановления недействительна или уже истекла. Запроси новую ссылку.");
          return;
        }

        // Remove recovery tokens from the address bar before continuing.
        window.history.replaceState({}, document.title, "/auth/recovery");
        window.location.replace("/reset-password");
      } catch (err) {
        if (cancelled) return;
        console.error("Recovery callback failed:", err);
        setFailed(true);
        setMessage("Не удалось проверить ссылку восстановления. Запроси новую ссылку.");
      }
    }

    void completeRecovery();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="loginShell">
      <div className="loginCard">
        <div className="brandMark">₸</div>
        <h1>Восстановление пароля</h1>
        <p>{message}</p>
        {failed && (
          <Link className="loginLink" href="/forgot-password">
            Запросить новую ссылку
          </Link>
        )}
      </div>
    </main>
  );
}
