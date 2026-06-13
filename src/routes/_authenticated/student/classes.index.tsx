import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getStudentClasses, joinClass } from "@/lib/supabase/classes";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/student/classes/")({
  head: () => ({ meta: [{ title: "Classes — Aura" }] }),
  loader: async () => getStudentClasses(),
  component: StudentClasses,
});

function StudentClasses() {
  const classes = Route.useLoaderData();
  const navigate = useNavigate();

  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setJoining(true);
    try {
      const res = await joinClass({ data: code.trim().toUpperCase() });
      toast.success("Successfully joined class!");
      setJoinOpen(false);
      setCode("");
      navigate({ to: "/student/classes/$classId", params: { classId: res.classId } });
    } catch (e: any) {
      toast.error(e.message || "Failed to join class");
    } finally {
      setJoining(false);
    }
  }

  return (
    <>
      <PageHeader badge="Enrolled" badgeColor="bg-sky" title="Your classes" subtitle="Everything you're enrolled in this semester." />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map((c: any) => (
          <Card key={c.id} className={`bg-${c.color}`}>
            <div className="text-xs font-mono">{c.code}</div>
            <div className="mt-1 font-display font-extrabold text-2xl">{c.name}</div>
            <div className="mt-1 text-sm">{c.lecturer}</div>
            <WakeoutButton asChild size="sm" variant="secondary" className="mt-4">
              <Link to="/student/classes/$classId" params={{ classId: c.id }}>Open class →</Link>
            </WakeoutButton>
          </Card>
        ))}
        {classes.length === 0 && (
          <p className="col-span-full text-center py-10 text-muted-foreground">You are not enrolled in any classes yet.</p>
        )}
      </div>

      <div className="mt-8">
        <WakeoutButton variant="outline" onClick={() => setJoinOpen(true)}>+ Join with code</WakeoutButton>
      </div>

      {joinOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && !joining) setJoinOpen(false); }}
        >
          <div className="w-full max-w-sm mx-4 rounded-3xl border-2 border-ink bg-card p-6 shadow-brut">
            <div className="flex items-center justify-between mb-5">
              <span className="inline-block px-3 py-1 rounded-full border-2 border-ink font-mono text-[10px] uppercase tracking-widest shadow-brut-sm bg-sky">
                Join class
              </span>
              <button
                type="button"
                onClick={() => { if (!joining) setJoinOpen(false); }}
                disabled={joining}
                className="w-8 h-8 flex items-center justify-center rounded-full border-2 border-ink font-bold hover:bg-pink transition-colors disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground block mb-1">
                  Class code
                </label>
                <input
                  autoFocus
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123"
                  maxLength={10}
                  className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background font-mono tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-sky"
                />
                <p className="mt-1 text-xs text-muted-foreground font-mono">Ask your lecturer for the 6-character code.</p>
              </div>

              <div className="flex gap-3 pt-1">
                <WakeoutButton type="button" variant="secondary" className="flex-1" onClick={() => setJoinOpen(false)} disabled={joining}>
                  Cancel
                </WakeoutButton>
                <WakeoutButton type="submit" className="flex-1" disabled={joining || !code.trim()}>
                  {joining ? "Joining…" : "Join class"}
                </WakeoutButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
