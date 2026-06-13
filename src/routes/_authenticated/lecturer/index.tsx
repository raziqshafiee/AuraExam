import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader, Card, Stat, Section, Empty } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { Countdown } from "@/components/brand/countdown";
import { getLecturerDashboardData } from "@/lib/supabase/funcs";
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Clock,
  FileText,
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
        <Stat label="Classes" value={(classes as any[]).length} color="bg-violet" />
        <Stat label="Question bank" value={questionsCount as number} color="bg-lime" />
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
                      {e.inProgressCount} / {e.enrolledCount} in progress
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
          <div className="space-y-4">
            {classSummaries.map(({ cls, nextExam, activeAssignments, enrolled }) => (
              <Card key={cls.id} className="p-0 overflow-hidden">
                {/* Class header */}
                <div className="flex items-center justify-between px-5 py-3 bg-ink/5 border-b-2 border-ink/10">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-0.5 rounded-full border-2 border-ink text-[10px] font-mono font-bold uppercase bg-violet tracking-widest shrink-0 text-white">
                      {cls.code}
                    </span>
                    <div>
                      <div className="font-display font-bold text-base leading-tight">{cls.name}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="w-3 h-3" />
                        {enrolled} student{enrolled !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <Link to="/lecturer/classes/$classId" params={{ classId: cls.id }}>
                    <ChevronRight className="w-5 h-5 text-muted-foreground hover:text-ink transition-colors" />
                  </Link>
                </div>

                <div className="px-5 py-4 grid sm:grid-cols-2 gap-4">
                  {/* Next exam */}
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                      Next Exam
                    </div>
                    {nextExam ? (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full border border-ink text-[10px] font-mono uppercase tracking-widest ${STATUS_COLORS[nextExam.status] ?? "bg-card"}`}>
                            {nextExam.status}
                          </span>
                        </div>
                        <div className="font-medium text-sm leading-tight mb-1">{nextExam.title}</div>
                        {nextExam.status === "live" ? (
                          <div className="flex items-center gap-1 text-muted-foreground mb-2">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span className="text-xs">Closes in</span>
                            <Countdown to={nextExam.end_time} />
                          </div>
                        ) : nextExam.status === "upcoming" ? (
                          <div className="flex items-center gap-1 text-muted-foreground mb-2">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span className="text-xs">Starts in</span>
                            <Countdown to={nextExam.start_time} />
                          </div>
                        ) : null}
                        <div className="flex gap-2">
                          <WakeoutButton asChild size="sm" variant="sky">
                            <Link to="/lecturer/exams/$examId/results" params={{ examId: nextExam.id }}>
                              Results
                            </Link>
                          </WakeoutButton>
                          {nextExam.status === "live" && (
                            <WakeoutButton asChild size="sm" variant="violet">
                              <Link to="/lecturer/exams/$examId/monitor" params={{ examId: nextExam.id }}>
                                Monitor
                              </Link>
                            </WakeoutButton>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No exam scheduled</div>
                    )}
                  </div>

                  {/* Active assignments */}
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Assignments
                    </div>
                    {activeAssignments.length > 0 ? (
                      <div className="space-y-2.5">
                        {activeAssignments.slice(0, 2).map((a: any) => (
                          <div key={a.id}>
                            <div className="text-sm font-medium leading-tight mb-1 truncate">{a.title}</div>
                            <AssignmentBar submitted={a.submittedCount} total={a.enrolledCount} />
                            <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span className="text-xs">Due in</span>
                              <Countdown to={a.end_at} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No active assignments</div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
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
