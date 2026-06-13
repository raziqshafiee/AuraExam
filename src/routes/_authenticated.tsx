import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AppShell } from "@/components/brand/app-shell";
import { getAuthUser } from "@/lib/auth";
import { checkBanStatus } from "@/lib/supabase/profile";

// Cache auth + ban check for 30s to avoid a network round-trip on every nav click.
let _authCache: { user: Awaited<ReturnType<typeof getAuthUser>>; banned: boolean; ts: number } | null = null;
const AUTH_CACHE_TTL = 30_000;

async function getCachedAuthCheck() {
  if (typeof window !== "undefined" && _authCache && Date.now() - _authCache.ts < AUTH_CACHE_TTL) {
    return _authCache;
  }
  const [user, banned] = await Promise.all([getAuthUser(), checkBanStatus()]);
  const result = { user, banned, ts: Date.now() };
  if (typeof window !== "undefined") _authCache = result;
  return result;
}

// Exported so signOut can bust the cache immediately.
export function bustAuthCache() {
  _authCache = null;
}

// Only re-fetch all loaders if the user was away for more than 2 minutes.
const INVALIDATE_AFTER_MS = 2 * 60 * 1000;

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { user, banned } = await getCachedAuthCheck();
    if (!user) throw redirect({ to: "/login" });
    if (banned) throw redirect({ to: "/login" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const router = useRouter();
  const hiddenAt = useRef(0);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        hiddenAt.current = Date.now();
      } else if (Date.now() - hiddenAt.current > INVALIDATE_AFTER_MS) {
        _authCache = null;
        router.invalidate();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [router]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
