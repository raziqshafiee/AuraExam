import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { ConfirmModal } from "@/components/brand/confirm-modal";
import { getLecturerExams, deleteExam, unpublishExam, type ExamListItem, type ExamStatus } from "@/lib/supabase/exams";
import { fmtMY } from "@/lib/datetime";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lecturer/exams/")({
  head: () => ({ meta: [{ title: "Exams — Aura" }] }),
  loader: () => getLecturerExams(),
  component: LecturerExams,
});

const STATUS_ORDER: ExamStatus[] = ["live", "upcoming", "draft", "closed", "graded"];

const STATUS_DOT: Record<string, string> = {
  live: "bg-pink",
  upcoming: "bg-amber",
  draft: "bg-secondary border border-ink/30",
  closed: "bg-ink/40",
  graded: "bg-lime",
};

const STATUS_LABEL: Record<string, string> = {
  live: "Live",
  upcoming: "Upcoming",
  draft: "Draft",
  closed: "Closed",
  graded: "Graded",
};

const STATUS_HEADER_BG: Record<string, string> = {
  live: "bg-pink/15 border-pink/40",
  upcoming: "bg-amber/15 border-amber/40",
  draft: "bg-secondary/60 border-ink/20",
  closed: "bg-ink/5 border-ink/20",
  graded: "bg-lime/15 border-lime/40",
};

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "—";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Countdown({ exam, now }: { exam: ExamListItem; now: Date }) {
  if (exam.status === "upcoming") {
    const ms = new Date(exam.start_time).getTime() - now.getTime();
    return <span className="text-[10px] font-mono text-amber-700">starts in {formatCountdown(ms)}</span>;
  }
  if (exam.status === "live") {
    const ms = new Date(exam.end_time).getTime() - now.getTime();
    return <span className="text-[10px] font-mono text-pink font-bold">ends in {formatCountdown(ms)}</span>;
  }
  return null;
}

