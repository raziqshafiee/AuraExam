import { createFileRoute } from "@tanstack/react-router";
import { useState, Fragment, useEffect } from "react";
import { PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getAdminIntegrityLog } from "@/lib/supabase/admin";
import { fmtMY } from "@/lib/datetime";
import { INTEGRITY } from "@/lib/constants";
import {
  AlertTriangle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  TabletSmartphone, ClipboardCopy, Minimize2, Users,
  UserX, CameraOff, EyeOff, ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/integrity")({
  head: () => ({ meta: [{ title: "Integrity log — Aura Admin" }] }),
  loader: () => getAdminIntegrityLog({ data: { page: 1 } }),
  component: IntegrityPage,
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

const FLAG_ICON: Record<string, LucideIcon> = {
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

type FlagReason = { type: string; label: string; time: string };

function FlagPill({ flags }: { flags: number }) {
  const color = flags >= INTEGRITY.FLAG_THRESHOLD
    ? "bg-pink text-white border-pink"
    : "bg-amber/20 text-amber-800 border-amber/40";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded-full border-2 ${color}`}>
      <AlertTriangle className="w-3 h-3" /> {flags}/3
    </span>
  );
}

function FlagDetails({ flagReasons }: { flagReasons: FlagReason[] }) {
  if (flagReasons.length === 0) {
    return <p className="text-xs font-mono text-muted-foreground italic">No events recorded.</p>;
  }
  return (
    <div className="space-y-1">
      {flagReasons.map((f, i) => {
        const isHard = HARD_FLAG_TYPES.has(f.type);
        const Icon = FLAG_ICON[f.type] ?? AlertTriangle;
        return (
          <div
            key={i}
            className={`flex items-center gap-2 text-xs font-mono px-2.5 py-1.5 rounded-lg border ${
              isHard
                ? "bg-pink/15 text-pink border-pink/20"
                : "bg-amber/15 text-amber-700 border-amber/20"
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className={`flex-1 ${isHard ? "font-semibold" : ""}`}>{f.label}</span>
            <span className={`shrink-0 ${isHard ? "text-pink/70" : "text-amber-500"}`}>{f.time}</span>
          </div>
        );
      })}
    </div>
  );
}

function IntegrityPage() {
  const initial = Route.useLoaderData();
  const [records, setRecords] = useState<any[]>(initial.records);
  const [totalCount, setTotalCount] = useState(initial.totalCount);
  const [totalPages, setTotalPages] = useState(initial.totalPages);
  const [page, setPage] = useState(initial.page);
  const [statusFilter, setStatusFilter] = useState("all");
  // Re-sync when loader re-runs (window focus returns fresh page-1 data).
  useEffect(() => {
    setRecords(initial.records);
    setTotalCount(initial.totalCount);
    setTotalPages(initial.totalPages);
    setPage(initial.page);
  }, [initial]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = records.filter((r) => {
    const q = search.toLowerCase();
    return (
      !q ||
      r.studentName.toLowerCase().includes(q) ||
      r.examTitle.toLowerCase().includes(q) ||
      r.classCode.toLowerCase().includes(q) ||
      r.lecturerName.toLowerCase().includes(q)
    );
  });

  async function loadPage(p: number, filter: string) {
    setLoading(true);
    try {
      const result = await getAdminIntegrityLog({ data: { page: p, statusFilter: filter } });
      setRecords(result.records);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        badge="Observe only"
        badgeColor="bg-secondary"
        title="Integrity log"
        subtitle={`${totalCount} submission${totalCount !== 1 ? "s" : ""} with integrity events`}
      />

      <div className="flex gap-3 flex-wrap items-center mb-4">
        <input
          type="search"
          placeholder="Search by student, exam, class or lecturer…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setExpandedId(null); }}
          className="flex-1 min-w-[220px] border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime"
        />
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { key: "all",     label: "All" },
          { key: "flagged", label: "Auto-submitted" },
          { key: "active",  label: "Flagged but active" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => { setStatusFilter(f.key); loadPage(1, f.key); }}
            className={`px-3 py-1.5 rounded-full border-2 border-ink text-xs font-mono uppercase tracking-widest transition-colors ${
              statusFilter === f.key ? "bg-ink text-background" : "bg-card"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm font-mono">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border-2 border-ink bg-card p-12 text-center text-muted-foreground shadow-brut">
          No integrity events match your search.
        </div>
      ) : (
        <div className="rounded-3xl border-2 border-ink bg-card shadow-brut overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "900px" }}>
              <colgroup>
                <col style={{ width: "18%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "4%" }} />
              </colgroup>
              <thead>
                <tr className="text-left text-xs font-mono uppercase tracking-widest text-muted-foreground border-b-2 border-ink bg-secondary">
                  <th className="px-5 py-4">Student</th>
                  <th className="px-5 py-4">Exam</th>
                  <th className="px-5 py-4">Class</th>
                  <th className="px-5 py-4">Lecturer</th>
                  <th className="px-5 py-4">Flags</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Time</th>
                  <th className="px-5 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-ink/10">
                {visible.map((r: any) => {
                  const isOpen = expandedId === r.id;
                  const isAutoSubmitted = r.status === "flagged";
                  return (
                    <Fragment key={r.id}>
                      <tr className={isAutoSubmitted ? "bg-pink/5" : ""}>
                        <td className="px-5 py-4 font-semibold">{r.studentName}</td>
                        <td className="px-5 py-4 text-muted-foreground">
                          <span className="block truncate">{r.examTitle}</span>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs whitespace-nowrap">{r.classCode}</td>
                        <td className="px-5 py-4 text-muted-foreground text-xs">{r.lecturerName}</td>
                        <td className="px-5 py-4 whitespace-nowrap"><FlagPill flags={r.flags} /></td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className={`inline-block text-xs font-mono font-semibold px-3 py-1 rounded-full border-2 border-ink whitespace-nowrap ${
                            isAutoSubmitted ? "bg-pink text-white border-pink" : "bg-amber/20 text-amber-800 border-amber/40"
                          }`}>
                            {isAutoSubmitted ? "Auto-submitted" : r.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {r.submittedAt
                            ? fmtMY(r.submittedAt, { dateStyle: "short", timeStyle: "short" })
                            : "—"}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => setExpandedId(isOpen ? null : r.id)}
                            className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-ink ml-auto"
                          >
                            {isOpen
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />}
                            {r.flagReasons.length}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${r.id}-detail`}>
                          <td colSpan={8} className="px-5 pb-5 pt-3 bg-secondary/50">
                            <FlagDetails flagReasons={r.flagReasons} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <WakeoutButton
            variant="secondary" size="sm"
            disabled={page <= 1 || loading}
            onClick={() => loadPage(page - 1, statusFilter)}
          >
            <ChevronLeft className="w-4 h-4" />
          </WakeoutButton>
          <span className="text-xs font-mono text-muted-foreground">
            Page {page} of {totalPages} · {totalCount} total
          </span>
          <WakeoutButton
            variant="secondary" size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => loadPage(page + 1, statusFilter)}
          >
            <ChevronRight className="w-4 h-4" />
          </WakeoutButton>
        </div>
      )}
    </>
  );
}
