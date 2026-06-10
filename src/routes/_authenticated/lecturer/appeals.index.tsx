import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, PageHeader, Stat } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import {
  getLecturerAppeals,
  resolveAppeal,
  getAppealSubmissionReview,
  type LecturerAppeal,
} from "@/lib/supabase/appeals";
import { getSubmissionFlagReasons } from "@/lib/supabase/proctor";
import {
  ShieldAlert, FileText, ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle, XCircle, TabletSmartphone, ClipboardCopy, Minimize2,
  Users, UserX, CameraOff, EyeOff, ArrowLeftRight,
} from "lucide-react";
import { fmtMY } from "@/lib/datetime";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lecturer/appeals/")({
  head: () => ({ meta: [{ title: "Appeals — Aura" }] }),
  loader: () => getLecturerAppeals({ data: { page: 1 } }),
  component: LecturerAppeals,
});

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber",
  approved: "bg-lime",
  rejected: "bg-pink",
};

function fmt(iso: string) {
  return fmtMY(iso, { dateStyle: "medium", timeStyle: "short" });
}

function LecturerAppeals() {
  const initial = Route.useLoaderData();
  const [appeals, setAppeals] = useState<LecturerAppeal[]>(initial.appeals as LecturerAppeal[]);
  const [totalCount, setTotalCount] = useState(initial.totalCount);
  const [totalPages, setTotalPages] = useState(initial.totalPages);
  const [page, setPage] = useState(initial.page);
  // Re-sync when loader re-runs (window focus returns fresh page-1 data).
  useEffect(() => {
    setAppeals(initial.appeals as LecturerAppeal[]);
    setTotalCount(initial.totalCount);
    setTotalPages(initial.totalPages);
    setPage(initial.page);
  }, [initial]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [scoreOverrides, setScoreOverrides] = useState<Record<string, string>>({});
  const [reviewData, setReviewData] = useState<Record<string, any[]>>({});
  const [reviewLoading, setReviewLoading] = useState<Set<string>>(new Set());
  const [flagData, setFlagData] = useState<Record<string, { type: string; label: string; time: string }[]>>({});
  const [flagLoading, setFlagLoading] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pending = appeals.filter((a) => a.status === "pending");
  const integrityPending = pending.filter((a) => a.type === "integrity");

  async function loadPage(p: number, filter: string) {
    setLoading(true);
    try {
      const result = await getLecturerAppeals({ data: { page: p, statusFilter: filter } });
      setAppeals(result.appeals as LecturerAppeal[]);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load appeals");
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(appealId: string, decision: "approved" | "rejected") {
    const reply = (replies[appealId] ?? "").trim();
    if (!reply) { toast.error("Please provide a response before deciding"); return; }

    const appeal = appeals.find((a) => a.id === appealId);
    let newScore: number | undefined;

    if (decision === "approved" && appeal?.type === "score") {
      const raw = (scoreOverrides[appealId] ?? "").trim();
      if (!raw) { toast.error("Enter the corrected score before approving"); return; }
      newScore = parseFloat(raw);
      if (isNaN(newScore) || newScore < 0) { toast.error("Invalid score"); return; }
      if (appeal.submissionTotal !== null && newScore > appeal.submissionTotal) {
        toast.error(`Score cannot exceed total (${appeal.submissionTotal} pts)`); return;
      }
    }

    setResolving(appealId);
    try {
      await resolveAppeal({ data: { appealId, decision, lecturerReply: reply, newScore } });
      setAppeals((prev) =>
        prev.map((a) =>
          a.id === appealId
            ? { ...a, status: decision, lecturerReply: reply, decidedAt: new Date().toISOString() }
            : a
        )
      );
      toast.success(
        decision === "approved"
          ? appeal?.type === "score"
            ? `Appeal approved — score updated to ${newScore} pts`
            : "Appeal approved — retake unlocked"
          : "Appeal rejected"
      );
      setExpandedId(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to resolve appeal");
    } finally {
      setResolving(null);
    }
  }

  return (
    <>
      <PageHeader badge="Review queue" badgeColor="bg-amber" title="Student appeals" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Total" value={totalCount} color="bg-card" />
        <Stat label="Pending" value={pending.length} color="bg-amber" />
        <Stat label="Integrity" value={integrityPending.length} color="bg-pink" />
        <Stat label="Resolved" value={appeals.filter((a) => a.status !== "pending").length} color="bg-lime" />
      </div>

      <div className="flex gap-3 flex-wrap items-center mb-4">
        <input
          type="search"
          placeholder="Search by student or exam…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setExpandedId(null); }}
          className="flex-1 min-w-[220px] border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["all", "pending", "approved", "rejected"].map((f) => (
          <button
            key={f}
            onClick={() => { setStatusFilter(f); loadPage(1, f); }}
            className={`px-3 py-1.5 rounded-full border-2 border-ink text-xs font-mono uppercase tracking-widest transition-colors ${statusFilter === f ? "bg-ink text-background" : "bg-card"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : appeals.length === 0 ? (
        <Card className="text-center py-12 text-ink/50">No appeals in this queue.</Card>
      ) : (
        <div className="space-y-3">
          {appeals.filter((a) => {
            const q = search.toLowerCase();
            return (
              !q ||
              a.studentName.toLowerCase().includes(q) ||
              a.examTitle.toLowerCase().includes(q) ||
              a.classCode.toLowerCase().includes(q)
            );
          }).map((a) => {
            const isOpen = expandedId === a.id;
            const isPending = a.status === "pending";

            return (
              <Card key={a.id} className={a.type === "integrity" && isPending ? "border-pink" : ""}>
                <div className="flex items-start gap-3 flex-wrap">
                  {a.type === "integrity" ? (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-pink bg-pink/20 text-pink text-xs font-mono uppercase tracking-widest">
                      <ShieldAlert className="w-3.5 h-3.5" /> integrity
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-ink/30 text-xs font-mono uppercase tracking-widest text-ink/60">
                      <FileText className="w-3.5 h-3.5" /> score dispute
                    </span>
                  )}

                  <span className={`px-3 py-1 rounded-full border-2 border-ink text-xs font-mono uppercase tracking-widest ${STATUS_COLORS[a.status] ?? "bg-card"}`}>
                    {a.status}
                  </span>

                  <div className="flex-1 min-w-[200px]">
                    <div className="font-display font-bold">
                      {a.studentName}
                      <span className="font-normal text-muted-foreground font-sans text-sm ml-2">
                        · {a.classCode} — {a.examTitle}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs font-mono text-muted-foreground flex-wrap">
                      <span>Filed {fmt(a.submittedAt)}</span>
                      {a.submissionFlags > 0 && (
                        <span className="text-pink font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {a.submissionFlags} flag{a.submissionFlags !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {a.submissionTotal ? (
                    <div className="text-right text-xs font-mono shrink-0">
                      <div className="font-bold text-sm">
                        {a.submissionScore ?? 0} / {a.submissionTotal} pts
                      </div>
                      <div className="text-muted-foreground">
                        {Math.round(((a.submissionScore ?? 0) / a.submissionTotal) * 100)}%
                      </div>
                      {a.type === "integrity" && (
                        <div className="text-sky">earned: {a.submissionAutoScore} pts</div>
                      )}
                    </div>
                  ) : null}

                  <button
                    onClick={async () => {
                      if (isOpen) { setExpandedId(null); return; }
                      setExpandedId(a.id);
                      if (a.type === "score" && !reviewData[a.id]) {
                        setReviewLoading((prev) => new Set(prev).add(a.id));
                        try {
                          const rows = await getAppealSubmissionReview({
                            data: { submissionId: a.submissionId, examId: a.examId },
                          });
                          setReviewData((prev) => ({ ...prev, [a.id]: rows as any[] }));
                        } catch {
                          // non-fatal — review section shows empty state
                        } finally {
                          setReviewLoading((prev) => { const s = new Set(prev); s.delete(a.id); return s; });
                        }
                      }
                      if (a.type === "integrity" && !flagData[a.id]) {
                        setFlagLoading((prev) => new Set(prev).add(a.id));
                        try {
                          const rows = await getSubmissionFlagReasons({ data: a.submissionId });
                          setFlagData((prev) => ({ ...prev, [a.id]: rows }));
                        } catch {
                          // non-fatal
                        } finally {
                          setFlagLoading((prev) => { const s = new Set(prev); s.delete(a.id); return s; });
                        }
                      }
                    }}
                    className="text-xs font-mono underline text-muted-foreground shrink-0 self-start"
                  >
                    {isOpen ? "collapse" : "review"}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-5 border-t-2 border-ink/10 pt-5 space-y-4">
                    <div>
                      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                        Student's statement
                      </div>
                      <div className="bg-secondary rounded-2xl border-2 border-ink/20 p-4 text-sm leading-relaxed whitespace-pre-line">
                        {a.reason}
                      </div>
                    </div>

                    {a.type === "integrity" && (
                      <div>
                        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                          What triggered the flags
                        </div>
                        {flagLoading.has(a.id) ? (
                          <div className="text-sm text-muted-foreground py-2">Loading flag log…</div>
                        ) : flagData[a.id]?.length > 0 ? (
                          <div className="space-y-1">
                            {flagData[a.id].map((f, i) => {
                              const isHard = new Set(["tab-switch","copy","paste","right-click","screenshot","fullscreen-exit","multiple-faces"]).has(f.type);
                              const Icon: React.ElementType = (({
                                "tab-switch":      TabletSmartphone,
                                "copy":            ClipboardCopy,
                                "paste":           ClipboardCopy,
                                "right-click":     ArrowLeftRight,
                                "screenshot":      CameraOff,
                                "fullscreen-exit": Minimize2,
                                "multiple-faces":  Users,
                                "face-missing":    UserX,
                                "camera-lost":     CameraOff,
                                "gaze-away":       EyeOff,
                                "head-turned":     ArrowLeftRight,
                              } as Record<string, React.ElementType>)[f.type]) ?? AlertTriangle;
                              return (
                                <div
                                  key={i}
                                  className={`flex items-center gap-2 text-xs font-mono px-2.5 py-1.5 rounded-lg border ${
                                    isHard
                                      ? "bg-pink/15 text-pink border-pink/20"
                                      : "bg-amber/15 text-amber-700 border-amber/20"
                                  }`}
                                >
                                  <Icon className="w-3.5 h-3.5 shrink-0" />
                                  <span className={`flex-1 ${isHard ? "font-semibold" : ""}`}>{f.label}</span>
                                  <span className={`shrink-0 ${isHard ? "text-pink/70" : "text-amber-500"}`}>{f.time}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground italic">No flag events recorded.</div>
                        )}
                      </div>
                    )}

                    {a.type === "score" && (
                      <div>
                        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
                          Student's answers
                        </div>
                        {reviewLoading.has(a.id) ? (
                          <div className="text-sm text-muted-foreground py-4 text-center">Loading answers…</div>
                        ) : reviewData[a.id]?.length > 0 ? (
                          <div className="space-y-3">
                            {reviewData[a.id].map((q, i) => {
                              const LETTERS = ["A", "B", "C", "D"];
                              const options: string[] = q.meta?.options ?? [];
                              return (
                                <div key={q.id} className="rounded-2xl border-2 border-ink/15 bg-secondary p-4 space-y-2">
                                  <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="flex items-start gap-2 flex-1 min-w-0">
                                      <span className="shrink-0 w-6 h-6 rounded-full border-2 border-ink/40 bg-card flex items-center justify-center text-xs font-mono font-bold">
                                        {i + 1}
                                      </span>
                                      <p className="text-sm leading-relaxed pt-0.5">{q.text}</p>
                                    </div>
                                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                                      {q.studentScore !== null ? `${q.studentScore} / ${q.points} pts` : `${q.points} pt${q.points !== 1 ? "s" : ""}`}
                                    </span>
                                  </div>

                                  {q.type === "MCQ" && (
                                    <div className="grid gap-1.5 pl-8">
                                      {options.map((opt: string, idx: number) => {
                                        const isChosen = LETTERS[idx] === q.studentAnswer;
                                        const isCorrect = isChosen && q.studentScore !== null && q.studentScore > 0;
                                        const isWrong = isChosen && (q.studentScore === 0 || q.studentScore === null);
                                        return (
                                          <div
                                            key={idx}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 text-sm ${
                                              isCorrect ? "border-lime bg-lime/20 font-semibold"
                                              : isWrong ? "border-pink bg-pink/10 font-semibold"
                                              : "border-ink/15 bg-card"
                                            }`}
                                          >
                                            {isCorrect ? <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
                                             : isWrong ? <XCircle className="w-3.5 h-3.5 text-pink shrink-0" />
                                             : <span className="w-3.5 h-3.5 shrink-0" />}
                                            <span className="font-mono text-xs mr-1">{LETTERS[idx]}.</span>
                                            {opt}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {q.type === "TF" && (
                                    <div className="flex gap-2 pl-8">
                                      {["True", "False"].map((val) => {
                                        const isChosen = q.studentAnswer === val;
                                        const isCorrect = isChosen && q.studentScore !== null && q.studentScore > 0;
                                        const isWrong = isChosen && (q.studentScore === 0 || q.studentScore === null);
                                        return (
                                          <div
                                            key={val}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 text-sm ${
                                              isCorrect ? "border-lime bg-lime/20 font-semibold"
                                              : isWrong ? "border-pink bg-pink/10 font-semibold"
                                              : "border-ink/15 bg-card"
                                            }`}
                                          >
                                            {isCorrect && <CheckCircle className="w-3.5 h-3.5 text-green-600" />}
                                            {isWrong && <XCircle className="w-3.5 h-3.5 text-pink" />}
                                            {val}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {q.type === "ESSAY" && (
                                    <div className="pl-8">
                                      {q.studentAnswer ? (
                                        <div className="bg-card rounded-xl border-2 border-ink/20 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                                          {q.studentAnswer}
                                        </div>
                                      ) : (
                                        <p className="text-sm text-muted-foreground italic">No answer submitted.</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : !reviewLoading.has(a.id) && (
                          <div className="text-sm text-muted-foreground italic">No answer data found.</div>
                        )}
                      </div>
                    )}

                    {isPending ? (
                      <>
                        {a.type === "score" && (
                          <div>
                            <label className="text-xs font-mono uppercase tracking-widest">
                              Corrected score (required to approve)
                            </label>
                            <div className="flex items-center gap-3 mt-1">
                              <input
                                type="number"
                                min={0}
                                max={a.submissionTotal ?? undefined}
                                step={0.5}
                                value={scoreOverrides[a.id] ?? ""}
                                onChange={(e) =>
                                  setScoreOverrides((prev) => ({ ...prev, [a.id]: e.target.value }))
                                }
                                placeholder="Enter new score"
                                className="w-36 border-2 border-ink rounded-xl px-4 py-2.5 bg-background focus:outline-none text-sm font-mono"
                              />
                              <span className="text-xs font-mono text-muted-foreground">
                                / {a.submissionTotal ?? "?"} pts · current: {a.submissionScore ?? 0} pts
                              </span>
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="text-xs font-mono uppercase tracking-widest">
                            Your response (required)
                          </label>
                          <textarea
                            rows={4}
                            value={replies[a.id] ?? ""}
                            onChange={(e) => setReplies((prev) => ({ ...prev, [a.id]: e.target.value }))}
                            placeholder="Explain your decision to the student…"
                            className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background resize-none focus:outline-none text-sm"
                          />
                        </div>

                        {a.type === "integrity" && (
                          <div className="p-3 rounded-xl border-2 border-amber bg-amber/10 text-sm">
                            <span className="font-semibold">Approve</span> will allow the student
                            to retake this exam from scratch. Their flagged score (0 pts) is
                            replaced by whatever they score on the retake.{" "}
                            <span className="font-semibold">Reject</span> keeps the score at 0 permanently.
                          </div>
                        )}

                        <div className="flex gap-3">
                          <WakeoutButton
                            variant="primary"
                            size="sm"
                            disabled={resolving === a.id}
                            onClick={() => handleResolve(a.id, "approved")}
                          >
                            {resolving === a.id
                              ? "Saving…"
                              : a.type === "integrity"
                                ? "Approve · allow retake"
                                : "Approve · update score"}
                          </WakeoutButton>
                          <WakeoutButton
                            variant="pink"
                            size="sm"
                            disabled={resolving === a.id}
                            onClick={() => handleResolve(a.id, "rejected")}
                          >
                            Reject
                          </WakeoutButton>
                        </div>
                      </>
                    ) : (
                      a.lecturerReply && (
                        <div>
                          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                            Your response · {a.decidedAt ? fmt(a.decidedAt) : ""}
                          </div>
                          <div className="bg-secondary rounded-2xl border-2 border-ink/20 p-4 text-sm leading-relaxed">
                            {a.lecturerReply}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <WakeoutButton
            variant="secondary"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => loadPage(page - 1, statusFilter)}
          >
            <ChevronLeft className="w-4 h-4" />
          </WakeoutButton>
          <span className="text-xs font-mono text-muted-foreground">
            Page {page} of {totalPages} · {totalCount} total
          </span>
          <WakeoutButton
            variant="secondary"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => loadPage(page + 1, statusFilter)}
          >
            <ChevronRight className="w-4 h-4" />
          </WakeoutButton>
        </div>
      )}
    </>
  );
}