function LecturerExams() {
  const loaded = Route.useLoaderData();
  const [exams, setExams] = useState<ExamListItem[]>(loaded);
  useEffect(() => { setExams(loaded); }, [loaded]);

  const [working, setWorking] = useState<string | null>(null);
  const [pending, setPending] = useState<{ type: "delete" | "unpublish"; id: string; status: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExamStatus | "all">("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<ExamStatus>>(new Set());
  const now = useNow();

  // Unique classes derived from loaded exams
  const classOptions = Array.from(
    new Map(exams.map((e) => [e.class_id, { id: e.class_id, code: e.classCode, name: e.className }])).values()
  ).sort((a, b) => a.code.localeCompare(b.code));

  const filtered = exams.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.title.toLowerCase().includes(q) || e.classCode.toLowerCase().includes(q) || e.className.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    const matchClass = classFilter === "all" || e.class_id === classFilter;
    return matchSearch && matchStatus && matchClass;
  });

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    items: filtered.filter((e) => e.status === status),
  })).filter((g) => g.items.length > 0);

  function toggleCollapse(status: ExamStatus) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }

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
        setExams((prev) => prev.map((e) => (e.id === id ? { ...e, status: "draft" as const } : e)));
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

      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <input
          type="search"
          placeholder="Search by title or class…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ExamStatus | "all")}
          className="border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime cursor-pointer"
        >
          <option value="all">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime cursor-pointer"
        >
          <option value="all">All classes</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
          ))}
        </select>
      </div>

      {/* Needs grading — exams with submitted-but-ungraded essays */}
      {(() => {
        const needsGrading = exams.filter((e) => e.essaysPending > 0);
        if (needsGrading.length === 0) return null;
        return (
          <div className="mb-6 rounded-2xl border-2 border-violet/60 bg-violet/5 overflow-hidden">
            <div className="px-5 py-3 border-b border-violet/20 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-violet shrink-0" />
              <span className="font-display font-bold text-sm">Needs grading</span>
              <span className="text-xs font-mono text-muted-foreground">{needsGrading.length} exam{needsGrading.length !== 1 ? "s" : ""} with pending essays</span>
            </div>
            <div className="divide-y divide-violet/10">
              {needsGrading.map((e) => (
                <div key={e.id} className="flex items-center gap-4 px-5 py-3 flex-wrap">
                  <span className="text-xs font-mono font-bold">{e.classCode}</span>
                  <span className="flex-1 min-w-[150px] font-display font-bold text-sm">{e.title}</span>
                  <span className="text-xs font-mono text-violet font-semibold">
                    {e.essaysPending} submission{e.essaysPending !== 1 ? "s" : ""} pending
                  </span>
                  <WakeoutButton asChild size="sm" variant="violet">
                    <Link to="/lecturer/exams/$examId/results" params={{ examId: e.id }} search={{ tab: "grading" }}>
                      Grade now
                    </Link>
                  </WakeoutButton>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {exams.length === 0 ? (
        <div className="rounded-2xl border-2 border-ink/20 bg-card text-center py-16 text-ink/50">
          No exams yet. Create your first one.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-ink/20 bg-card text-center py-16 text-ink/50">
          No exams match your search.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ status, items }) => {
            const isCollapsed = collapsed.has(status);
            return (
              <div key={status} className={`rounded-2xl border-2 overflow-hidden ${STATUS_HEADER_BG[status]}`}>
                {/* Group header / collapse toggle */}
                <button
                  onClick={() => toggleCollapse(status)}
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-black/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                    <span className="font-display font-bold">{STATUS_LABEL[status]}</span>
                    <span className="text-xs font-mono text-muted-foreground">{items.length} exam{items.length !== 1 ? "s" : ""}</span>
                  </div>
                  {isCollapsed
                    ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-t-2 border-ink/10">
                      <thead>
                        <tr className="bg-ink/5 text-left">
                          <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Class</th>
                          <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Title</th>
                          <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">Date</th>
                          <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">Duration</th>
                          <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">Submitted</th>
                          <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/10 bg-background/60">
                        {items.map((e) => (
                          <tr key={e.id} className="hover:bg-ink/5 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-xs font-mono font-bold">{e.classCode}</span>
                            </td>

                            <td className="px-4 py-3 min-w-[180px]">
                              <div className="font-display font-bold leading-tight">{e.title}</div>
                              <Countdown exam={e} now={now} />
                            </td>

                            <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-muted-foreground">
                              {fmtMY(e.start_time, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </td>

                            <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-muted-foreground">
                              {e.questions_count}q · {e.duration}min
                            </td>

                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-xs font-mono">
                                <span className="font-bold">{e.submissionCount}</span>
                                <span className="text-muted-foreground"> / {e.enrolledCount}</span>
                              </div>
                              {e.avgScore !== null && (
                                <div className="text-[10px] font-mono text-muted-foreground">avg {e.avgScore}%</div>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {canEdit(e.status) && (
                                  <WakeoutButton asChild size="sm" variant="secondary">
                                    <Link to="/lecturer/exams/$examId/edit" params={{ examId: e.id }}>Edit</Link>
                                  </WakeoutButton>
                                )}
                                {canMonitor(e.status) && (
                                  <WakeoutButton asChild size="sm" variant="violet">
                                    <Link to="/lecturer/exams/$examId/monitor" params={{ examId: e.id }}>Monitor</Link>
                                  </WakeoutButton>
                                )}
                                {canResults(e.status) && (
                                  <WakeoutButton asChild size="sm" variant="sky">
                                    <Link to="/lecturer/exams/$examId/results" params={{ examId: e.id }}>Results</Link>
                                  </WakeoutButton>
                                )}
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
                                {canDelete(e.status) && (
                                  <button
                                    type="button"
                                    onClick={() => setPending({ type: "delete", id: e.id, status: e.status })}
                                    disabled={working === e.id}
                                    className="text-xs font-mono font-bold text-white bg-red-500 border-2 border-ink rounded-full px-2.5 py-1 hover:bg-red-600 transition-colors disabled:opacity-50"
                                  >
                                    {working === e.id ? "…" : "Delete"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
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
