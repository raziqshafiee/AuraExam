import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card, PageHeader, Section } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { ConfirmModal } from "@/components/brand/confirm-modal";
import {
  getLecturerClasses,
  createClass,
  updateClass,
  archiveClass,
  unarchiveClass,
  deleteEmptyClass,
} from "@/lib/supabase/classes";
import { toast } from "sonner";
import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";

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

type ConfirmAction =
  | { type: "archive"; id: string; name: string }
  | { type: "unarchive"; id: string; name: string }
  | { type: "delete"; id: string; name: string };

function LecturerClasses() {
  const initialClasses = Route.useLoaderData();
  const [classes, setClasses] = useState<any[]>(initialClasses);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<Color>("lime");
  const [code, setCode] = useState(generateCode);
  const [saving, setSaving] = useState(false);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirming, setConfirming] = useState(false);

  function openCreateDialog() {
    setEditingId(null);
    setName("");
    setColor("lime");
    setCode(generateCode());
    setOpen(true);
  }

  function openEditDialog(c: any) {
    setEditingId(c.id);
    setName(c.name);
    setColor(c.color);
    setCode(c.code);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        const res = await updateClass({ data: { classId: editingId, name, code, color } });
        setClasses((prev) => prev.map((c) => (c.id === editingId ? { ...c, ...res } : c)));
        toast.success("Class updated!");
        setOpen(false);
      } else {
        const res = await createClass({ data: { name, code, color } });
        toast.success("Class created!");
        setOpen(false);
        navigate({ to: "/lecturer/classes/$classId", params: { classId: res.id } });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save class");
    } finally {
      setSaving(false);
    }
  }

  async function runConfirmAction() {
    if (!confirmAction) return;
    setConfirming(true);
    try {
      if (confirmAction.type === "archive") {
        await archiveClass({ data: confirmAction.id });
        setClasses((prev) =>
          prev.map((c) => (c.id === confirmAction.id ? { ...c, archived_at: new Date().toISOString() } : c))
        );
        toast.success("Class archived");
      } else if (confirmAction.type === "unarchive") {
        await unarchiveClass({ data: confirmAction.id });
        setClasses((prev) => prev.map((c) => (c.id === confirmAction.id ? { ...c, archived_at: null } : c)));
        toast.success("Class restored");
      } else {
        await deleteEmptyClass({ data: confirmAction.id });
        setClasses((prev) => prev.filter((c) => c.id !== confirmAction.id));
        toast.success("Class deleted");
      }
      setConfirmAction(null);
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    } finally {
      setConfirming(false);
    }
  }

  const activeClasses = classes.filter((c) => !c.archived_at);
  const archivedClasses = classes.filter((c) => c.archived_at);

  return (
    <>
      <PageHeader
        badge="Teaching"
        badgeColor="bg-violet"
        title="Your classes"
        action={<WakeoutButton onClick={openCreateDialog}>+ New class</WakeoutButton>}
      />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md mx-4 rounded-3xl border-2 border-ink bg-card p-6 shadow-brut">
            <div className="flex items-center justify-between mb-5">
              <span className="inline-block px-3 py-1 rounded-full border-2 border-ink font-mono text-[10px] uppercase tracking-widest shadow-brut-sm bg-violet text-violet-foreground">
                {editingId ? "Edit class" : "New class"}
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
                  {saving ? "Saving…" : editingId ? "Save changes" : "Create class"}
                </WakeoutButton>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeClasses.map((c: any) => (
          <Card key={c.id} className={`bg-${c.color}`}>
            <div className="flex items-start justify-between">
              <div className="text-xs font-mono">{c.code}</div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => openEditDialog(c)}
                  title="Edit class"
                  className="w-7 h-7 flex items-center justify-center rounded-full border-2 border-ink bg-card hover:-translate-y-0.5 transition-transform"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction({ type: "archive", id: c.id, name: c.name })}
                  title="Archive class"
                  className="w-7 h-7 flex items-center justify-center rounded-full border-2 border-ink bg-card hover:-translate-y-0.5 transition-transform"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="font-display font-extrabold text-2xl mt-1">{c.name}</div>
            <div className="text-sm mt-1">{c.students} students enrolled</div>
            <div className="flex gap-2 mt-4">
              <WakeoutButton asChild size="sm" variant="secondary">
                <Link to="/lecturer/classes/$classId" params={{ classId: c.id }}>Open →</Link>
              </WakeoutButton>
              {c.students === 0 && (
                <WakeoutButton
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmAction({ type: "delete", id: c.id, name: c.name })}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </WakeoutButton>
              )}
            </div>
          </Card>
        ))}
        {activeClasses.length === 0 && (
          <p className="col-span-full text-center py-10 text-muted-foreground">No classes created yet.</p>
        )}
      </div>

      {archivedClasses.length > 0 && (
        <Section title="Archived">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {archivedClasses.map((c: any) => (
              <Card key={c.id} className="opacity-70">
                <div className="text-xs font-mono">{c.code}</div>
                <div className="font-display font-extrabold text-2xl mt-1">{c.name}</div>
                <div className="text-sm mt-1 text-muted-foreground">{c.students} students enrolled</div>
                <div className="flex gap-2 mt-4">
                  <WakeoutButton asChild size="sm" variant="secondary">
                    <Link to="/lecturer/classes/$classId" params={{ classId: c.id }}>Open →</Link>
                  </WakeoutButton>
                  <WakeoutButton
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmAction({ type: "unarchive", id: c.id, name: c.name })}
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                  </WakeoutButton>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      <ConfirmModal
        open={confirmAction !== null}
        title={
          confirmAction?.type === "archive"
            ? "Archive class?"
            : confirmAction?.type === "unarchive"
              ? "Restore class?"
              : "Delete class?"
        }
        message={
          confirmAction?.type === "archive"
            ? `"${confirmAction.name}" will be hidden from enrolled students and moved to Archived. You can restore it anytime — nothing is deleted.`
            : confirmAction?.type === "unarchive"
              ? `"${confirmAction.name}" will become active again and visible to enrolled students.`
              : `"${confirmAction?.name}" will be permanently deleted. This can't be undone.`
        }
        confirmLabel={
          confirmAction?.type === "archive" ? "Archive" : confirmAction?.type === "unarchive" ? "Restore" : "Delete"
        }
        danger={confirmAction?.type === "delete"}
        loading={confirming}
        onConfirm={runConfirmAction}
        onClose={() => { if (!confirming) setConfirmAction(null); }}
      />
    </>
  );
}
