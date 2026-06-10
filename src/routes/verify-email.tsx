import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MarketingLayout } from "@/components/brand/marketing-layout";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { Star } from "@/components/brand/doodles";
import { supabaseClient } from "@/lib/auth-client";
import { toast } from "sonner";

export const Route = createFileRoute("/verify-email")({
  head: () => ({ meta: [{ title: "Check your email — Aura Exam" }] }),
  validateSearch: (search) => ({
    email: typeof search.email === "string" ? search.email : "",
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { email } = Route.useSearch();
  const [isSending, setIsSending] = useState(false);

  async function resend() {
    if (!email) {
      toast.error("No email address — please register again.");
      return;
    }
    setIsSending(true);
    try {
      const { error } = await supabaseClient.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
      toast.success("Verification email resent! Check your inbox.");
    } catch {
      toast.error("Failed to resend. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <MarketingLayout>
      <section className="max-w-md mx-auto px-6 py-20 text-center">
        <Star className="w-16 h-16 text-pink mx-auto" />
        <h1 className="mt-4 font-display font-extrabold text-5xl tracking-tight">Check your email.</h1>
        <p className="mt-3 text-muted-foreground">
          We sent a verification link to{" "}
          {email ? <strong>{email}</strong> : "your inbox"}.
          Click it to activate your account.
        </p>
        {email && (
          <p className="mt-6 text-sm text-muted-foreground">
            Didn't get it?{" "}
            <button
              onClick={resend}
              disabled={isSending}
              className="underline font-semibold disabled:opacity-50"
            >
              {isSending ? "Sending…" : "Resend email"}
            </button>
          </p>
        )}
        <WakeoutButton asChild className="mt-8">
          <Link to="/login">Back to login</Link>
        </WakeoutButton>
      </section>
    </MarketingLayout>
  );
}
