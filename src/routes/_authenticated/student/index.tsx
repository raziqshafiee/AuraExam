import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader, Card, Stat, Section, Empty } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getStudentDashboardData } from "@/lib/supabase/funcs";
import {
  Radio,
  Calendar,
  FileText,
  Megaphone,
  AlertTriangle,
  ChevronRight,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/student/")({
  head: () => ({ meta: [{ title: "Dashboard — Aura" }] }),
  loader: async () => getStudentDashboardData(),
  component: StudentDashboard,
});

function Countdown({ to }: { to: string }) {
  const [diff, setDiff] = useState(() => new Date(to).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => setDiff(new Date(to).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [to]);
  if (diff <= 0) return <span className="font-mono text-xs font-bold text-pink animate-pulse">Now</span>;
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const str = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
  return (
    <span className={`font-mono text-xs font-bold ${diff < 3_600_000 ? "text-pink" : "text-muted-foreground"}`}>
      {str}
    </span>
  );
}

function ScoreBar({ score, total }: { score: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((score / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-secondary border border-ink/20 overflow-hidden">
        <div className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function StudentDashboard() {
  const { profile, classes, exams, submissions, assignments, announcements, appeals, unreadCount } =
    Route.useLoaderData();

  const now = new Date();
  const live = (exams as any[]).filter((e) => e.status === "live");
  const upcoming = (exams as any[]).filter((e) => e.status === "upcoming");

  const getSubmission = (examId: string) =>
    (submissions as any[]).find((s) => s.exam_id === examId);
  const isDone = (status?: string) =>
    status === "submitted" || status === "graded" || status === "flagged";

  const gradedSubs = (submissions as any[]).filter((s) => s.status === "graded" && s.score != null);
  const avgScore =
    gradedSubs.length > 0
      ? Math.round(
          gradedSubs.reduce((sum: number, s: any) => sum + s.score, 0) / gradedSubs.length
        )
      : null;

  const dueSoon = (assignments as any[]).filter(
    (a) => new Date(a.end_at) > now && !a.mySubmission
  );

  const openAppeals = (appeals as any[]).filter((a) => a.status === "pending");

  const classSummaries = (classes as any[]).map((cls) => {
    const classExams = (exams as any[]).filter((e) => e.class_id === cls.id);
    const nextExam = classExams.find((e) => e.status === "live" || e.status === "upcoming");
    const lastResultExam = [...classExams]
      .reverse()
      .find((e) => (e.status === "closed" || e.status === "graded") && getSubmission(e.id));
    const nextAssignment = (assignments as any[])
      .filter((a) => a.class_id === cls.id)
      .find((a) => new Date(a.end_at) > now);
    const latestAnnouncement =
      (announcements as any[]).find((a) => a.class_id === cls.id) ?? null;
    return { cls, nextExam, lastResultExam, nextAssignment, latestAnnouncement };
  });

  return (
    <>
      <PageHeader
        badge="Hello again"
        badgeColor="bg-sky"
        title={`Hey ${(profile as any)?.name?.split(" ")[0] || "there"} 👋`}
        subtitle="Here's your academic overview."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Stat label="Classes" value={(classes as any[]).length} color="bg-lime" />
        <Stat label="Upcoming exams" value={upcoming.length + live.length} color="bg-sky" />
        <Stat label="Assignments due" value={dueSoon.length} color="bg-amber" />
        <Stat
          label="Avg score"
          value={avgScore !== null ? `${avgScore} pts` : "--"}
          color="bg-pink"
        />
      </div>

      {/* Live exams — urgent, always at top */}
      {live.length > 0 && (
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
            {live.map((e: any) => {
              const sub = getSubmission(e.id);
              const done = isDone(sub?.status);
              return (
                <Card key={e.id} className="flex items-start gap-4 border-pink bg-pink/5">
                  <div className="w-12 h-12 rounded-2xl border-2 border-ink bg-pink flex items-center justify-center shrink-0">
                    <Radio className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-muted-foreground">{e.classes?.code}</div>
                    <div className="font-display font-bold text-xl">{e.title}</div>
                    <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs">Closes in</span>
                      <Countdown to={e.end_time} />
                    </div>
                    <div className="mt-4">
                      {done ? (
                        <WakeoutButton asChild size="sm" variant="secondary">
                          <Link to="/student/exams/$examId/result" params={{ examId: e.id }}>
                            View result <ChevronRight className="w-4 h-4" />
                          </Link>
                        </WakeoutButton>
                      ) : (
                        <span className="hidden sm:inline-flex">
                          <WakeoutButton asChild size="sm" variant="pink">
                            <Link to="/student/exams/$examId/lobby" params={{ examId: e.id }}>
                              {sub?.status === "in-progress" ? "Continue exam →" : "Enter exam →"}
                            </Link>
                          </WakeoutButton>
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      {/* Per-class summary */}
      <Section
        title="Your classes"
        action={
          <WakeoutButton asChild size="sm" variant="ghost">
            <Link to="/student/classes">See all →</Link>
          </WakeoutButton>
        }
      >
        {classSummaries.length === 0 ? (
          <Empty title="Not enrolled in any class" />
        ) : (
          <div className="space-y-4">
            {classSummaries.map(
              ({ cls, nextExam, lastResultExam, nextAssignment, latestAnnouncement }) => {
                const lastSub = lastResultExam ? getSubmission(lastResultExam.id) : null;
                return (
                  <Card key={cls.id} className="p-0 overflow-hidden">
                    {/* Class header */}
                    <div className="flex items-center justify-between px-5 py-3 bg-ink/5 border-b-2 border-ink/10">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-0.5 rounded-full border-2 border-ink text-[10px] font-mono font-bold uppercase bg-sky tracking-widest shrink-0">
                          {cls.code}
                        </span>
                        <div>
                          <div className="font-display font-bold text-base leading-tight">
                            {cls.name}
                          </div>
                          {cls.profiles?.name && (
                            <div className="text-xs text-muted-foreground">{cls.profiles.name}</div>
                          )}
                        </div>
                      </div>
                      <Link to="/student/classes/$classId" params={{ classId: cls.id }}>
                        <ChevronRight className="w-5 h-5 text-muted-foreground hover:text-ink transition-colors" />
                      </Link>
                    </div>

                    <div className="px-5 py-4 space-y-4">
                      {/* Exam + Assignment row */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        {/* Next exam */}
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Next Exam
                          </div>
                          {nextExam ? (
                            <div>
                              <div className="font-medium text-sm leading-tight mb-1">
                                {nextExam.title}
                              </div>
                              <div className="flex items-center gap-1.5 mb-2 text-muted-foreground">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span className="text-xs">
                                  {nextExam.status === "live" ? "Closes in" : "Starts in"}
                                </span>
                                <Countdown
                                  to={
                                    nextExam.status === "live"
                                      ? nextExam.end_time
                                      : nextExam.start_time
                                  }
                                />
                              </div>
                              {nextExam.status === "live" &&
                              !isDone(getSubmission(nextExam.id)?.status) ? (
                                <span className="hidden sm:inline-flex">
                                  <WakeoutButton asChild size="sm" variant="pink">
                                    <Link
                                      to="/student/exams/$examId/lobby"
                                      params={{ examId: nextExam.id }}
                                    >
                                      Enter now →
                                    </Link>
                                  </WakeoutButton>
                                </span>
                              ) : nextExam.status === "upcoming" ? (
                                <span className="hidden sm:inline-flex">
                                  <WakeoutButton asChild size="sm" variant="secondary">
                                    <Link
                                      to="/student/exams/$examId/lobby"
                                      params={{ examId: nextExam.id }}
                                    >
                                      Lobby
                                    </Link>
                                  </WakeoutButton>
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">No exam scheduled</div>
                          )}
                        </div>

                        {/* Next assignment */}
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Assignment
                          </div>
                          {nextAssignment ? (
                            <div>
                              <div className="font-medium text-sm leading-tight mb-1">
                                {nextAssignment.title}
                              </div>
                              <div className="flex items-center gap-1.5 mb-2 text-muted-foreground">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span className="text-xs">Due in</span>
                                <Countdown to={nextAssignment.end_at} />
                              </div>
                              {nextAssignment.mySubmission ? (
                                <span className="px-2 py-0.5 rounded-full border-2 border-ink bg-lime text-[10px] font-mono uppercase tracking-widest">
                                  Submitted
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full border-2 border-ink bg-amber text-[10px] font-mono uppercase tracking-widest">
                                  Not submitted
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">No assignment due</div>
                          )}
                        </div>
                      </div>

                      {/* Last result with score bar */}
                      {lastResultExam && lastSub && (
                        <div className="border-t border-ink/10 pt-3">
                          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                            Last Result
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate mb-1.5">
                                {lastResultExam.title}
                              </div>
                              {lastSub.score != null && lastSub.total > 0 ? (
                                <>
                                  <ScoreBar score={lastSub.score} total={lastSub.total} />
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {lastSub.score} / {lastSub.total} pts
                                  </div>
                                </>
                              ) : (
                                <div className="text-xs text-muted-foreground">Pending grade</div>
                              )}
                            </div>
                            <WakeoutButton asChild size="sm" variant="secondary">
                              <Link
                                to="/student/exams/$examId/result"
                                params={{ examId: lastResultExam.id }}
                              >
                                View <ChevronRight className="w-4 h-4" />
                              </Link>
                            </WakeoutButton>
                          </div>
                        </div>
                      )}

                      {/* Latest announcement */}
                      {latestAnnouncement && (
                        <div className="border-t border-ink/10 pt-3 flex items-start gap-2">
                          <Megaphone className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              {latestAnnouncement.title}
                            </span>{" "}
                            —{" "}
                            {latestAnnouncement.body.length > 90
                              ? `${latestAnnouncement.body.slice(0, 90)}…`
                              : latestAnnouncement.body}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              }
            )}
          </div>
        )}
      </Section>

      {/* Open appeals */}
      {openAppeals.length > 0 && (
        <Section
          title="Open appeals"
          action={
            <WakeoutButton asChild size="sm" variant="ghost">
              <Link to="/student/appeals">See all →</Link>
            </WakeoutButton>
          }
        >
          <div className="space-y-2">
            {openAppeals.map((appeal: any) => (
              <Card key={appeal.id} className="flex items-center gap-4 border-amber bg-amber/5">
                <AlertTriangle className="w-5 h-5 text-amber shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{appeal.exam_title}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {appeal.type} appeal · Pending review
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full border-2 border-ink bg-amber text-[10px] font-mono uppercase tracking-widest shrink-0">
                  Pending
                </span>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* Unread notification nudge */}
      {(unreadCount as number) > 0 && openAppeals.length === 0 && (
        <Section title="">
          <Card className="flex items-center justify-between gap-4 bg-sky/10 border-sky">
            <div className="text-sm">
              You have{" "}
              <span className="font-bold">{unreadCount as number}</span> unread notification
              {(unreadCount as number) !== 1 ? "s" : ""}.
            </div>
            <WakeoutButton asChild size="sm" variant="secondary">
              <Link to="/student/notifications">View →</Link>
            </WakeoutButton>
          </Card>
        </Section>
      )}
    </>
  );
}
