import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/brand/marketing-layout";
import { WakeoutButton } from "@/components/brand/wakeout-button";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Aura Exam" }] }),
  component: () => (
    <MarketingLayout>
      <section className="max-w-md mx-auto px-6 py-20">
        <h1 className="font-display font-extrabold text-5xl tracking-tight">Set new password.</h1>
        <form className="mt-8 rounded-3xl border-2 border-ink bg-card p-6 shadow-brut space-y-4">
          <input type="password" required placeholder="New password" className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" />
          <input type="password" required placeholder="Confirm password" className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" />
          <WakeoutButton type="button" className="w-full">Save password</WakeoutButton>
          <div className="text-sm text-center"><Link to="/login" className="underline">Back to login</Link></div>
        </form>
      </section>
    </MarketingLayout>
  ),
});
