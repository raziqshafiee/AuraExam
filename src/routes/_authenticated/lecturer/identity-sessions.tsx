// src/routes/_authenticated/lecturer/identity-sessions.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getLecturerClasses } from "@/lib/supabase/classes";
import { openEnrollmentSession, closeEnrollmentSession, getEnrollmentSessionRoster } from "@/lib/supabase/face";

export const Route = createFileRoute("/_authenticated/lecturer/identity-sessions")({
  head: () => ({ meta: [{ title: "Identity sessions — Aura" }] }),
  loader: () => getLecturerClasses(),
  component: IdentitySessions,
});

function IdentitySessions() {
  const classes = Route.useLoaderData();
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>(classes[0]?.id ?? "");
  const [roster, setRoster] = useState<{ studentId: string; name: string; enrolled: boolean }[]>([]);

  async function open() {
    const res = await openEnrollmentSession({ data: { classId: selectedClass, durationMinutes: 30 } });
    setOpenSessionId(res.sessionId);
    toast.success(`Window open until ${new Date(res.expiresAt).toLocaleTimeString()}`);
    poll();
  }

  async function poll() {
    const r = await getEnrollmentSessionRoster({ data: selectedClass });
    setRoster(r);
  }

  async function close() {
    if (!openSessionId) return;
    await closeEnrollmentSession({ data: openSessionId });
    setOpenSessionId(null);
  }

  return (
    <>
      <PageHeader badge="Face Match" title="Supervised verification" subtitle="Open a window, students enroll in person, no card required." />
      <Card className="max-w-xl space-y-4">
        <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="w-full border-2 border-ink rounded-xl px-3 py-2">
          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        {!openSessionId ? (
          <WakeoutButton className="w-full" onClick={open}>Open 30-minute window</WakeoutButton>
        ) : (
          <>
            <p className="text-sm font-mono">{roster.filter((r) => r.enrolled).length} / {roster.length} enrolled</p>
            <WakeoutButton variant="secondary" className="w-full" onClick={poll}>Refresh</WakeoutButton>
            <WakeoutButton variant="destructive" className="w-full" onClick={close}>Close window</WakeoutButton>
          </>
        )}
      </Card>
    </>
  );
}
