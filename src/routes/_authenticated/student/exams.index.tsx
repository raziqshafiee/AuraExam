import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Card } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getStudentExams } from "@/lib/supabase/exams";
import { fmtMY } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/student/exams/")({
  head: () => ({ meta: [{ title: "Exams — Aura" }] }),
  loader: () => getStudentExams(),
  component: StudentExams,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-card",
  upcoming: "bg-amber",
  live: "bg-pink",
  closed: "bg-secondary",
  graded: "bg-lime",
};

// Live exams are the priority — they're happening now and time-sensitive.
// Lower number = higher up the list.
const STATUS_PRIORITY: Record<string, number> = {
  live: 0,
  upcoming: 1,
  closed: 2,
  graded: 3,
};
const statusRank = (s: string) => STATUS_PRIORITY[s] ?? 99;

function subStatusChip(subStatus: string | undefined, examEnded: boolean) {
  if (!examEnded) return null;
  if (!subStatus || subStatus === "in-progress")
    return { label: "Not answered", cls: "border-ink/30 bg-secondary text-muted-foreground" };
  if (subStatus === "flagged")
    return { label: "Flagged", cls: "border-ink bg-pink text-white" };
  if (subStatus === "submitted")
    return { label: "Pending grade", cls: "border-ink bg-amber" };
  if (subStatus === "graded")
    return { label: "Graded", cls: "border-ink bg-lime" };
  return null;
}

function StudentExams() {
  const exams = Route.useLoaderData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = (exams as any[])
    .filter((e) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        e.title?.toLowerCase().includes(q) ||
        e.classCode?.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || e.status === statusFilter;
      return matchSearch && matchStatus;
    })
    // Live first, then upcoming/closed/graded. Stable sort keeps the loader's
    // existing order within each status group.
    .sort((a, b) => statusRank(a.status) - statusRank(b.status));

  return (
    <>
      <PageHeader
        badge="All papers"
        badgeColor="bg-sky"
        title="Your exams"
        subtitle={`${exams.length} exam${exams.length !== 1 ? "s" : ""}`}
      />

      <div className="flex gap-3 flex-wrap items-center mb-4">
        <input
          type="search"
          placeholder="Search by title or class…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-sky"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {["all", "upcoming", "live", "closed", "graded"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full border-2 border-ink text-xs font-mono uppercase tracking-widest transition-colors ${statusFilter === s ? "bg-ink text-background" : "bg-card"}`}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {exams.length === 0 ? (
        <Card className="text-center py-12 text-ink/50">
          No exams available right now.
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12 text-ink/50">
          No exams match your search.
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const subStatus = e.submission?.status;
            const isRetakeApproved = subStatus === "retake-approved";
            const examEnded = e.status === "closed" || e.status === "graded";
            const hasResult =
              subStatus === "submitted" ||
              subStatus === "graded" ||
              subStatus === "flagged";
            // Ended exams always go to result (handles missed + force-submitted cases)
            const showResult = hasResult || (examEnded && !isRetakeApproved);
            const linkTo = showResult
              ? "/student/exams/$examId/result"
              : "/student/exams/$examId/lobby";
            const btnLabel = isRetakeApproved
              ? "Retake →"
              : showResult
                ? "Result →"
                : "Lobby →";

            const chip = subStatusChip(subStatus, examEnded);

            return (
              <Card key={e.id} className="flex items-center gap-4 flex-wrap">
                <div className="flex flex-col gap-1">
                  {chip ? (
                    <span className={`px-2.5 py-1 rounded-full border-2 text-[10px] font-mono uppercase tracking-widest ${chip.cls}`}>
                      {chip.label}
                    </span>
                  ) : (
                    <span
                      className={`px-2.5 py-1 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest ${STATUS_COLORS[e.status] ?? "bg-card"}`}
                    >
                      {e.status}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-xs font-mono text-muted-foreground">
                    {e.classCode}
                  </div>
                  <div className="font-display font-bold text-lg">{e.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {fmtMY(e.start_time, { dateStyle: "medium", timeStyle: "short" })}{" "}
                    · {e.duration} min
                  </div>
                </div>
                {e.submission && e.submission.score !== null && e.submission.total && !isRetakeApproved ? (
                  <div className="text-right mr-3">
                    <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                      Score
                    </div>
                    <div className="font-display font-extrabold text-2xl">
                      {Math.round((e.submission.score / e.submission.total) * 100)}%
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                      {e.submission.score} / {e.submission.total} pts
                    </div>
                  </div>
                ) : null}
                {!showResult || isRetakeApproved ? (
                  <span className="hidden md:inline-flex">
                    <WakeoutButton
                      asChild
                      size="sm"
                      variant={e.status === "upcoming" || e.status === "live" ? "primary" : "secondary"}
                    >
                      <Link to={linkTo} params={{ examId: e.id }}>{btnLabel}</Link>
                    </WakeoutButton>
                  </span>
                ) : (
                  <WakeoutButton asChild size="sm" variant="secondary">
                    <Link to={linkTo} params={{ examId: e.id }}>{btnLabel}</Link>
                  </WakeoutButton>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
