import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getLecturerClasses, createClass } from "@/lib/supabase/classes";
import { toast } from "sonner";

const COLORS = ["lime", "pink", "violet", "sky", "amber"] as const;
type Color = typeof COLORS[number];

const COLOR_BG: Record<Color, string> = {
  lime: "bg-lime",
  pink: "bg-pink",
  violet: "bg-violet",
  sky: "bg-sky",
  amber: "bg-amber",
};

function generateCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  return (
    Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join("") +
    Array.from({ length: 3 }, () => digits[Math.floor(Math.random() * digits.length)]).join("")
  );
}

export const Route = createFileRoute("/_authenticated/lecturer/classes/")({
  head: () => ({ meta: [{ title: "Classes — Aura" }] }),
  loader: async () => getLecturerClasses(),
  component: LecturerClasses,
});

function LecturerClasses() {
  const classes = Route.useLoaderData();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<Color>("lime");
  const [code, setCode] = useState(generateCode);
  const [saving, setSaving] = useState(false);

  function openDialog() {
    setName("");
    setColor("lime");
    setCode(generateCode());
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await createClass({ data: { name, code, color } });
      toast.success("Class created!");
      setOpen(false);
      navigate({ to: "/lecturer/classes/$classId", params: { classId: res.id } });
    } catch (err: any) {
      toast.error(err.message || "Failed to create class");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        badge="Teaching"
        badgeColor="bg-violet"
        title="Your classes"
        action={<WakeoutButton onClick={openDialog}>+ New class</WakeoutButton>}
      />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md mx-4 rounded-3xl border-2 border-ink bg-card p-6 shadow-brut">
            <div className="flex items-center justify-between mb-5">
              <span className="inline-block px-3 py-1 rounded-full border-2 border-ink font-mono text-[10px] uppercase tracking-widest shadow-brut-sm bg-violet text-violet-foreground">
                New class
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full border-2 border-ink font-bold hover:bg-pink transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-mono uppercase tracking-widest">Class name</label>
                <input
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Introduction to Algebra"
                  className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-violet"
                />
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-widest">Class code</label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="flex-1 border-2 border-ink rounded-xl px-4 py-3 bg-background font-mono tracking-widest text-sm">
                    {code}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCode(generateCode())}
                    title="Regenerate"
                    className="border-2 border-ink rounded-xl px-4 py-3 font-mono text-sm hover:bg-lime transition-colors"
                  >
                    ↺
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground font-mono">Auto-generated · students use this to join</p>
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-widest">Color</label>
                <div className="mt-2 flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-9 h-9 rounded-full border-2 transition-all ${COLOR_BG[c]} ${
                        color === c
                          ? "border-ink shadow-brut-sm scale-110"
                          : "border-ink/30 hover:border-ink"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <WakeoutButton
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </WakeoutButton>
                <WakeoutButton type="submit" className="flex-1" disabled={saving}>
                  {saving ? "Creating…" : "Create class"}
                </WakeoutButton>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map((c: any) => (
          <Card key={c.id} className={`bg-${c.color}`}>
            <div className="text-xs font-mono">{c.code}</div>
            <div className="font-display font-extrabold text-2xl mt-1">{c.name}</div>
            <div className="text-sm mt-1">{c.students} students enrolled</div>
            <WakeoutButton asChild size="sm" variant="secondary" className="mt-4">
              <Link to="/lecturer/classes/$classId" params={{ classId: c.id }}>Open →</Link>
            </WakeoutButton>
          </Card>
        ))}
        {classes.length === 0 && (
          <p className="col-span-full text-center py-10 text-muted-foreground">No classes created yet.</p>
        )}
      </div>
    </>
  );
}
