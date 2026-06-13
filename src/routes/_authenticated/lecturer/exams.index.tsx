import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { ConfirmModal } from "@/components/brand/confirm-modal";
import { getLecturerExams, deleteExam, unpublishExam, type ExamListItem } from "@/lib/supabase/exams";
import { fmtMY } from "@/lib/datetime";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lecturer/exams/")({
  head: () => ({ meta: [{ title: "Exams — Aura" }] }),
  loader: () => getLecturerExams(),
  component: LecturerExams,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-card",
  upcoming: "bg-amber",
  live: "bg-pink",
  closed: "bg-secondary",
  graded: "bg-lime",
};

function LecturerExams() {
  const loaded = Route.useLoaderData();
  const [exams, setExams] = useState<ExamListItem[]>(loaded);
  // Keep local state in sync when the loader re-runs (window focus, navigation).
  useEffect(() => { setExams(loaded); }, [loaded]);
  const [working, setWorking] = useState<string | null>(null);
  const [pending, setPending] = useState<{ type: "delete" | "unpublish"; id: string; status: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = exams.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.title.toLowerCase().includes(q) || e.classCode.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleConfirm() {
    if (!pending) return;
    const { type, id } = pending;
    setWorking(id);
    try {
      if (type === "delete") {
        await deleteExam({ data: id });
        setExams((prev) => prev.filter((e) => e.id !== id));
        toast.success("Exam deleted");
      } else {
        await unpublishExam({ data: id });
        setExams((prev) =>
          prev.map((e) => (e.id === id ? { ...e, status: "draft" as const } : e))
        );
        toast.success("Exam moved back to draft");
      }
      setPending(null);
    } catch (err: any) {
      toast.error(err?.message ?? (type === "delete" ? "Failed to delete exam" : "Failed to unpublish exam"));
    } finally {
      setWorking(null);
    }
  }

  const canEdit = (s: string) => s === "draft" || s === "upcoming";
  // Deletion is allowed at any status. For live/closed/graded exams this also
  // destroys student submissions and scores — the confirm dialog warns first.
  const canDelete = (_s: string) => true;
  const canUnpublish = (s: string) => s === "upcoming";
  const canMonitor = (s: string) => s === "upcoming" || s === "live" || s === "closed";
  const canResults = (s: string) => s === "upcoming" || s === "live" || s === "closed" || s === "graded";

  return (
    <>
      <PageHeader
        badge="Papers"
        badgeColor="bg-violet"
        title="Exams"
        subtitle={`${exams.length} exam${exams.length !== 1 ? "s" : ""}`}
        action={
          <WakeoutButton asChild>
            <Link to="/lecturer/exams/new">+ New exam</Link>
          </WakeoutButton>
        }
      />

      <div className="flex gap-3 flex-wrap items-center mb-4">
        <input
          type="search"
          placeholder="Search by title or class…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {["all", "draft", "upcoming", "live", "closed", "graded"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full border-2 border-ink text-xs font-mono uppercase tracking-widest transition-colors ${statusFilter === s ? "bg-ink text-background" : "bg-card"}`}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {exams.length === 0 ? (
        <Card className="text-center py-12 text-ink/50">
          No exams yet. Create your first one.
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12 text-ink/50">
          No exams match your search.
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <Card key={e.id} className="flex items-center gap-4 flex-wrap">
              <span
                className={`px-2.5 py-1 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest ${STATUS_COLORS[e.status] ?? "bg-card"}`}
              >
                {e.status}
              </span>
              <span className="text-xs font-mono">{e.classCode}</span>
              <span className="flex-1 min-w-[200px] font-display font-bold">
                {e.title}
              </span>
              <span className="text-sm text-muted-foreground">
                {fmtMY(e.start_time, {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="text-sm text-muted-foreground">
                {e.questions_count}q · {e.duration}min
              </span>

              {/* Edit — full for draft, limited (title+camera only) for upcoming */}
              {canEdit(e.status) && (
                <WakeoutButton asChild size="sm" variant="secondary">
                  <Link to="/lecturer/exams/$examId/edit" params={{ examId: e.id }}>
                    {e.status === "upcoming" ? "Edit details" : "Edit"}
                  </Link>
                </WakeoutButton>
              )}

              {/* Unpublish — upcoming → draft */}
              {canUnpublish(e.status) && (
                <button
                  type="button"
                  disabled={working === e.id}
                  onClick={() => setPending({ type: "unpublish", id: e.id, status: e.status })}
                  className="text-xs font-mono text-amber-700 hover:text-amber-900 border border-amber-400 rounded-lg px-2.5 py-1 disabled:opacity-50"
                >
                  {working === e.id ? "…" : "Unpublish"}
                </button>
              )}

              {canMonitor(e.status) && (
                <WakeoutButton asChild size="sm" variant="violet">
                  <Link to="/lecturer/exams/$examId/monitor" params={{ examId: e.id }}>
                    Monitor
                  </Link>
                </WakeoutButton>
              )}

              {canResults(e.status) && (
                <WakeoutButton asChild size="sm" variant="sky">
                  <Link to="/lecturer/exams/$examId/results" params={{ examId: e.id }}>
                    Results
                  </Link>
                </WakeoutButton>
              )}

              {canDelete(e.status) && (
                <button
                  type="button"
                  onClick={() => setPending({ type: "delete", id: e.id, status: e.status })}
                  disabled={working === e.id}
                  className="text-xs font-mono font-bold text-white bg-red-500 border-2 border-ink rounded-full px-3 py-1 hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {working === e.id ? "…" : "Delete"}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        open={pending !== null}
        title={pending?.type === "delete" ? "Delete exam?" : "Unpublish exam?"}
        message={
          pending?.type === "delete"
            ? ["live", "closed", "graded"].includes(pending?.status ?? "")
              ? "This cannot be undone. This exam already has student submissions — all student answers, scores, and integrity flags will be permanently destroyed along with the exam."
              : "This cannot be undone. All questions and settings will be permanently removed."
            : "Students will no longer see this exam. It will return to draft status and can be republished."
        }
        confirmLabel={pending?.type === "delete" ? "Delete" : "Unpublish"}
        danger={pending?.type === "delete"}
        loading={working === pending?.id}
        onConfirm={handleConfirm}
        onClose={() => { if (!working) setPending(null); }}
      />
    </>
  );
}
