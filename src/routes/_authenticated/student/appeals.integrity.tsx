import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { Clock, ChevronLeft, ShieldAlert } from "lucide-react";
import { fmtMY } from "@/lib/datetime";
import { getAppealableSubmissions, submitAppeal } from "@/lib/supabase/appeals";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/student/appeals/integrity")({
  head: () => ({ meta: [{ title: "Integrity appeal — Aura" }] }),
  loader: () => getAppealableSubmissions(),
  component: IntegrityAppeal,
});

function daysLeft(deadlineAt: string) {
  const diff = new Date(deadlineAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function fmt(iso: string) {
  return fmtMY(iso, { dateStyle: "medium", timeStyle: "short" });
}

function IntegrityAppeal() {
  const all = Route.useLoaderData() as any[];
  const navigate = useNavigate();

  // Integrity appeals are only for flagged submissions
  const submissions = all.filter((s) => s.status === "flagged");

  const [selectedSubId, setSelectedSubId] = useState(submissions[0]?.submissionId ?? "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selected = submissions.find((s) => s.submissionId === selectedSubId);
  const alreadyFiled = selected?.filedAppeals.some((a: any) => a.type === "integrity") ?? false;

  async function handleSubmit() {
    if (!selected) { toast.error("Select an exam first"); return; }
    if (!reason.trim()) { toast.error("Please explain your reason"); return; }
    if (alreadyFiled) { toast.error("You already filed an integrity appeal for this exam"); return; }

    setSubmitting(true);
    try {
      await submitAppeal({
        data: { submissionId: selected.submissionId, examId: selected.examId, type: "integrity", reason },
      });
      toast.success("Integrity appeal submitted!");
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
        badge="Integrity appeal"
        badgeColor="bg-amber"
        title="Integrity appeal"
        subtitle="Dispute proctoring flags within 7 days of the result."
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
          No eligible exams for an integrity appeal. Only flagged submissions within
          the 7-day window are eligible.
        </Card>
      ) : (
        <>
          <Card className="max-w-2xl mb-5 border-amber/60 bg-amber/5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <div className="font-semibold">How integrity appeals work</div>
                <p className="text-muted-foreground">
                  Explain each flag incident and why it was not a violation. The
                  lecturer reviews your submission against proctoring evidence. If
                  approved, you will be allowed to retake the exam from scratch —
                  your previous score is replaced by the retake result. If rejected
                  or no appeal within 7 days, the score of 0 becomes final.
                </p>
              </div>
            </div>
          </Card>

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
                  <span className="text-pink font-semibold">
                    FLAGGED · earned score: {selected.autoScore} pts
                  </span>
                </div>
              )}
            </div>

            {alreadyFiled && (
              <div className="p-3 rounded-xl border-2 border-pink bg-pink/10 text-sm text-pink font-semibold">
                You already filed an integrity appeal for this exam.
              </div>
            )}

            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Explain each flag incident</label>
              <textarea
                rows={7}
                className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background resize-none focus:outline-none"
                placeholder="Describe each flagged incident and explain why it was not a violation…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="text-xs font-mono text-muted-foreground mt-1 text-right">
                {reason.length} chars
              </div>
            </div>

            <WakeoutButton
              type="button"
              disabled={submitting || alreadyFiled || !reason.trim()}
              onClick={handleSubmit}
              className="w-full rounded-2xl"
            >
              {submitting ? "Submitting…" : "Submit integrity appeal"}
            </WakeoutButton>
          </Card>
        </>
      )}
    </>
  );
}
