import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Card, Stat, Section, Empty } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getStudentDashboardData } from "@/lib/supabase/funcs";
import { fmtMY } from "@/lib/datetime";
import { Calendar, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/student/")({
  head: () => ({ meta: [{ title: "Dashboard — Aura" }] }),
  loader: async () => {
    return await getStudentDashboardData();
  },
  component: StudentDashboard,
});

function fmt(iso: string) {
  return fmtMY(iso, { dateStyle: "medium", timeStyle: "short" });
}

function StudentDashboard() {
  const { profile, classes, exams, submissions, unreadCount } = Route.useLoaderData();
  
  const upcoming = exams.filter((e: any) => e.status === "upcoming");
  const graded = exams.filter((e: any) => e.status === "graded");

  const getSubmission = (examId: string) => submissions.find((s: any) => s.exam_id === examId);

  const gradedSubs = submissions.filter((s: any) => s.status === "graded" && s.score != null);
  const avgScore = gradedSubs.length > 0
    ? Math.round(gradedSubs.reduce((sum: number, s: any) => sum + s.score, 0) / gradedSubs.length)
    : null;

  return (
    <>
      <PageHeader
        badge="Hello again"
        badgeColor="bg-sky"
        title={`Hey ${profile?.name?.split(' ')[0] || 'there'} 👋`}
        subtitle="Here's what's on your plate this week."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Stat label="Upcoming exams" value={upcoming.length} color="bg-sky" />
        <Stat label="Classes" value={classes.length} color="bg-lime" />
        <Stat label="Avg score" value={avgScore !== null ? `${avgScore} pts` : "--"} color="bg-pink" />
        <Stat label="Unread" value={unreadCount} color="bg-amber" />
      </div>

      <Section
        title="Next up"
        action={<WakeoutButton asChild size="sm" variant="ghost"><Link to="/student/exams">See all →</Link></WakeoutButton>}
      >
        {upcoming.length === 0 ? <Empty title="Nothing scheduled" /> : (
          <div className="grid md:grid-cols-2 gap-4">
            {upcoming.map((e: any) => (
              <Card key={e.id} className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl border-2 border-ink bg-lime flex items-center justify-center"><Calendar className="w-5 h-5" /></div>
                <div className="flex-1">
                  <div className="text-xs font-mono text-muted-foreground">{e.classes?.code}</div>
                  <div className="font-display font-bold text-xl">{e.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">{fmt(e.start_time)} · {e.duration} min · {e.questions_count} questions</div>
                  <span className="hidden md:inline-flex mt-4">
                    <WakeoutButton asChild size="sm">
                      <Link to="/student/exams/$examId/lobby" params={{ examId: e.id }}>Open lobby</Link>
                    </WakeoutButton>
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent results" action={<WakeoutButton asChild size="sm" variant="ghost"><Link to="/student/exams">See all →</Link></WakeoutButton>}>
        {graded.length === 0 ? <Empty title="No results yet" /> : (
          <div className="grid md:grid-cols-2 gap-4">
            {graded.map((e: any) => {
              const sub = getSubmission(e.id);
              return (
                <Card key={e.id}>
                  <div className="text-xs font-mono text-muted-foreground">{e.classes?.code}</div>
                  <div className="font-display font-bold text-xl">{e.title}</div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Score</div>
                      <div className="font-display font-extrabold text-3xl">
                        {sub ? `${sub.score} / ${sub.total}` : `-- / ${e.questions_count}`}
                      </div>
                    </div>
                    <WakeoutButton asChild size="sm" variant="secondary">
                      <Link to="/student/exams/$examId/result" params={{ examId: e.id }}>View <ChevronRight className="w-4 h-4" /></Link>
                    </WakeoutButton>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
