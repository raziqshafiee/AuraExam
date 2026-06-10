import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Card } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getStudentExams } from "@/lib/supabase/exams";
import { fmtMY } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/student/exams/")({
  head: () => ({ meta: [{ title: "Exams — Aura" }] }),
  loader: () => getStudentExams(),
  component: StudentExams,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-card",
  upcoming: "bg-amber",
  live: "bg-pink",
  closed: "bg-secondary",
  graded: "bg-lime",
};

function StudentExams() {
  const exams = Route.useLoaderData();

  return (
    <>
      <PageHeader badge="All papers" badgeColor="bg-sky" title="Your exams" />
      {exams.length === 0 ? (
        <Card className="text-center py-12 text-ink/50">
          No exams available right now.
        </Card>
      ) : (
        <div className="space-y-3">
          {(exams as any[]).map((e) => {
            const subStatus = e.submission?.status;
            const isRetakeApproved = subStatus === "retake-approved";
            const hasResult =
              subStatus === "submitted" ||
              subStatus === "graded" ||
              subStatus === "flagged";
            const linkTo = hasResult
              ? "/student/exams/$examId/result"
              : "/student/exams/$examId/lobby";
            const btnLabel = isRetakeApproved
              ? "Retake →"
              : hasResult
                ? "Result →"
                : "Lobby →";

            return (
              <Card key={e.id} className="flex items-center gap-4 flex-wrap">
                <span
                  className={`px-2.5 py-1 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest ${STATUS_COLORS[e.status] ?? "bg-card"}`}
                >
                  {e.status}
                </span>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-xs font-mono text-muted-foreground">
                    {e.classCode}
                  </div>
                  <div className="font-display font-bold text-lg">{e.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {fmtMY(e.start_time, { dateStyle: "medium", timeStyle: "short" })}{" "}
                    · {e.duration} min
                  </div>
                </div>
                {e.submission && e.submission.score !== null && e.submission.total && !isRetakeApproved ? (
                  <div className="text-right mr-3">
                    <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                      Score
                    </div>
                    <div className="font-display font-extrabold text-2xl">
                      {Math.round((e.submission.score / e.submission.total) * 100)}%
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                      {e.submission.score} / {e.submission.total} pts
                    </div>
                  </div>
                ) : null}
                {!hasResult || isRetakeApproved ? (
                  <span className="hidden md:inline-flex">
                    <WakeoutButton
                      asChild
                      size="sm"
                      variant={e.status === "upcoming" || e.status === "live" ? "primary" : "secondary"}
                    >
                      <Link to={linkTo} params={{ examId: e.id }}>{btnLabel}</Link>
                    </WakeoutButton>
                  </span>
                ) : (
                  <WakeoutButton asChild size="sm" variant="secondary">
                    <Link to={linkTo} params={{ examId: e.id }}>{btnLabel}</Link>
                  </WakeoutButton>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
