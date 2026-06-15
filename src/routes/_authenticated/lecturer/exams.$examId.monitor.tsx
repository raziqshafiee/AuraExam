import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { getLecturerExamMonitor } from "@/lib/supabase/exams";
import { INTEGRITY } from "@/lib/constants";
import {
  AlertTriangle, CheckCircle, ShieldAlert, Loader2,
  Wifi, WifiOff, TabletSmartphone, ClipboardCopy, Minimize2,
  Users, UserX, CameraOff, EyeOff, ArrowLeftRight, Timer,
} from "lucide-react";
import { fmtMY } from "@/lib/datetime";

export const Route = createFileRoute(
  "/_authenticated/lecturer/exams/$examId/monitor"
)({
  head: () => ({ meta: [{ title: "Monitor exam — Aura" }] }),
  loader: ({ params }) => getLecturerExamMonitor({ data: params.examId }),
  component: Monitor,
});

const HARD_FLAG_TYPES = new Set([
  "tab-switch", "copy", "paste", "right-click",
  "screenshot", "fullscreen-exit", "multiple-faces",
]);

const FLAG_ICON: Record<string, React.ElementType> = {
  "tab-switch":      TabletSmartphone,
  "copy":            ClipboardCopy,
  "paste":           ClipboardCopy,
  "right-click":     ArrowLeftRight,
  "screenshot":      CameraOff,
  "fullscreen-exit": Minimize2,
  "multiple-faces":  Users,
  "face-missing":    UserX,
  "camera-lost":     CameraOff,
  "gaze-away":       EyeOff,
  "head-turned":     ArrowLeftRight,
};

const STATUS_PRIORITY: Record<string, number> = {
  flagged: 0, "in-progress": 1, submitted: 2, graded: 3,
};

function useNow(intervalMs = 10_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "ended";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function LastSeen({ iso, active }: { iso: string | null; active: boolean }) {
  if (!active) return null;
  if (!iso) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
        <WifiOff className="w-3.5 h-3.5 shrink-0" /> no heartbeat
      </div>
    );
  }
  const ageMs = Date.now() - new Date(iso).getTime();
  const stale = ageMs > 60_000;
  const secs = Math.floor(ageMs / 1000);
  const label = secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
  return (
    <div className={`flex items-center gap-1.5 text-xs font-mono ${stale ? "text-pink font-bold" : "text-green-700"}`}>
      {stale ? <WifiOff className="w-3.5 h-3.5 shrink-0" /> : <Wifi className="w-3.5 h-3.5 shrink-0" />}
      {stale ? `disconnected · ${label}` : `online · ${label}`}
    </div>
  );
}

type FlagReason = { type: string; label: string; time: string };

function FlagLog({ flagReasons }: { flagReasons: FlagReason[] }) {
  const hard = flagReasons.filter((f) => HARD_FLAG_TYPES.has(f.type));
  if (hard.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {hard.map((f, i) => {
        const Icon = FLAG_ICON[f.type] ?? AlertTriangle;
        return (
          <div key={i} className="flex items-center gap-2 text-xs font-mono px-2.5 py-1.5 rounded-lg bg-pink/15 text-pink border border-pink/20">
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 font-semibold">{f.label}</span>
            <span className="text-pink/70 shrink-0">{f.time}</span>
          </div>
        );
      })}
    </div>
  );
}


