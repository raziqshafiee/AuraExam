import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHeader, Section } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getStudentAppeals, type Appeal } from "@/lib/supabase/appeals";
import { fmtMY } from "@/lib/datetime";
import { Clock, CheckCircle, XCircle, Hourglass, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/student/appeals/")({
  head: () => ({ meta: [{ title: "Appeals — Aura" }] }),
  loader: () => getStudentAppeals(),
  component: StudentAppeals,
});

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber",
  approved: "bg-lime",
  rejected: "bg-pink",
};

function daysLeft(deadlineAt: string) {
  const diff = new Date(deadlineAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function fmt(iso: string) {
  return fmtMY(iso, { dateStyle: "medium", timeStyle: "short" });
}

function StudentAppeals() {
  const appeals = Route.useLoaderData() as Appeal[];
  const pending = appeals.filter((a) => a.status === "pending");
  const resolved = appeals.filter((a) => a.status !== "pending");

  return (
    <>
      <PageHeader
        badge="7-day window"
        badgeColor="bg-amber"
        title="Your appeals"
        action={
          <WakeoutButton asChild>
            <Link to="/student/appeals/new">+ New appeal</Link>
          </WakeoutButton>
        }
      />

      {appeals.length === 0 ? (
        <Card className="text-center py-12 text-ink/50">
          No appeals filed yet.
        </Card>
      ) : (
        <>
          {pending.length > 0 && (
            <Section title="Pending">
              <div className="space-y-3">
                {pending.map((a) => <AppealCard key={a.id} appeal={a} />)}
              </div>
            </Section>
          )}
          {resolved.length > 0 && (
            <Section title="Resolved">
              <div className="space-y-3">
                {resolved.map((a) => <AppealCard key={a.id} appeal={a} />)}
              </div>
            </Section>
          )}
        </>
      )}
    </>
  );
}

function AppealCard({ appeal }: { appeal: Appeal }) {
  const days = daysLeft(appeal.deadlineAt);

  return (
    <Card
      className={
        appeal.status === "rejected"
          ? "bg-pink/5"
          : appeal.status === "approved"
            ? "bg-lime/10"
            : ""
      }
    >
      <div className="flex items-start gap-4 flex-wrap">
        <span
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-ink text-xs font-mono uppercase tracking-widest ${STATUS_COLORS[appeal.status] ?? "bg-card"}`}
        >
          {appeal.status === "pending" && <Hourglass className="w-3.5 h-3.5" />}
          {appeal.status === "approved" && <CheckCircle className="w-3.5 h-3.5" />}
          {appeal.status === "rejected" && <XCircle className="w-3.5 h-3.5" />}
          {appeal.status}
        </span>
        <span className="px-3 py-1 rounded-full border-2 border-ink/30 text-xs font-mono uppercase tracking-widest text-ink/60">
          {appeal.type === "integrity" ? "integrity" : "score dispute"}
        </span>

        <div className="flex-1 min-w-[240px]">
          <div className="font-display font-bold">
            {appeal.classCode} — {appeal.examTitle}
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{appeal.reason}</p>

          {appeal.lecturerReply && (
            <div className="mt-3 p-3 rounded-xl border-2 border-ink/20 bg-secondary text-sm">
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                Lecturer response
              </div>
              {appeal.lecturerReply}
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-4 text-xs font-mono text-muted-foreground">
            <span>Filed {fmt(appeal.submittedAt)}</span>
            {appeal.status === "pending" && (
              <span className={`flex items-center gap-1 ${days <= 1 ? "text-pink font-semibold" : ""}`}>
                <Clock className="w-3 h-3" />
                {days} day{days !== 1 ? "s" : ""} left
              </span>
            )}
            {appeal.decidedAt && <span>Decided {fmt(appeal.decidedAt)}</span>}
          </div>

          {appeal.status === "approved" && appeal.type === "integrity" && (
            <div className="mt-4">
              {appeal.submissionStatus === "retake-approved" ? (
                <WakeoutButton asChild size="sm" variant="primary">
                  <Link
                    to="/student/exams/$examId/lobby"
                    params={{ examId: appeal.examId }}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Go retake exam
                  </Link>
                </WakeoutButton>
              ) : (
                <span className="text-xs font-mono text-muted-foreground">Retake completed</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
