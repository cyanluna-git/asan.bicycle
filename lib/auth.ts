import { supabase } from "@/lib/supabase";

function normalizeAppUrl(value: string | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getConfiguredAppUrl() {
  return normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL);
}

export function getAuthRedirectUrl(currentUrl?: string) {
  const configuredAppUrl = getConfiguredAppUrl();
  const fallbackCurrentUrl =
    currentUrl ?? (typeof window !== "undefined" ? window.location.href : undefined);

  if (!fallbackCurrentUrl) {
    return configuredAppUrl;
  }

  try {
    const current = new URL(fallbackCurrentUrl);

    if (!configuredAppUrl) {
      return current.toString();
    }

    return new URL(
      `${current.pathname}${current.search}${current.hash}`,
      `${configuredAppUrl}/`,
    ).toString();
  } catch {
    return configuredAppUrl ?? fallbackCurrentUrl;
  }
}

export async function signInWithGoogle() {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
}

export async function signInWithKakao() {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: "profile_nickname profile_image",
    },
  });
}
