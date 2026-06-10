import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Card, Stat, Section } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getLecturerDashboardData } from "@/lib/supabase/funcs";

export const Route = createFileRoute("/_authenticated/lecturer/")({
  head: () => ({ meta: [{ title: "Lecturer · Dashboard — Aura" }] }),
  loader: async () => {
    return await getLecturerDashboardData();
  },
  component: LecturerDashboard,
});

function LecturerDashboard() {
  const { profile, classes, exams, questionsCount, liveSubmissionsCount, pendingEssaysCount } = Route.useLoaderData();

  return (
    <>
      <PageHeader 
        badge="Teaching" 
        badgeColor="bg-violet" 
        title={`Hey ${profile?.name?.split(' ')[0] || 'there'} 👋`} 
        subtitle="Your classes and exams at a glance." 
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Stat label="Classes" value={classes.length} color="bg-violet text-violet-foreground" />
        <Stat label="Question bank" value={questionsCount} color="bg-lime" />
        <Stat label="Live exams" value={liveSubmissionsCount} color="bg-pink" />
        <Stat label="Pending essays" value={pendingEssaysCount} color="bg-amber" />
      </div>
      <Section title="Quick actions" action={null}>
        <div className="grid md:grid-cols-3 gap-4">
          <WakeoutButton asChild className="h-20 text-lg"><Link to="/lecturer/exams/new">+ New exam</Link></WakeoutButton>
          <WakeoutButton asChild variant="pink" className="h-20 text-lg"><Link to="/lecturer/question-bank/new">+ New question</Link></WakeoutButton>
          <WakeoutButton asChild variant="violet" className="h-20 text-lg"><Link to="/lecturer/classes">Open classes</Link></WakeoutButton>
        </div>
      </Section>
      <Section title="Recent exams">
        <div className="space-y-3">
          {exams.slice(0, 4).map((e: any) => (
            <Card key={e.id} className="flex items-center gap-4 flex-wrap">
              <div className="text-xs font-mono">{e.classes?.code}</div>
              <div className="flex-1 font-display font-bold">{e.title}</div>
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{e.status}</div>
              <WakeoutButton asChild size="sm" variant="secondary"><Link to="/lecturer/exams/$examId/monitor" params={{ examId: e.id }}>Monitor</Link></WakeoutButton>
              <WakeoutButton asChild size="sm" variant="ghost"><Link to="/lecturer/exams/$examId/results" params={{ examId: e.id }}>Results</Link></WakeoutButton>
            </Card>
          ))}
          {exams.length === 0 && (
            <p className="text-muted-foreground text-center py-10">No exams created yet.</p>
          )}
        </div>
      </Section>
    </>
  );
}
