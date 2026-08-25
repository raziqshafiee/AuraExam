import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useEffect } from "react";
import { PageHeader, Card, Stat, Section, Empty } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { Countdown } from "@/components/brand/countdown";
import { getLecturerDashboardData } from "@/lib/supabase/funcs";
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Clock,
  Radio,
  ShieldAlert,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/lecturer/")({
  head: () => ({ meta: [{ title: "Lecturer · Dashboard — Aura" }] }),
  loader: async () => getLecturerDashboardData(),
  component: LecturerDashboard,
});


function AssignmentBar({ submitted, total }: { submitted: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((submitted / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-secondary border border-ink/20 overflow-hidden">
        <div className="h-full rounded-full bg-violet" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
        {submitted}/{total}
      </span>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-secondary text-muted-foreground",
  upcoming: "bg-amber",
  live: "bg-pink text-white",
  closed: "bg-secondary",
  graded: "bg-lime",
};

function LecturerDashboard() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.invalidate(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  const {
    profile,
    classes,
    exams,
    questionsCount,
    pendingEssaysCount,
    liveExams,
    pendingAppeals,
    flaggedSubs,
    assignments,
    enrolledByClass,
  } = Route.useLoaderData();

  const hasActionItems =
    (pendingEssaysCount as number) > 0 ||
    (pendingAppeals as any[]).length > 0 ||
    (flaggedSubs as any[]).length > 0;

  const classSummaries = useMemo(() => {
    const now = new Date();
    return (classes as any[]).map((cls) => {
      const classExams = (exams as any[]).filter((e) => e.class_id === cls.id);
      const nextExam = classExams.find(
        (e) => e.status === "live" || e.status === "upcoming"
      );
      const activeAssignments = (assignments as any[]).filter(
        (a) => a.class_id === cls.id && new Date(a.end_at) > now
      );
      return {
        cls,
        nextExam,
        activeAssignments,
        enrolled: (enrolledByClass as Record<string, number>)[cls.id] ?? 0,
      };
    });
  }, [classes, exams, assignments, enrolledByClass]);

  return (
    <>
      <PageHeader
        badge="Teaching"
        badgeColor="bg-violet"
        title={`Hey ${(profile as any)?.name?.split(" ")[0] || "there"} 👋`}
        subtitle="Your classes and action items at a glance."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Stat label="Classes" value={(classes as any[]).length} color="bg-lime" />
        <Stat label="Question bank" value={questionsCount as number} color="bg-sky" />
        <Stat label="Pending essays" value={pendingEssaysCount as number} color="bg-amber" />
        <Stat label="Pending appeals" value={(pendingAppeals as any[]).length} color="bg-pink" />
      </div>

      {/* Action items */}
      {hasActionItems && (
        <Section title="Action items">
          <div className="space-y-3">
            {/* Essay grading */}
            {(pendingEssaysCount as number) > 0 && (
              <Card className="flex items-center gap-4 border-amber bg-amber/5">
                <div className="w-10 h-10 rounded-xl border-2 border-ink bg-amber flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">
                    {pendingEssaysCount as number} essay answer{(pendingEssaysCount as number) !== 1 ? "s" : ""} awaiting your grade
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Students are waiting for their results.
                  </div>
                </div>
                <WakeoutButton asChild size="sm" variant="secondary">
                  <Link to="/lecturer/exams">Grade now →</Link>
                </WakeoutButton>
              </Card>
            )}

            {/* Pending appeals */}
            {(pendingAppeals as any[]).map((appeal: any) => (
              <Card key={appeal.id} className="flex items-center gap-4 border-violet bg-violet/5">
                <div className="w-10 h-10 rounded-xl border-2 border-ink bg-violet flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {appeal.profiles?.name ?? "Student"} — {appeal.exam_title}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {appeal.type} appeal · Pending your decision
                  </div>
                </div>
                <WakeoutButton asChild size="sm" variant="secondary">
                  <Link to="/lecturer/appeals">Review →</Link>
                </WakeoutButton>
              </Card>
            ))}

            {/* Flagged submissions */}
            {(flaggedSubs as any[]).map((sub: any) => (
              <Card key={sub.id} className="flex items-center gap-4 border-pink bg-pink/5">
                <div className="w-10 h-10 rounded-xl border-2 border-ink bg-pink flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {sub.profiles?.name ?? "Student"} — {sub.exams?.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {sub.exams?.classes?.code} · Auto-submitted after {sub.flags} flag{sub.flags !== 1 ? "s" : ""}
                  </div>
                </div>
                <WakeoutButton asChild size="sm" variant="secondary">
                  <Link
                    to="/lecturer/exams/$examId/results"
                    params={{ examId: sub.exam_id ?? "" }}
                  >
                    View →
                  </Link>
                </WakeoutButton>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* Live exams */}
      {(liveExams as any[]).length > 0 && (
        <Section
          title={
            <span className="inline-flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-pink opacity-75 animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pink" />
              </span>
              Live now
            </span>
          }
        >
          <div className="grid md:grid-cols-2 gap-4">
            {(liveExams as any[]).map((e: any) => (
              <Card key={e.id} className="flex items-start gap-4 border-pink bg-pink/5">
                <div className="w-12 h-12 rounded-2xl border-2 border-ink bg-pink flex items-center justify-center shrink-0">
                  <Radio className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-muted-foreground">{e.classCode}</div>
                  <div className="font-display font-bold text-lg">{e.title}</div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      {e.inProgressCount} in progress · {e.submittedCount} / {e.enrolledCount} submitted
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Closes in</span>
                      <Countdown to={e.end_time} />
                    </span>
                  </div>
                  <div className="mt-3">
                    <WakeoutButton asChild size="sm" variant="violet">
                      <Link to="/lecturer/exams/$examId/monitor" params={{ examId: e.id }}>
                        Monitor <ChevronRight className="w-4 h-4" />
                      </Link>
                    </WakeoutButton>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* Per-class summary */}
      <Section
        title="Your classes"
        action={
          <WakeoutButton asChild size="sm" variant="ghost">
            <Link to="/lecturer/classes">See all →</Link>
          </WakeoutButton>
        }
      >
        {classSummaries.length === 0 ? (
          <Empty title="No classes yet" />
        ) : (
          <div className="rounded-3xl border-2 border-ink bg-card shadow-brut overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-ink/5 text-left">
                    <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-ink/70 font-semibold">Class</th>
                    <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-ink/70 font-semibold">Next exam</th>
                    <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-ink/70 font-semibold">Assignments</th>
                    <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-ink/70 font-semibold">Enrolled</th>
                    <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-ink/70 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-ink/10">
                  {classSummaries.map(({ cls, nextExam, activeAssignments, enrolled }) => (
                    <tr key={cls.id} className="hover:bg-ink/5 transition-colors align-top">
                      <td className="px-5 py-4 min-w-[180px]">
                        <Link
                          to="/lecturer/classes/$classId"
                          params={{ classId: cls.id }}
                          className="inline-flex flex-col items-start gap-1.5 group"
                        >
                          <span className="px-2.5 py-0.5 rounded-full border-2 border-ink text-[10px] font-mono font-bold uppercase bg-violet tracking-widest text-white">
                            {cls.code}
                          </span>
                          <span className="font-display font-bold text-base leading-tight group-hover:underline">
                            {cls.name}
                          </span>
                        </Link>
                      </td>

                      <td className="px-5 py-4 min-w-[200px]">
                        {nextExam ? (
                          <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full border border-ink text-[10px] font-mono uppercase tracking-widest ${STATUS_COLORS[nextExam.status] ?? "bg-card"}`}>
                                {nextExam.status}
                              </span>
                              <span className="font-display font-bold text-sm leading-tight">{nextExam.title}</span>
                            </div>
                            {nextExam.status === "live" ? (
                              <div className="flex items-center gap-1 text-pink font-semibold">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span className="text-xs">Closes in</span>
                                <Countdown to={nextExam.end_time} />
                              </div>
                            ) : nextExam.status === "upcoming" ? (
                              <div className="flex items-center gap-1 text-ink/70">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span className="text-xs">Starts in</span>
                                <Countdown to={nextExam.start_time} />
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-sm text-ink/50">No exam scheduled</span>
                        )}
                      </td>

                      <td className="px-5 py-4 min-w-[200px]">
                        {activeAssignments.length > 0 ? (
                          <div className="space-y-3">
                            {activeAssignments.slice(0, 2).map((a: any) => (
                              <div key={a.id}>
                                <div className="text-sm font-semibold leading-tight mb-1 truncate">{a.title}</div>
                                <AssignmentBar submitted={a.submittedCount} total={a.enrolledCount} />
                                <div className="flex items-center gap-1 mt-1 text-ink/70">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  <span className="text-xs">Due in</span>
                                  <Countdown to={a.end_at} />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-ink/50">No active assignments</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex items-center justify-center min-w-[34px] px-2.5 py-0.5 rounded-full border-2 border-ink bg-sky font-mono text-xs font-bold">
                          <Users className="w-3 h-3 mr-1" />
                          {enrolled}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {nextExam && (
                            <WakeoutButton asChild size="sm" variant="sky">
                              <Link to="/lecturer/exams/$examId/results" params={{ examId: nextExam.id }}>
                                Results
                              </Link>
                            </WakeoutButton>
                          )}
                          {nextExam?.status === "live" && (
                            <WakeoutButton asChild size="sm" variant="violet">
                              <Link to="/lecturer/exams/$examId/monitor" params={{ examId: nextExam.id }}>
                                Monitor
                              </Link>
                            </WakeoutButton>
                          )}
                          {!nextExam && (
                            <WakeoutButton asChild size="sm" variant="secondary">
                              <Link to="/lecturer/classes/$classId" params={{ classId: cls.id }}>
                                Open
                              </Link>
                            </WakeoutButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* Quick actions */}
      <Section title="Quick actions">
        <div className="grid md:grid-cols-3 gap-4">
          <WakeoutButton asChild className="h-20 text-lg">
            <Link to="/lecturer/exams/new">+ New exam</Link>
          </WakeoutButton>
          <WakeoutButton asChild variant="pink" className="h-20 text-lg">
            <Link to="/lecturer/question-bank/new">+ New question</Link>
          </WakeoutButton>
          <WakeoutButton asChild variant="violet" className="h-20 text-lg">
            <Link to="/lecturer/classes">Open classes</Link>
          </WakeoutButton>
        </div>
      </Section>
    </>
  );
}
