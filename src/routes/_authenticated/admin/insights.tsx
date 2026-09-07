import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Line,
  LineChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, Card, Stat, Section } from "@/components/brand/page";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { getAdminInsightsData, type InsightsRange } from "@/lib/supabase/insights";
import { fmtMY } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/admin/insights")({
  head: () => ({ meta: [{ title: "Insights — Aura" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    days: ([7, 30, 90].includes(Number(search.days)) ? Number(search.days) : 30) as InsightsRange,
  }),
  loaderDeps: ({ search }) => ({ days: search.days }),
  loader: ({ deps }) => getAdminInsightsData({ data: { days: deps.days } }),
  component: InsightsPage,
});

function shortDate(d: string) {
  return fmtMY(d, { month: "short", day: "numeric" });
}

const trendConfig: ChartConfig = {
  submitted: { label: "Submitted", color: "var(--color-lime)" },
  flagged: { label: "Flagged", color: "var(--color-pink)" },
};

const scoreTrendConfig: ChartConfig = {
  avgPct: { label: "Avg score %", color: "var(--color-sky)" },
};

const distConfig: ChartConfig = {
  count: { label: "Students", color: "var(--color-violet)" },
};

const turnaroundConfig: ChartConfig = {
  avgHours: { label: "Avg turnaround (hrs)", color: "var(--color-amber)" },
};

