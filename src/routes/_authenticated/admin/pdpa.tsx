import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";

export const Route = createFileRoute("/_authenticated/admin/pdpa")({
  head: () => ({ meta: [{ title: "PDPA — Aura" }] }),
  component: () => (
    <>
      <PageHeader badge="Compliance" badgeColor="bg-lime" title="PDPA requests" subtitle="Data deletion requests from users." />
      <div className="space-y-3">
        {[{ n: "Aisha Tan", e: "aisha@student.aura.my", d: "2026-05-22" },
          { n: "Hafiz Daud", e: "hafiz@student.aura.my", d: "2026-05-19" }].map((r, i) => (
          <Card key={i} className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="font-bold">{r.n}</div>
              <div className="text-xs font-mono text-muted-foreground">{r.e} · requested {r.d}</div>
            </div>
            <WakeoutButton size="sm">Process</WakeoutButton>
            <WakeoutButton size="sm" variant="ghost">Decline</WakeoutButton>
          </Card>
        ))}
      </div>
    </>
  ),
});
