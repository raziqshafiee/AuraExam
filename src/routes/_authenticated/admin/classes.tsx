import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { ConfirmModal } from "@/components/brand/confirm-modal";
import { getAllClassesAdmin, deleteClass } from "@/lib/supabase/classes";
import { fmtMY } from "@/lib/datetime";
import { toast } from "sonner";

const COLOR_BG: Record<string, string> = {
  lime: "bg-lime",
  pink: "bg-pink",
  violet: "bg-violet",
  sky: "bg-sky",
  amber: "bg-amber",
};

export const Route = createFileRoute("/_authenticated/admin/classes")({
  head: () => ({ meta: [{ title: "Classes — Aura Admin" }] }),
  loader: async () => getAllClassesAdmin(),
  component: AdminClasses,
});

function AdminClasses() {
  const initialClasses = Route.useLoaderData();
  const [classes, setClasses] = useState<any[]>(initialClasses);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const filtered = classes.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.lecturer.toLowerCase().includes(q)
    );
  });

  async function handleDelete(id: string, name: string) {
    setConfirmTarget({ id, name });
  }

  async function runDelete() {
    if (!confirmTarget) return;
    setConfirming(true);
    setLoading(confirmTarget.id);
    try {
      await deleteClass({ data: confirmTarget.id });
      setClasses((prev) => prev.filter((c) => c.id !== confirmTarget.id));
      toast.success("Class deleted");
      setConfirmTarget(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete class");
    } finally {
      setConfirming(false);
      setLoading(null);
    }
  }

  return (
    <>
      <PageHeader
        badge="Oversight"
        badgeColor="bg-lime"
        title="All classes"
        subtitle={`${classes.length} classes on the platform`}
      />

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, code, or lecturer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-2 border-ink rounded-full px-4 py-1.5 text-sm font-mono w-full max-w-sm focus:outline-none focus:ring-2 focus:ring-lime"
        />
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono uppercase tracking-widest text-muted-foreground border-b-2 border-ink">
              <th className="py-3">Class</th>
              <th>Code</th>
              <th>Lecturer</th>
              <th>Students</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-ink/10">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted-foreground font-mono text-sm">
                  No classes found.
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id}>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full border-2 border-ink flex-shrink-0 ${COLOR_BG[c.color] ?? "bg-muted"}`}
                    />
                    <span className="font-semibold">{c.name}</span>
                  </div>
                </td>
                <td className="font-mono text-xs">{c.code}</td>
                <td className="text-muted-foreground">{c.lecturer}</td>
                <td>
                  <span className="px-2 py-0.5 rounded-full border-2 border-ink text-xs font-mono bg-sky">
                    {c.students}
                  </span>
                </td>
                <td className="text-xs font-mono text-muted-foreground">
                  {fmtMY(c.created_at, { dateStyle: "short" })}
                </td>
                <td className="text-right">
                  <WakeoutButton
                    size="sm"
                    variant="ghost"
                    disabled={loading === c.id}
                    onClick={() => handleDelete(c.id, c.name)}
                  >
                    {loading === c.id ? "…" : "Delete"}
                  </WakeoutButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ConfirmModal
        open={confirmTarget !== null}
        title="Delete class?"
        message={`"${confirmTarget?.name}" and all its data will be permanently deleted.`}
        confirmLabel="Delete"
        danger
        loading={confirming}
        onConfirm={runDelete}
        onClose={() => { if (!confirming) setConfirmTarget(null); }}
      />
    </>
  );
}
