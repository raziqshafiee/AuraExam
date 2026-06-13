import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, PageHeader, Stat } from "@/components/brand/page";
import { getLecturerExamMonitor } from "@/lib/supabase/exams";
import { getProctorSnapshots } from "@/lib/supabase/proctor";
import { INTEGRITY } from "@/lib/constants";
import {
  AlertTriangle, CheckCircle, Clock, ShieldAlert, Loader2, Eye,
  Wifi, WifiOff, TabletSmartphone, ClipboardCopy, Minimize2,
  Users, UserX, CameraOff, EyeOff, ArrowLeftRight, ChevronDown, ChevronUp,
  Camera,
} from "lucide-react";
import { fmtMY } from "@/lib/datetime";

export const Route = createFileRoute(
  "/_authenticated/lecturer/exams/$examId/monitor"
)({
  head: () => ({ meta: [{ title: "Monitor exam — Aura" }] }),
  loader: ({ params }) => getLecturerExamMonitor({ data: params.examId }),
  component: Monitor,
});

// Types that go through recordFlag (increment counter, hard flags).
// Must match the exact strings written by the take page sendFlag() calls.
const HARD_FLAG_TYPES = new Set([
  "tab-switch",
  "copy",
  "paste",
  "right-click",
  "screenshot",
  "fullscreen-exit",
  "multiple-faces",
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

// "Last seen" freshness. Heartbeat pings every 20s, so >60s stale ⇒ likely gone.
function LastSeen({ iso, active }: { iso: string | null; active: boolean }) {
  if (!active) return null;
  if (!iso) {
    return (
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
        <WifiOff className="w-3.5 h-3.5 shrink-0" /> no heartbeat yet
      </div>
    );
  }
  const ageMs = Date.now() - new Date(iso).getTime();
  const stale = ageMs > 60_000;
  const mins = Math.floor(ageMs / 60_000);
  const secs = Math.floor(ageMs / 1000);
  const label = secs < 60 ? `${secs}s ago` : `${mins}m ago`;
  return (
    <div className={`flex items-center gap-2 text-xs font-mono ${stale ? "text-pink font-bold" : "text-green-700"}`}>
      {stale ? <WifiOff className="w-3.5 h-3.5 shrink-0" /> : <Wifi className="w-3.5 h-3.5 shrink-0" />}
      {stale ? `possibly disconnected · last seen ${label}` : `online · seen ${label}`}
    </div>
  );
}

type FlagReason = { type: string; label: string; time: string };

function FlagLog({ flagReasons }: { flagReasons: FlagReason[] }) {
  const [showAdvisory, setShowAdvisory] = useState(false);

  if (flagReasons.length === 0) return null;

  const hard     = flagReasons.filter((f) => HARD_FLAG_TYPES.has(f.type));
  const advisory = flagReasons.filter((f) => !HARD_FLAG_TYPES.has(f.type));

  return (
    <div className="mt-2 space-y-1">
      {/* Hard flags — always shown */}
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

      {/* Advisory flags — collapsible */}
      {advisory.length > 0 && (
        <>
          <button
            onClick={() => setShowAdvisory((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-mono text-amber-700 hover:text-amber-900 px-1 py-0.5"
          >
            {showAdvisory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {advisory.length} advisory event{advisory.length !== 1 ? "s" : ""}
          </button>
          {showAdvisory && advisory.map((f, i) => {
            const Icon = FLAG_ICON[f.type] ?? Camera;
            return (
              <div key={i} className="flex items-center gap-2 text-xs font-mono px-2.5 py-1.5 rounded-lg bg-amber/15 text-amber-700 border border-amber/20">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">{f.label}</span>
                <span className="text-amber-500 shrink-0">{f.time}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

type Snapshot = { url: string; takenAt: string | null };

function SnapshotViewer({ submissionId }: { submissionId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shots, setShots] = useState<Snapshot[] | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && shots === null) {
      setLoading(true);
      try {
        const res = await getProctorSnapshots({ data: submissionId });
        setShots(res.snapshots);
      } catch {
        setShots([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs font-mono font-semibold px-2.5 py-1 rounded-full border-2 border-ink bg-card hover:bg-secondary"
      >
        <Eye className="w-3.5 h-3.5" /> {open ? "Hide snapshots" : "View snapshots"}
      </button>
      {open && (
        <div className="mt-2">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> loading…
            </div>
          ) : shots && shots.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5">
              {shots.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={s.url}
                    alt={s.takenAt ? fmtMY(s.takenAt, { timeStyle: "short" }) : "snapshot"}
                    className="w-full aspect-video object-cover rounded-lg border-2 border-ink"
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="text-xs font-mono text-muted-foreground">No snapshots captured.</div>
          )}
        </div>
      )}
    </div>
  );
}

function Monitor() {
  const { exam, submissions, notStarted } = Route.useLoaderData() as any;
  const router = useRouter();

  // Auto-refresh every 30 seconds while the lecturer is watching the exam.
  // Uses router.invalidate() so the loader re-runs and useLoaderData() updates
  // without a full page reload. The lecturer stays on the page.
  useEffect(() => {
    const interval = setInterval(() => router.invalidate(), 30_000);
    return () => clearInterval(interval);
  }, [router]);

  const inProgress  = submissions.filter((s: any) => s.status === "in-progress");
  const submitted   = submissions.filter((s: any) => s.status === "submitted" || s.status === "graded");
  const flaggedSubs = submissions.filter((s: any) => s.status === "flagged");
  const totalFlags  = submissions.reduce((sum: number, s: any) => sum + (s.flags ?? 0), 0);
  const totalEnrolled = submissions.length + (notStarted?.length ?? 0);

  return (
    <>
      <PageHeader
        badge="● LIVE"
        badgeColor="bg-pink"
        title={`Monitoring · ${exam.title}`}
        subtitle={`${exam.classCode} · ${totalEnrolled} enrolled`}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <Stat label="Not started" value={notStarted?.length ?? 0} color="bg-secondary" />
        <Stat label="In progress" value={inProgress.length}       color="bg-amber" />
        <Stat label="Submitted"   value={submitted.length}        color="bg-lime" />
        <Stat label="Flagged"     value={flaggedSubs.length}      color="bg-pink" />
        <Stat label="Total flags" value={totalFlags}              color="bg-violet text-violet-foreground" />
      </div>

      {submissions.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {submissions.map((s: any) => {
            const flags        = s.flags ?? 0;
            const flagReasons: FlagReason[] = s.flagReasons ?? [];
            const isFlagged    = s.status === "flagged";
            const isSubmitted  = s.status === "submitted" || s.status === "graded";
            const isInProgress = s.status === "in-progress";

            return (
              <Card key={s.id} className={isFlagged ? "border-pink" : ""}>
                {/* Header row */}
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full border-2 border-ink flex items-center justify-center font-bold text-sm ${isFlagged ? "bg-pink text-white" : isSubmitted ? "bg-lime" : "bg-sky"}`}>
                    {s.studentName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{s.studentName}</div>
                    <div className="text-xs font-mono text-muted-foreground">
                      {s.submittedAt ? fmtMY(s.submittedAt, { timeStyle: "short" }) : "—"}
                    </div>
                  </div>
                </div>

                {/* Status panel */}
                <div className={`mt-3 rounded-2xl border-2 border-ink p-4 flex flex-col gap-3 ${isFlagged ? "bg-pink/10" : isSubmitted ? "bg-lime/10" : "bg-secondary"}`}>
                  {/* Status label */}
                  <div className="flex items-center gap-2">
                    {isInProgress && <Loader2 className="w-4 h-4 text-amber animate-spin" />}
                    {isSubmitted  && <CheckCircle className="w-4 h-4 text-green-600" />}
                    {isFlagged    && <ShieldAlert className="w-4 h-4 text-pink" />}
                    <span className={`text-sm font-bold uppercase tracking-wide ${isFlagged ? "text-pink" : isSubmitted ? "text-green-700" : "text-amber-700"}`}>
                      {isFlagged ? "Auto-submitted · flagged" : isSubmitted ? "Submitted" : "In progress"}
                    </span>
                  </div>

                  {/* Submitted time */}
                  {s.submittedAt && (
                    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      {fmtMY(s.submittedAt, { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  )}

                  {/* Integrity flags bar + per-event log */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Hard flags
                      </span>
                      <span className={`text-xs font-mono font-bold ${flags >= INTEGRITY.FLAG_THRESHOLD ? "text-pink" : flags > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                        {flags} / {INTEGRITY.FLAG_THRESHOLD}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: INTEGRITY.FLAG_THRESHOLD }, (_, i) => i).map((i) => (
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
                    {/* Per-flag action log */}
                    <FlagLog flagReasons={flagReasons} />
                  </div>

                  {/* Heartbeat + snapshots */}
                  <div className="flex flex-col gap-2 border-t-2 border-ink/10 pt-3">
                    <LastSeen iso={s.lastSeenAt} active={isInProgress} />
                    <SnapshotViewer submissionId={s.id} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

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
