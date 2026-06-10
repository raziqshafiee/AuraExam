import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { getAllExamsAdmin } from "@/lib/supabase/exams";
import { fmtMY } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/admin/exams")({
  head: () => ({ meta: [{ title: "Exams — Aura" }] }),
  loader: () => getAllExamsAdmin(),
  component: AdminExams,
});

const STATUS_COLORS: Record<string, string> = {
  draft:    "bg-card",
  upcoming: "bg-amber",
  live:     "bg-pink",
  closed:   "bg-secondary",
  graded:   "bg-lime",
};

const STATUS_OPTIONS = ["all", "draft", "upcoming", "live", "closed", "graded"];

function AdminExams() {
  const exams = Route.useLoaderData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return exams.filter((e: any) => {
      const matchSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        (e.classCode ?? "").toLowerCase().includes(q) ||
        (e.lecturerName ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || e.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [exams, search, statusFilter]);

  return (
    <>
      <PageHeader
        badge="Oversight"
        badgeColor="bg-lime"
        title="All exams"
        subtitle={`${filtered.length} of ${exams.length} exam${exams.length !== 1 ? "s" : ""}`}
      />

      <div className="flex gap-3 flex-wrap items-center mb-6">
        <input
          type="search"
          placeholder="Search by title, class or lecturer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground font-mono text-sm">
            No exams match your search.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-mono uppercase tracking-widest text-muted-foreground border-b-2 border-ink">
                <th className="py-3">Class</th>
                <th>Title</th>
                <th>Lecturer</th>
                <th>Status</th>
                <th>Questions</th>
                <th>Start</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-ink/10">
              {filtered.map((e: any) => (
                <tr key={e.id}>
                  <td className="py-3 font-mono whitespace-nowrap">{e.classCode}</td>
                  <td className="font-semibold">{e.title}</td>
                  <td className="text-muted-foreground">{e.lecturerName}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest whitespace-nowrap ${STATUS_COLORS[e.status] ?? "bg-card"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="font-mono">{e.questions_count}</td>
                  <td className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                    {e.start_time ? fmtMY(e.start_time, { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                  <td className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                    {fmtMY(e.created_at, { dateStyle: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
