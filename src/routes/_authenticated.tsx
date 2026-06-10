import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/brand/app-shell";
import { getAuthUser } from "@/lib/auth";
import { checkBanStatus } from "@/lib/supabase/profile";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const user = await getAuthUser();
    if (!user) throw redirect({ to: "/login" });

    // Banned users are blocked from all authenticated routes.
    const banned = await checkBanStatus();
    if (banned) throw redirect({ to: "/login" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const router = useRouter();

  // Re-run all active loaders whenever the user returns to this tab.
  // Without this, data only refreshes on navigation — switching tabs and back
  // is the most common way users encounter stale data without a full refresh.
  useEffect(() => {
    function handleFocus() {
      router.invalidate();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [router]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
