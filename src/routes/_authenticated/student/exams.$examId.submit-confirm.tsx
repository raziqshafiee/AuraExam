import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { submitExam } from "@/lib/supabase/exams";
import { toast } from "sonner";

type SearchParams = {
  submissionId?: string;
  answered?: number;
  flagged?: number;
  skipped?: number;
};

export const Route = createFileRoute(
  "/_authenticated/student/exams/$examId/submit-confirm"
)({
  head: () => ({ meta: [{ title: "Submit exam — Aura" }] }),
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    submissionId: String(search.submissionId ?? ""),
    answered: Number(search.answered ?? 0),
    flagged: Number(search.flagged ?? 0),
    skipped: Number(search.skipped ?? 0),
  }),
  component: SubmitConfirm,
});

function SubmitConfirm() {
  const { examId } = Route.useParams();
  const { submissionId, answered, flagged, skipped } = Route.useSearch();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // Answers are stored in sessionStorage (not the URL) to avoid truncation
      // of long essay responses in browsers with short URL limits.
      let parsedAnswers: Record<string, string> = {};
      try {
        const stored = sessionStorage.getItem(`aura-exam-${submissionId}`);
        parsedAnswers = stored ? JSON.parse(stored) : {};
      } catch {
        parsedAnswers = {};
      }

      await submitExam({
        data: {
          examId,
          submissionId: submissionId ?? "",
          answers: parsedAnswers,
        },
      });

      // Clear the in-flight sessionStorage so the exam state doesn't linger
      // after a successful submission.
      try {
        const key = `aura-exam-${submissionId}`;
        sessionStorage.removeItem(key);
        sessionStorage.removeItem(`${key}-flagged`);
        sessionStorage.removeItem(`${key}-idx`);
      } catch {}

      toast.success("Exam submitted successfully!");
      navigate({
        to: "/student/exams/$examId/result",
        params: { examId },
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to submit exam");
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        badge="One more step"
        badgeColor="bg-pink"
        title="Review & submit"
      />
      <Card className="max-w-lg">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="font-display font-extrabold text-3xl text-violet">
              {answered ?? 0}
            </div>
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Answered
            </div>
          </div>
          <div>
            <div className="font-display font-extrabold text-3xl text-amber">
              {flagged ?? 0}
            </div>
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Flagged
            </div>
          </div>
          <div>
            <div className="font-display font-extrabold text-3xl text-muted-foreground">
              {skipped ?? 0}
            </div>
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Skipped
            </div>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Once you submit you can't reopen this paper. Sure you're good?
        </p>
        <div className="mt-6 flex gap-3">
          <WakeoutButton asChild variant="secondary" className="flex-1">
            <Link
              to="/student/exams/$examId/take"
              params={{ examId }}
            >
              Back to exam
            </Link>
          </WakeoutButton>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="flex-1 border-2 border-ink rounded-2xl px-4 py-3 font-bold bg-pink text-white hover:shadow-brut transition-all disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </Card>
    </>
  );
}
