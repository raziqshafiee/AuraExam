import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MarketingLayout } from "@/components/brand/marketing-layout";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getSupabaseClient } from "@/lib/auth-client";
import { ROLE_HOME, type Role } from "@/lib/auth";
import { sendEmailConfirmedNotice } from "@/lib/supabase/mailer";
import type { EmailOtpType } from "@supabase/supabase-js";

export const Route = createFileRoute("/auth/confirm")({
  head: () => ({ meta: [{ title: "Confirming your account — Aura Exam" }] }),
  validateSearch: (search) => ({
    token_hash: typeof search.token_hash === "string" ? search.token_hash : "",
    type: (typeof search.type === "string" ? search.type : "signup") as EmailOtpType,
  }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const { token_hash, type } = Route.useSearch();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  // Handles the PKCE-flow confirmation link: {{ .SiteURL }}/auth/confirm?token_hash=...&type=signup
  // (see supabase/templates/confirmation.html). The browser client's flowType
  // is "pkce" (set by @supabase/ssr's createBrowserClient), which cannot
  // process the old implicit-flow #access_token hash — verifyOtp() is the
  // PKCE-compatible way to exchange the emailed token for a real session.
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token_hash) {
      setFailed(true);
      return;
    }

    (async () => {
      const { data, error } = await getSupabaseClient().auth.verifyOtp({ token_hash, type });
      if (error || !data.user) {
        setFailed(true);
        return;
      }
      sendEmailConfirmedNotice().catch(() => {});
      const role = (data.user.user_metadata?.role as Role) || "student";
      navigate({ to: ROLE_HOME[role] });
    })();
  }, [token_hash, type, navigate]);

  if (failed) {
    return (
      <MarketingLayout>
        <section className="max-w-md mx-auto px-6 py-20 text-center">
          <h1 className="font-display font-extrabold text-4xl tracking-tight">Link expired or invalid.</h1>
          <p className="mt-3 text-muted-foreground">
            This confirmation link didn't work. Log in to request a fresh one.
          </p>
          <WakeoutButton asChild className="mt-8">
            <Link to="/login">Back to login</Link>
          </WakeoutButton>
        </section>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout>
      <section className="max-w-md mx-auto px-6 py-20 text-center">
        <h1 className="font-display font-extrabold text-4xl tracking-tight">Confirming your account…</h1>
      </section>
    </MarketingLayout>
  );
}
