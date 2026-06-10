import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — Aura" }] }),
  component: () => (
    <>
      <PageHeader badge="Defaults" badgeColor="bg-lime" title="Platform settings" />
      <Card className="max-w-2xl space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="text-xs font-mono uppercase tracking-widest">Default grace period (min)</label>
            <input type="number" defaultValue={5} className="mt-1 w-full border-2 border-ink rounded-xl px-3 py-2 bg-background" /></div>
          <div><label className="text-xs font-mono uppercase tracking-widest">Default flag threshold</label>
            <input type="number" defaultValue={3} className="mt-1 w-full border-2 border-ink rounded-xl px-3 py-2 bg-background" /></div>
          <div><label className="text-xs font-mono uppercase tracking-widest">Session timeout (min)</label>
            <input type="number" defaultValue={30} className="mt-1 w-full border-2 border-ink rounded-xl px-3 py-2 bg-background" /></div>
          <div><label className="text-xs font-mono uppercase tracking-widest">Appeal window (days)</label>
            <input type="number" defaultValue={7} className="mt-1 w-full border-2 border-ink rounded-xl px-3 py-2 bg-background" /></div>
        </div>
        <WakeoutButton>Save settings</WakeoutButton>
      </Card>
    </>
  ),
});
