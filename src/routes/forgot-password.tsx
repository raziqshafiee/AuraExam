import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/brand/marketing-layout";
import { WakeoutButton } from "@/components/brand/wakeout-button";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — Aura Exam" }] }),
  component: () => (
    <MarketingLayout>
      <section className="max-w-md mx-auto px-6 py-20">
        <span className="inline-block px-4 py-1.5 rounded-full border-2 border-ink bg-amber font-mono text-xs uppercase tracking-widest shadow-brut-sm">It happens</span>
        <h1 className="mt-4 font-display font-extrabold text-5xl tracking-tight">Forgot password.</h1>
        <p className="mt-3 text-muted-foreground">We'll send a reset link to your email.</p>
        <form className="mt-8 rounded-3xl border-2 border-ink bg-card p-6 shadow-brut space-y-4">
          <input type="email" required placeholder="you@aura.my" className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" />
          <WakeoutButton type="button" className="w-full">Send reset link</WakeoutButton>
          <div className="text-sm text-center">
            <Link to="/login" className="underline">Back to login</Link>
          </div>
        </form>
      </section>
    </MarketingLayout>
  ),
});