function InsightsPage() {
  const data = Route.useLoaderData();
  const { days } = Route.useSearch();
  const [studentSearch, setStudentSearch] = useState("");
  const [lecturerSearch, setLecturerSearch] = useState("");

  const totalSubmissions = data.system.dailyTrend.reduce((a, d) => a + d.submitted + d.flagged, 0);

  const filteredStudents = data.students.table.filter((s) =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase())
  );
  const filteredLecturers = data.lecturers.table.filter((l) =>
    l.name.toLowerCase().includes(lecturerSearch.toLowerCase())
  );

  return (
    <>
      <PageHeader
        badge="Analytics"
        badgeColor="bg-lime"
        title="Insights"
        subtitle="System health, student performance, and lecturer workload."
        action={
          <div className="flex gap-2 rounded-full border-2 border-ink bg-card p-1 shadow-brut-sm">
            {([7, 30, 90] as InsightsRange[]).map((d) => (
              <Link
                key={d}
                to="/admin/insights"
                search={{ days: d }}
                className={`px-3 py-1.5 rounded-full text-sm font-mono transition-colors ${
                  days === d ? "bg-ink text-background" : "hover:bg-secondary"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        }
      />

      {/* ── System ──────────────────────────────────────────── */}
      <Section title="System">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Stat label="Submissions" value={totalSubmissions} color="bg-lime" />
          <Stat
            label="Avg grading turnaround"
            value={data.system.turnaroundAvgHours !== null ? `${data.system.turnaroundAvgHours}h` : "—"}
            color="bg-secondary"
          />
          <Stat label="Integrity flag rate" value={`${data.system.flagRatePct}%`} color={data.system.flagRatePct > 0 ? "bg-pink" : "bg-secondary"} />
          <Stat label="Appeals filed" value={data.system.appealVolume} color="bg-amber" />
        </div>

        <Card className="mb-4">
          <div className="font-display font-bold text-sm mb-3 uppercase tracking-widest text-muted-foreground">
            Submissions per day
          </div>
          <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
            <LineChart data={data.system.dailyTrend} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.15} />
              <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(v as string)} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line dataKey="submitted" stroke="var(--color-submitted)" strokeWidth={2} dot={false} />
              <Line dataKey="flagged" stroke="var(--color-flagged)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border-2 border-ink bg-amber/15 p-4">
            <div className="font-display font-bold text-2xl">{data.system.appealOutcomes.pending}</div>
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Pending appeals</div>
          </div>
          <div className="rounded-2xl border-2 border-ink bg-lime/15 p-4">
            <div className="font-display font-bold text-2xl">{data.system.appealOutcomes.approved}</div>
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Approved</div>
          </div>
          <div className="rounded-2xl border-2 border-ink bg-pink/15 p-4">
            <div className="font-display font-bold text-2xl">{data.system.appealOutcomes.rejected}</div>
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Rejected</div>
          </div>
        </div>
      </Section>

      {/* ── Students ────────────────────────────────────────── */}
      <Section title="Students">
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <Card>
            <div className="font-display font-bold text-sm mb-3 uppercase tracking-widest text-muted-foreground">
              Score distribution
            </div>
            <ChartContainer config={distConfig} className="aspect-auto h-56 w-full">
              <BarChart data={data.students.scoreDistribution} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </Card>

          <Card>
            <div className="font-display font-bold text-sm mb-3 uppercase tracking-widest text-muted-foreground">
              Average score trend
            </div>
            <ChartContainer config={scoreTrendConfig} className="aspect-auto h-56 w-full">
              <LineChart data={data.students.avgScoreTrend} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={32} unit="%" domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(v as string)} />} />
                <Line dataKey="avgPct" stroke="var(--color-avgPct)" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ChartContainer>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="font-display font-bold text-sm uppercase tracking-widest text-muted-foreground">
              Per-student breakdown ({filteredStudents.length})
            </div>
            <input
              type="search"
              placeholder="Search students…"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="border-2 border-ink rounded-full px-4 py-1.5 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-left text-xs font-mono uppercase tracking-widest text-muted-foreground border-b-2 border-ink">
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">Exams taken</th>
                  <th className="py-2 pr-4">Avg score</th>
                  <th className="py-2 pr-4">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {filteredStudents.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-muted-foreground font-mono text-sm">No submissions in this window.</td></tr>
                ) : filteredStudents.map((s) => (
                  <tr key={s.studentId}>
                    <td className="py-2 pr-4 font-semibold">{s.name}</td>
                    <td className="py-2 pr-4 font-mono">{s.examsTaken}</td>
                    <td className="py-2 pr-4 font-mono">{s.avgScorePct !== null ? `${s.avgScorePct}%` : "—"}</td>
                    <td className={`py-2 pr-4 font-mono ${s.totalFlags > 0 ? "text-pink font-bold" : ""}`}>{s.totalFlags}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      {/* ── Lecturers ───────────────────────────────────────── */}
      <Section title="Lecturers">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Stat
            label="Avg grading turnaround"
            value={
              data.lecturers.table.some((l) => l.avgTurnaroundHours !== null)
                ? `${Math.round((data.lecturers.table.reduce((a, l) => a + (l.avgTurnaroundHours ?? 0), 0) / (data.lecturers.table.filter((l) => l.avgTurnaroundHours !== null).length || 1)) * 10) / 10}h`
                : "—"
            }
            color="bg-secondary"
          />
          <Stat label="Appeal rate" value={`${data.lecturers.appealRatePct}%`} color="bg-amber" />
        </div>

        <Card className="mb-4">
          <div className="font-display font-bold text-sm mb-3 uppercase tracking-widest text-muted-foreground">
            Grading turnaround trend
          </div>
          <ChartContainer config={turnaroundConfig} className="aspect-auto h-56 w-full">
            <LineChart data={data.lecturers.turnaroundTrend} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.15} />
              <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={32} unit="h" />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(v as string)} />} />
              <Line dataKey="avgHours" stroke="var(--color-avgHours)" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ChartContainer>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="font-display font-bold text-sm uppercase tracking-widest text-muted-foreground">
              Per-lecturer breakdown ({filteredLecturers.length})
            </div>
            <input
              type="search"
              placeholder="Search lecturers…"
              value={lecturerSearch}
              onChange={(e) => setLecturerSearch(e.target.value)}
              className="border-2 border-ink rounded-full px-4 py-1.5 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs font-mono uppercase tracking-widest text-muted-foreground border-b-2 border-ink">
                  <th className="py-2 pr-4">Lecturer</th>
                  <th className="py-2 pr-4">Classes</th>
                  <th className="py-2 pr-4">Exams</th>
                  <th className="py-2 pr-4">Pending essays</th>
                  <th className="py-2 pr-4">Avg turnaround</th>
                  <th className="py-2 pr-4">Appeal rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {filteredLecturers.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground font-mono text-sm">No lecturers found.</td></tr>
                ) : filteredLecturers.map((l) => (
                  <tr key={l.lecturerId}>
                    <td className="py-2 pr-4 font-semibold">{l.name}</td>
                    <td className="py-2 pr-4 font-mono">{l.classCount}</td>
                    <td className="py-2 pr-4 font-mono">{l.examCount}</td>
                    <td className={`py-2 pr-4 font-mono ${l.pendingEssays > 0 ? "text-amber-700 font-bold" : ""}`}>{l.pendingEssays}</td>
                    <td className="py-2 pr-4 font-mono">{l.avgTurnaroundHours !== null ? `${l.avgTurnaroundHours}h` : "—"}</td>
                    <td className="py-2 pr-4 font-mono">{l.appealRatePct !== null ? `${l.appealRatePct}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>
    </>
  );
}
