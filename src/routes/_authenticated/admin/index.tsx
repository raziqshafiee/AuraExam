import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Stat } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getAdminDashboardData } from "@/lib/supabase/funcs";
import { fmtMY } from "@/lib/datetime";
import { AlertTriangle, Radio, Users, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin — Aura" }] }),
  loader: () => getAdminDashboardData(),
  component: AdminDashboard,
});

function AdminDashboard() {
  const {
    profile,
    usersCount, classesCount, examsCount,
    liveExamsCount, pendingAppealsCount, flaggedCount, bannedUsersCount,
    liveExams, recentFlagged,
  } = Route.useLoaderData() as any;

  const firstName = profile?.name?.split(" ")[0] ?? "there";
  const hasAlerts = liveExamsCount > 0 || pendingAppealsCount > 0 || flaggedCount > 0;

  return (
    <>
      <PageHeader
        badge="Platform"
        badgeColor="bg-lime"
        title={`Hey ${firstName}`}
        subtitle={hasAlerts ? "Some items need your attention." : "Platform is running smoothly."}
      />

      {/* Platform totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="Total users"  value={usersCount}       color="bg-lime" />
        <Stat label="Classes"      value={classesCount}     color="bg-violet text-violet-foreground" />
        <Stat label="Exams"        value={examsCount}       color="bg-secondary" />
        <Stat label="Banned users" value={bannedUsersCount} color={bannedUsersCount > 0 ? "bg-pink" : "bg-secondary"} />
      </div>

      {/* Action items — things that need attention */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Link to="/admin/exams" className="rounded-2xl border-2 border-ink bg-card p-4 shadow-brut-sm hover:shadow-brut transition-all flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl border-2 border-ink flex items-center justify-center shrink-0 ${liveExamsCount > 0 ? "bg-pink" : "bg-secondary"}`}>
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display font-bold text-2xl">{liveExamsCount}</div>
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Live right now</div>
          </div>
        </Link>

        <Link to="/admin/integrity" className="rounded-2xl border-2 border-ink bg-card p-4 shadow-brut-sm hover:shadow-brut transition-all flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl border-2 border-ink flex items-center justify-center shrink-0 ${flaggedCount > 0 ? "bg-pink" : "bg-secondary"}`}>
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display font-bold text-2xl">{flaggedCount}</div>
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Flagged submissions</div>
          </div>
        </Link>

        <Link to="/admin/audit-log" className="rounded-2xl border-2 border-ink bg-card p-4 shadow-brut-sm hover:shadow-brut transition-all flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl border-2 border-ink flex items-center justify-center shrink-0 ${pendingAppealsCount > 0 ? "bg-amber" : "bg-secondary"}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display font-bold text-2xl">{pendingAppealsCount}</div>
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Pending appeals</div>
          </div>
        </Link>
      </div>

      {/* Currently live exams */}
      {liveExams.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-pink animate-pulse" />
            <h2 className="font-display font-bold text-lg">Live right now</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {liveExams.map((e: any) => (
              <div key={e.id} className="rounded-2xl border-2 border-ink bg-card p-4 shadow-brut-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm">{e.title}</div>
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">{e.classCode} · {e.lecturerName}</div>
                  </div>
                  <span className="shrink-0 flex items-center gap-1 text-xs font-mono font-bold px-2 py-1 rounded-full border-2 border-ink bg-pink/15 text-pink">
                    <Users className="w-3 h-3" /> {e.inProgressCount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent flagged submissions */}
      {recentFlagged.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-lg">Recent integrity flags</h2>
            <Link to="/admin/integrity" className="text-xs font-mono text-muted-foreground hover:text-ink underline">
              View all →
            </Link>
          </div>
          <div className="rounded-3xl border-2 border-ink bg-card shadow-brut overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-mono uppercase tracking-widest text-muted-foreground border-b-2 border-ink bg-secondary">
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Exam</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Flags</th>
                  <th className="px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-ink/10">
                {recentFlagged.map((s: any) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-semibold">{s.studentName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.examTitle}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.classCode}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-xs font-mono font-bold text-pink">
                        <AlertTriangle className="w-3 h-3" /> {s.flags}/3
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {s.submittedAt ? fmtMY(s.submittedAt, { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="font-display font-bold text-lg mb-3">Quick actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <WakeoutButton asChild className="h-14">
            <Link to="/admin/users"><Users className="w-4 h-4 mr-2" />Users</Link>
          </WakeoutButton>
          <WakeoutButton asChild variant="violet" className="h-14">
            <Link to="/admin/audit-log">Audit log</Link>
          </WakeoutButton>
          <WakeoutButton asChild variant="pink" className="h-14">
            <Link to="/admin/integrity"><ShieldAlert className="w-4 h-4 mr-2" />Integrity</Link>
          </WakeoutButton>
          <WakeoutButton asChild variant="secondary" className="h-14">
            <Link to="/admin/exams">All exams</Link>
          </WakeoutButton>
        </div>
      </div>
    </>
  );
}
