import { createBrowserClient } from "@supabase/ssr";

const FALLBACK_URL = "https://placeholder.supabase.co";
const FALLBACK_KEY = "build-placeholder-anon-key";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function hasSupabasePublicEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

export function createClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || FALLBACK_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || FALLBACK_KEY;

  // A harmless placeholder is used only so static compilation/prerendering can
  // complete without deployment secrets. Real auth/data access is blocked in
  // the UI until both NEXT_PUBLIC variables are configured.
  browserClient = createBrowserClient(url, key);
  return browserClient;
}