function Monitor() {
  const { exam, submissions, notStarted } = Route.useLoaderData() as any;
  const router = useRouter();
  const now = useNow();

  useEffect(() => {
    const interval = setInterval(() => router.invalidate(), 30_000);
    return () => clearInterval(interval);
  }, [router]);

  const inProgress    = submissions.filter((s: any) => s.status === "in-progress");
  const submitted     = submissions.filter((s: any) => s.status === "submitted" || s.status === "graded");
  const flaggedSubs   = submissions.filter((s: any) => s.status === "flagged");
  const totalFlags    = submissions.reduce((sum: number, s: any) => sum + (s.flags ?? 0), 0);
  const totalEnrolled = submissions.length + (notStarted?.length ?? 0);
  const completedCount = submitted.length + flaggedSubs.length;
  const completionPct = totalEnrolled > 0 ? Math.round((completedCount / totalEnrolled) * 100) : 0;

  const timeRemainingMs = exam.endTime ? new Date(exam.endTime).getTime() - now.getTime() : null;
  const examEnded = timeRemainingMs !== null && timeRemainingMs <= 0;

  const sortedSubmissions = [...submissions].sort((a: any, b: any) => {
    const pa = STATUS_PRIORITY[a.status] ?? 9;
    const pb = STATUS_PRIORITY[b.status] ?? 9;
    return pa !== pb ? pa - pb : a.studentName.localeCompare(b.studentName);
  });

  return (
    <>
      <PageHeader
        badge="● LIVE"
        badgeColor="bg-pink"
        title={`Monitoring · ${exam.title}`}
        subtitle={`${exam.classCode} · ${totalEnrolled} enrolled`}
      />

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
        {[
          { label: "Not started", value: notStarted?.length ?? 0, color: "bg-secondary" },
          { label: "In progress", value: inProgress.length,        color: "bg-amber" },
          { label: "Submitted",   value: submitted.length,         color: "bg-lime" },
          { label: "Flagged",     value: flaggedSubs.length,       color: "bg-pink" },
          { label: "Total flags", value: totalFlags,               color: "bg-violet" },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-2xl border-2 border-ink p-3 text-center shadow-brut-sm ${color}`}>
            <div className="text-2xl font-display font-black">{value}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest mt-0.5 opacity-70 leading-tight">{label}</div>
          </div>
        ))}
        <div className={`rounded-2xl border-2 border-ink p-3 text-center shadow-brut-sm ${examEnded ? "bg-secondary" : "bg-sky/20"}`}>
          <div className="flex items-center justify-center gap-1 text-xl font-display font-black">
            <Timer className="w-4 h-4 shrink-0" />
            {timeRemainingMs === null ? "—" : formatCountdown(timeRemainingMs)}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-widest mt-0.5 opacity-70 leading-tight">
            {examEnded ? "Ended" : "Time left"}
          </div>
        </div>
      </div>

      {/* Completion progress bar */}
      <div className="mb-6 rounded-2xl border-2 border-ink bg-card px-5 py-3 shadow-brut-sm">
        <div className="flex justify-between items-center mb-2 text-xs font-mono">
          <span className="text-muted-foreground">Completion</span>
          <span className="font-bold">{completedCount} / {totalEnrolled} &nbsp;({completionPct}%)</span>
        </div>
        <div className="h-3 rounded-full bg-secondary border border-ink/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-lime transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-4 mt-2 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-lime inline-block" />Submitted: {submitted.length}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pink inline-block" />Flagged: {flaggedSubs.length}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber inline-block" />In progress: {inProgress.length}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-secondary border border-ink/30 inline-block" />Not started: {notStarted?.length ?? 0}</span>
        </div>
      </div>

      {/* Student cards — sorted: flagged → in-progress → submitted */}
      {sortedSubmissions.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {sortedSubmissions.map((s: any) => {
            const flags        = s.flags ?? 0;
            const flagReasons: FlagReason[] = s.flagReasons ?? [];
            const isFlagged    = s.status === "flagged";
            const isSubmitted  = s.status === "submitted" || s.status === "graded";
            const isInProgress = s.status === "in-progress";
            const displayScore = s.score ?? s.autoScore;
            const scorePct     = displayScore !== null && s.total > 0
              ? Math.round((displayScore / s.total) * 100)
              : null;

            return (
              <Card key={s.id} className={isFlagged ? "border-pink" : ""}>
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full border-2 border-ink flex items-center justify-center font-bold text-sm shrink-0 ${isFlagged ? "bg-pink text-white" : isSubmitted ? "bg-lime" : "bg-sky"}`}>
                    {s.studentName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{s.studentName}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {isInProgress && <Loader2 className="w-3 h-3 text-amber animate-spin shrink-0" />}
                      {isSubmitted  && <CheckCircle className="w-3 h-3 text-green-600 shrink-0" />}
                      {isFlagged    && <ShieldAlert className="w-3 h-3 text-pink shrink-0" />}
                      <span className={`text-xs font-mono font-bold uppercase ${isFlagged ? "text-pink" : isSubmitted ? "text-green-700" : "text-amber-700"}`}>
                        {isFlagged ? "Flagged" : isSubmitted ? "Submitted" : "In progress"}
                      </span>
                      {s.submittedAt && (
                        <span className="text-xs font-mono text-muted-foreground">
                          · {fmtMY(s.submittedAt, { timeStyle: "short" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status panel */}
                <div className={`rounded-2xl border-2 border-ink p-3 flex flex-col gap-2.5 ${isFlagged ? "bg-pink/10" : isSubmitted ? "bg-lime/10" : "bg-secondary"}`}>
                  {/* Flags bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Hard flags
                      </span>
                      <span className={`text-xs font-mono font-bold ${flags >= INTEGRITY.FLAG_THRESHOLD ? "text-pink" : flags > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                        {flags} / {INTEGRITY.FLAG_THRESHOLD}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: INTEGRITY.FLAG_THRESHOLD }, (_, i) => (
                        <div
                          key={i}
                          className={`h-2 flex-1 rounded-full border border-ink/20 ${
                            i < flags
                              ? flags >= INTEGRITY.FLAG_THRESHOLD ? "bg-pink" : "bg-amber"
                              : "bg-ink/10"
                          }`}
                        />
                      ))}
                    </div>
                    <FlagLog flagReasons={flagReasons} />
                  </div>

                  {/* Score */}
                  {(isSubmitted || isFlagged) && displayScore !== null && (
                    <div className="border-t-2 border-ink/10 pt-2.5 flex items-baseline gap-2">
                      <span className="text-lg font-display font-black">
                        {displayScore} / {s.total}
                      </span>
                      {scorePct !== null && (
                        <span className="text-sm font-mono text-muted-foreground">{scorePct}%</span>
                      )}
                      {s.status === "submitted" && s.score === null && (
                        <span className="text-[10px] font-mono text-amber-700 ml-1">pending essay</span>
                      )}
                    </div>
                  )}

                  {/* Heartbeat */}
                  {isInProgress && (
                    <div className="border-t-2 border-ink/10 pt-2.5">
                      <LastSeen iso={s.lastSeenAt} active={isInProgress} />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Not started */}
      {notStarted?.length > 0 && (
        <div className="rounded-3xl border-2 border-ink bg-card p-6 shadow-brut">
          <h2 className="font-display font-bold text-base mb-4 text-muted-foreground">
            Not started ({notStarted.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {notStarted.map((name: string, i: number) => (
              <span key={i} className="px-3 py-1.5 rounded-full border-2 border-ink/20 bg-secondary text-sm font-mono">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {submissions.length === 0 && (notStarted?.length ?? 0) === 0 && (
        <Card className="text-center py-12 text-ink/50">
          No students enrolled in this class.
        </Card>
      )}
    </>
  );
}
