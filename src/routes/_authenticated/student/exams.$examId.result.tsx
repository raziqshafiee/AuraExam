import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Card, PageHeader, Section } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getStudentExamResult } from "@/lib/supabase/exams";
import { AlertTriangle, RefreshCw, CheckCircle, XCircle, FileText, ClipboardX, UserX } from "lucide-react";
import { fmtMY } from "@/lib/datetime";
import { renderMarkdown } from "@/lib/render-text";

export const Route = createFileRoute(
  "/_authenticated/student/exams/$examId/result"
)({
  head: () => ({ meta: [{ title: "Result — Aura" }] }),
  loader: async ({ params }) => {
    try {
      return await getStudentExamResult({ data: params.examId });
    } catch (err: any) {
      if (err?.message === "No submission found for this exam") {
        throw redirect({ to: "/student/exams/$examId/lobby", params });
      }
      throw err;
    }
  },
  component: Result,
});

const LETTERS = ["A", "B", "C", "D"];

function Result() {
  const { exam, submission, review } = Route.useLoaderData() as any;

  const isFlagged = submission.status === "flagged";
  const isRetakeApproved = submission.status === "retake-approved";
  const isForceSubmitted = submission.forceSubmitted === true;
  const isMissed = submission.missed === true;
  const score = submission.score ?? 0;
  const total = submission.total ?? 0;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <>
      <PageHeader
        badge={exam.classCode}
        badgeColor={isFlagged ? "bg-pink" : "bg-sky"}
        title={exam.title}
        subtitle={
          isRetakeApproved
            ? "Retake approved — ready to retake"
            : isFlagged
              ? "Auto-submitted · integrity flags"
              : isMissed
                ? "Exam closed · not attended"
                : isForceSubmitted
                  ? "Exam closed · no answers recorded"
                  : "Submitted · auto-graded"
        }
      />

      {isForceSubmitted && (
        <Card className="mb-6 border-ink/30 bg-secondary">
          <div className="flex items-start gap-3">
            <ClipboardX className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <div className="font-display font-bold text-lg">No answers submitted</div>
              <p className="text-sm mt-1 text-muted-foreground">
                The exam window closed before you submitted any answers. Your session was recorded as
                present but no responses were received — your score for this paper is{" "}
                <strong>0 / {total} pts</strong>.
              </p>
              <p className="text-sm mt-2 text-muted-foreground">
                If you believe this is a mistake, you may file a score appeal within 7 days.
              </p>
              <div className="mt-4">
                <WakeoutButton asChild size="sm" variant="secondary">
                  <Link to="/student/appeals/new">File score appeal</Link>
                </WakeoutButton>
              </div>
            </div>
          </div>
        </Card>
      )}

      {isMissed && (
        <Card className="mb-6 border-ink/30 bg-secondary">
          <div className="flex items-start gap-3">
            <UserX className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <div className="font-display font-bold text-lg">You did not attend this exam</div>
              <p className="text-sm mt-1 text-muted-foreground">
                No submission was recorded for this paper. Your score is{" "}
                <strong>0 / {total} pts</strong>.
              </p>
              <p className="text-sm mt-2 text-muted-foreground">
                If you believe this is an error, you may file a score appeal within 7 days.
              </p>
              <div className="mt-4">
                <WakeoutButton asChild size="sm" variant="secondary">
                  <Link to="/student/appeals/new">File score appeal</Link>
                </WakeoutButton>
              </div>
            </div>
          </div>
        </Card>
      )}

      {isRetakeApproved && (
        <Card className="mb-6 border-amber bg-amber/10">
          <div className="flex items-start gap-3">
            <RefreshCw className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-display font-bold text-lg">Retake approved by your lecturer</div>
              <p className="text-sm mt-1 text-muted-foreground">
                Your integrity appeal was approved. Head to the exam lobby to start a fresh attempt —
                your previous answers, flags, and score will be cleared.
              </p>
              <div className="mt-4">
                <WakeoutButton asChild variant="primary">
                  <Link to="/student/exams/$examId/lobby" params={{ examId: exam.id }}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Go retake exam
                  </Link>
                </WakeoutButton>
              </div>
            </div>
          </div>
        </Card>
      )}

      {isFlagged && submission.flagReasons.length > 0 && (
        <Card className="mb-6 bg-pink/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-pink shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-display font-bold text-lg">
                Exam auto-submitted — integrity flags detected
              </div>
              <p className="text-sm mt-1 text-muted-foreground">
                Your score is currently{" "}
                <strong>0 / {total} pts (0%)</strong>
                . You have <strong>7 days</strong> from the submission time to
                file an integrity appeal. If no appeal is received within that
                window, the score of 0 becomes final.
              </p>
              <div className="mt-4 border-t-2 border-ink/10 pt-4 space-y-2">
                <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  What was flagged ({submission.flags} incident
                  {submission.flags !== 1 ? "s" : ""})
                </div>
                {submission.flagReasons.map((f: { time: string; type: string; label: string }, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="font-mono text-xs bg-secondary px-2 py-0.5 rounded border border-ink/20">
                      {f.time}
                    </span>
                    <span>{f.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <WakeoutButton asChild variant="primary">
                  <Link to="/student/appeals/new">File integrity appeal</Link>
                </WakeoutButton>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-[1fr_auto] gap-6">
        <Card className={isFlagged ? "bg-secondary" : "bg-lime"}>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full border-2 border-ink bg-ink/10 flex items-center justify-center text-2xl">
              {isFlagged ? "🚨" : pct >= 50 ? "🎉" : "📝"}
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-widest">
                Your score
              </div>
              <div className="font-display font-extrabold text-5xl leading-tight">
                {isFlagged ? 0 : score}{" "}
                <span className="text-2xl font-mono font-normal text-muted-foreground">/ {total} pts</span>
              </div>
              <div className="font-display font-bold text-xl mt-1">
                {isFlagged
                  ? "Score locked — appeal to dispute"
                  : submission.status === "graded"
                    ? `${pct}% — graded`
                    : `${pct}% — pending essay grading`}
              </div>
            </div>
          </div>
        </Card>

        {!isFlagged && (
          <Card>
            <div className="font-display font-bold mb-2">Details</div>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>
                Status:{" "}
                <span className="font-semibold text-ink">
                  {submission.status}
                </span>
              </li>
              {submission.submittedAt && (
                <li>
                  Submitted:{" "}
                  <span className="font-semibold text-ink">
                    {fmtMY(submission.submittedAt, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </li>
              )}
              <li>
                Flags:{" "}
                <span className="font-semibold text-ink">
                  {submission.flags}
                </span>
              </li>
            </ul>
            <div className="mt-4">
              <WakeoutButton asChild size="sm" variant="secondary">
                <Link to="/student/appeals/new">Appeal score</Link>
              </WakeoutButton>
            </div>
          </Card>
        )}
      </div>

      {review && review.length > 0 && (
        <div className="mt-8">
          <div className="font-display font-bold text-xl mb-4">Answer review</div>
          <div className="space-y-4">
            {review.map((q: any, i: number) => {
              const isEssay = q.type === "ESSAY";
              const isMCQ = q.type === "MCQ";
              const isTF = q.type === "TF";
              const options: string[] = q.meta?.options ?? [];
              const optionImages: (string | null)[] = (q.meta as any)?.option_images ?? [null, null, null, null];
              const essayGraded = isEssay && q.essayScore !== null;

              return (
                <Card key={q.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="shrink-0 w-7 h-7 rounded-full border-2 border-ink bg-secondary flex items-center justify-center text-xs font-mono font-bold">
                        {i + 1}
                      </span>
                      <div>
                        {(q.meta as any)?.image_url && (
                          <img
                            src={(q.meta as any).image_url}
                            alt="Question image"
                            className="mb-2 rounded-lg border border-ink/20 max-h-40 object-contain"
                          />
                        )}
                        <p
                          className="text-sm leading-relaxed pt-0.5"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(q.text) }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {isEssay && essayGraded ? `${q.essayScore} / ${q.points} pts` : `${q.points} pt${q.points !== 1 ? "s" : ""}`}
                    </span>
                  </div>

                  {isMCQ && (
                    <div className="grid gap-2 pl-10">
                      {q.essayAnswer ? (
                        options.map((opt: string, idx: number) => {
                          const isChosen = LETTERS[idx] === q.essayAnswer;
                          const isCorrect = isChosen && q.essayScore > 0;
                          const isWrong = isChosen && q.essayScore === 0;
                          return (
                            <div
                              key={idx}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm ${
                                isCorrect ? "border-lime bg-lime/20 font-semibold"
                                : isWrong ? "border-pink bg-pink/10 font-semibold"
                                : "border-ink/20 bg-secondary"
                              }`}
                            >
                              {isCorrect ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                               : isWrong ? <XCircle className="w-4 h-4 text-pink shrink-0" />
                               : <span className="w-4 h-4 shrink-0" />}
                              <span className="font-mono text-xs mr-1 shrink-0">{LETTERS[idx]}.</span>
                              <span className="flex-1">
                                <span dangerouslySetInnerHTML={{ __html: renderMarkdown(opt) }} />
                                {optionImages[idx] && (
                                  <img src={optionImages[idx]!} alt="" className="mt-1 max-h-20 rounded object-contain border border-ink/20" />
                                )}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No answer submitted.</p>
                      )}
                    </div>
                  )}

                  {isTF && (
                    <div className="flex gap-3 pl-10">
                      {q.essayAnswer ? (
                        ["True", "False"].map((val) => {
                          const isChosen = q.essayAnswer === val;
                          const isCorrect = isChosen && q.essayScore > 0;
                          const isWrong = isChosen && q.essayScore === 0;
                          return (
                            <div
                              key={val}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm ${
                                isCorrect ? "border-lime bg-lime/20 font-semibold"
                                : isWrong ? "border-pink bg-pink/10 font-semibold"
                                : "border-ink/20 bg-secondary"
                              }`}
                            >
                              {isCorrect && <CheckCircle className="w-4 h-4 text-green-600" />}
                              {isWrong && <XCircle className="w-4 h-4 text-pink" />}
                              {val}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground italic pl-0">No answer submitted.</p>
                      )}
                    </div>
                  )}

                  {isEssay && (
                    <div className="pl-10 space-y-2">
                      {q.essayAnswer ? (
                        <div>
                          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">Your answer</div>
                          <div className="bg-secondary rounded-xl border-2 border-ink/20 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                            {q.essayAnswer}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground italic">No answer submitted.</div>
                      )}
                      {essayGraded ? (
                        <div className={`flex items-center gap-2 text-sm font-semibold ${q.essayScore > 0 ? "text-green-700" : "text-muted-foreground"}`}>
                          <CheckCircle className="w-4 h-4" />
                          {q.essayScore} / {q.points} pts awarded
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs font-mono text-amber-700">
                          <FileText className="w-3.5 h-3.5" /> Pending lecturer grading
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6">
        <WakeoutButton asChild variant="ghost" size="sm">
          <Link to="/student/exams">← Back to exams</Link>
        </WakeoutButton>
      </div>
    </>
  );
}
