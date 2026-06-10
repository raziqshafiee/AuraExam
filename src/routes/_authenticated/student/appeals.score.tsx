import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { Clock, ChevronLeft } from "lucide-react";
import { fmtMY } from "@/lib/datetime";
import { getAppealableSubmissions, submitAppeal } from "@/lib/supabase/appeals";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/student/appeals/score")({
  head: () => ({ meta: [{ title: "Score dispute — Aura" }] }),
  loader: () => getAppealableSubmissions(),
  component: ScoreAppeal,
});

function daysLeft(deadlineAt: string) {
  const diff = new Date(deadlineAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function fmt(iso: string) {
  return fmtMY(iso, { dateStyle: "medium", timeStyle: "short" });
}

function ScoreAppeal() {
  const all = Route.useLoaderData() as any[];
  const navigate = useNavigate();

  // Score disputes: submitted/graded only — flagged submissions use the integrity appeal
  const submissions = all.filter((s) => s.status !== "flagged");

  const [selectedSubId, setSelectedSubId] = useState(submissions[0]?.submissionId ?? "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selected = submissions.find((s) => s.submissionId === selectedSubId);
  const alreadyFiled = selected?.filedAppeals.some((a: any) => a.type === "score") ?? false;

  async function handleSubmit() {
    if (!selected) { toast.error("Select an exam first"); return; }
    if (!reason.trim()) { toast.error("Please explain your reason"); return; }
    if (alreadyFiled) { toast.error("You already filed a score dispute for this exam"); return; }

    setSubmitting(true);
    try {
      await submitAppeal({
        data: { submissionId: selected.submissionId, examId: selected.examId, type: "score", reason },
      });
      toast.success("Score dispute submitted!");
      navigate({ to: "/student/appeals" });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to submit appeal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        badge="Score dispute"
        badgeColor="bg-lime"
        title="Score dispute"
        subtitle="Dispute incorrect marking within 7 days of the result."
      />

      <div className="mb-4">
        <Link
          to="/student/appeals/new"
          className="inline-flex items-center gap-1 text-sm font-mono text-muted-foreground hover:text-ink"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to appeal types
        </Link>
      </div>

      {submissions.length === 0 ? (
        <Card className="max-w-2xl text-center py-12 text-ink/50">
          No eligible exams for a score dispute. Only submitted or graded exams
          within the 7-day window are eligible.
        </Card>
      ) : (
        <Card className="max-w-2xl space-y-5">
          <div>
            <label className="text-xs font-mono uppercase tracking-widest">Exam</label>
            <select
              className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background"
              value={selectedSubId}
              onChange={(e) => setSelectedSubId(e.target.value)}
            >
              {submissions.map((s) => (
                <option key={s.submissionId} value={s.submissionId}>
                  {s.classCode} — {s.examTitle}
                </option>
              ))}
            </select>

            {selected && (
              <div className="mt-2 flex flex-wrap gap-4 text-xs font-mono text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {daysLeft(selected.deadlineAt)} day{daysLeft(selected.deadlineAt) !== 1 ? "s" : ""} left · deadline {fmt(selected.deadlineAt)}
                </span>
                <span>Score: {selected.score ?? selected.autoScore} pts</span>
              </div>
            )}
          </div>

          {alreadyFiled && (
            <div className="p-3 rounded-xl border-2 border-pink bg-pink/10 text-sm text-pink font-semibold">
              You already filed a score dispute for this exam.
            </div>
          )}

          <div>
            <label className="text-xs font-mono uppercase tracking-widest">Your reasoning</label>
            <textarea
              rows={7}
              className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background resize-none focus:outline-none"
              placeholder="Which question was marked incorrectly and why? Reference the question and explain the marking error…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="text-xs font-mono text-muted-foreground mt-1 text-right">
              {reason.length} chars
            </div>
          </div>

          <WakeoutButton
            type="button"
            variant="primary"
            disabled={submitting || alreadyFiled || !reason.trim()}
            onClick={handleSubmit}
            className="w-full rounded-2xl"
          >
            {submitting ? "Submitting…" : "Submit score dispute"}
          </WakeoutButton>
        </Card>
      )}
    </>
  );
}
