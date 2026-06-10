import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

type EssayAnswer = {
  id: string;
  question_id: string;
  questionText: string;
  maxPoints: number;
  modelAnswer: string | null;
  rubric: string | null;
  answer: string;
  score: number | null;
};

type Submission = {
  id: string;
  studentName: string;
  status: string;
  score: number | null;
  auto_score: number;
  total: number | null;
  flags: number;
  submittedAt: string | null;
  flagReasons: { time: string; type: string; label: string }[];
  essayAnswers: EssayAnswer[];
};
import { Card, PageHeader, Stat, Section } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import {
  getLecturerExamResults,
  gradeEssayAnswer,
} from "@/lib/supabase/exams";
import { ChevronDown, ChevronUp, AlertTriangle, Download } from "lucide-react";
import { fmtMY } from "@/lib/datetime";
import { toast } from "sonner";
import { buildCSV, downloadCSV, printTable } from "@/lib/export";

export const Route = createFileRoute(
  "/_authenticated/lecturer/exams/$examId/results"
)({
  head: () => ({ meta: [{ title: "Results — Aura" }] }),
  loader: ({ params }) => getLecturerExamResults({ data: params.examId }),
  component: Results,
});

function ExportMenu({ label, onCSV, onPDF }: { label: string; onCSV: () => void; onPDF: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <WakeoutButton variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        {label} ▾
      </WakeoutButton>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-card border-2 border-ink rounded-xl shadow-brut-sm overflow-hidden min-w-[150px]">
            <button onClick={() => { onCSV(); setOpen(false); }} className="block w-full px-4 py-2.5 text-sm text-left hover:bg-secondary font-mono">↓ CSV</button>
            <button onClick={() => { onPDF(); setOpen(false); }} className="block w-full px-4 py-2.5 text-sm text-left hover:bg-secondary font-mono border-t border-ink/10">⎙ Print / PDF</button>
          </div>
        </>
      )}
    </div>
  );
}

function fmtExport(iso: string | null) {
  if (!iso) return "—";
  return fmtMY(iso, { dateStyle: "short", timeStyle: "short" });
}

function pct(score: number | null, total: number) {
  if (!total || score == null) return "—";
  return `${Math.round((score / total) * 100)}%`;
}

const STATUS_COLORS: Record<string, string> = {
  "in-progress": "bg-amber",
  submitted: "bg-sky",
  graded: "bg-lime",
  flagged: "bg-pink",
};

function Results() {
  const initial = Route.useLoaderData();
  const [subs, setSubs] = useState<Submission[]>(initial.submissions as Submission[]);
  // Re-sync when the loader re-runs (e.g. window refocus after grading in another tab).
  useEffect(() => { setSubs(initial.submissions as Submission[]); }, [initial]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { exam } = initial;

  function exportExamCSV() {
    const headers = ["Student", "Score", "Total", "%", "Status", "MCQ/TF", "Essay", "Flags", "Submitted"];
    const rows = subs.map((s) => [
      s.studentName, s.score ?? 0, s.total ?? 0, pct(s.score, s.total ?? 0),
      s.status, s.auto_score, Math.max(0, (s.score ?? 0) - s.auto_score), s.flags, fmtExport(s.submittedAt),
    ]);
    downloadCSV(`${exam.classCode}-${exam.title}-results`, buildCSV(headers, rows));
  }

  function exportExamPDF() {
    const headers = ["Student", "Score", "Total", "%", "Status", "MCQ/TF", "Essay", "Flags", "Submitted"];
    const rows = subs.map((s) => [
      s.studentName, s.score ?? 0, s.total ?? 0, pct(s.score, s.total ?? 0),
      s.status, s.auto_score, Math.max(0, (s.score ?? 0) - s.auto_score), s.flags, fmtExport(s.submittedAt),
    ]);
    printTable(`${exam.title} — Results`, `${exam.classCode} · ${subs.length} submissions`, headers, rows);
  }

  function exportSlipCSV(s: Submission) {
    const headers = ["Field", "Value"];
    const rows: [string, string | number][] = [
      ["Student", s.studentName], ["Exam", exam.title], ["Class", exam.classCode],
      ["Score", s.total ? `${s.score ?? 0} / ${s.total} pts` : "—"],
      ["%", pct(s.score, s.total ?? 0)], ["Status", s.status],
      ["MCQ/TF Score", `${s.auto_score} pts`],
      ["Essay Score", `${Math.max(0, (s.score ?? 0) - s.auto_score)} pts`],
      ["Integrity Flags", s.flags], ["Submitted", fmtExport(s.submittedAt)],
    ];
    downloadCSV(`${exam.classCode}-${exam.title}-${s.studentName}-slip`, buildCSV(headers, rows));
  }

  function exportSlipPDF(s: Submission) {
    const headers = ["Field", "Value"];
    const rows: [string, string | number][] = [
      ["Student", s.studentName], ["Exam", exam.title], ["Class", exam.classCode],
      ["Score", s.total ? `${s.score ?? 0} / ${s.total} pts` : "—"],
      ["%", pct(s.score, s.total ?? 0)], ["Status", s.status],
      ["MCQ/TF Score", `${s.auto_score} pts`],
      ["Essay Score", `${Math.max(0, (s.score ?? 0) - s.auto_score)} pts`],
      ["Integrity Flags", s.flags], ["Submitted", fmtExport(s.submittedAt)],
    ];
    printTable(`Result Slip — ${s.studentName}`, `${exam.title} · ${exam.classCode}`, headers, rows);
  }

  const submitted = subs.filter((s) => s.status !== "in-progress");
  const inProgress = subs.filter((s) => s.status === "in-progress");
  const flagged = subs.filter((s) => s.status === "flagged");
  const essayPending = subs.filter((s) =>
    s.essayAnswers.some((ea) => ea.score === null)
  );

  function getScoreKey(submissionId: string, answerId: string) {
    return `${submissionId}-${answerId}`;
  }

  async function handleGrade(answerId: string, submissionId: string) {
    const key = getScoreKey(submissionId, answerId);
    const scoreVal = scores[key];
    if (scoreVal === undefined || scoreVal === "") {
      toast.error("Please enter a score");
      return;
    }
    setSaving(key);
    try {
      const result = await gradeEssayAnswer({
        data: { answerId, submissionId, score: Number(scoreVal) },
      });
      // Optimistically update local state
      setSubs((prev) =>
        prev.map((s) => {
          if (s.id !== submissionId) return s;
          return {
            ...s,
            score: result.newScore,
            status: result.allGraded ? "graded" : s.status,
            essayAnswers: s.essayAnswers.map((ea) =>
              ea.id === answerId ? { ...ea, score: Number(scoreVal) } : ea
            ),
          };
        })
      );
      toast.success(result.allGraded ? "All essays graded — marked as graded!" : "Score saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save score");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <PageHeader
        badge="Results"
        badgeColor="bg-lime"
        title={exam.title}
        subtitle={exam.classCode}
      />
      <div className="flex justify-end mb-4">
        <ExportMenu label="Export exam" onCSV={exportExamCSV} onPDF={exportExamPDF} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Submitted" value={submitted.length} color="bg-lime" />
        <Stat label="In progress" value={inProgress.length} color="bg-amber" />
        <Stat label="Essays pending" value={essayPending.length} color="bg-violet" />
        <Stat label="Integrity flags" value={flagged.length} color="bg-pink" />
      </div>

      <div className="flex gap-3 flex-wrap items-center mb-4">
        <input
          type="search"
          placeholder="Search by student name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setExpandedId(null); }}
          className="flex-1 min-w-[200px] border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setExpandedId(null); }}
          className="border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="in-progress">In progress</option>
          <option value="submitted">Submitted</option>
          <option value="graded">Graded</option>
          <option value="flagged">Flagged</option>
        </select>
      </div>

      <Card className="mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono uppercase tracking-widest text-muted-foreground border-b-2 border-ink">
              <th className="py-3">Student</th>
              <th>Status</th>
              <th>Score</th>
              <th className="hidden md:table-cell">Breakdown</th>
              <th>Flags</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-ink/10">
            {subs.filter((s) => {
              const q = search.toLowerCase();
              const matchSearch = !q || s.studentName.toLowerCase().includes(q);
              const matchStatus = statusFilter === "all" || s.status === statusFilter;
              return matchSearch && matchStatus;
            }).map((s) => (
              <tr key={s.id} className={s.status === "flagged" ? "bg-pink/10" : ""}>
                <td className="py-3 font-semibold">{s.studentName}</td>
                <td>
                  <span
                    className={`px-2 py-0.5 rounded-full border-2 border-ink text-xs font-mono uppercase ${STATUS_COLORS[s.status] ?? "bg-card"}`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="py-3">
                  {s.total ? (
                    <div className="space-y-0.5">
                      <div className="font-mono font-bold text-sm">
                        {s.score ?? 0} / {s.total} pts
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {Math.round(((s.score ?? 0) / s.total) * 100)}%
                      </div>
                    </div>
                  ) : (
                    <span className="font-mono text-muted-foreground">—</span>
                  )}
                </td>
                <td className="hidden md:table-cell text-xs font-mono text-muted-foreground">
                  <div>MCQ/TF: {s.auto_score ?? 0} pts</div>
                  <div>Essay: {(s.score ?? 0) - (s.auto_score ?? 0)} pts</div>
                </td>
                <td className="font-mono">
                  {s.flags > 0 ? (
                    <span className="flex items-center gap-1 text-pink-600 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5" /> {s.flags}
                    </span>
                  ) : (
                    "0"
                  )}
                </td>
                <td>
                  <ExportMenu
                    label="slip"
                    onCSV={() => exportSlipCSV(s)}
                    onPDF={() => exportSlipPDF(s)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {flagged.length > 0 && (
        <Section title="Integrity flag review">
          <div className="space-y-3">
            {flagged.map((s) => (
              <Card key={s.id} className="bg-pink/10">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-display font-bold">{s.studentName}</div>
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">
                      {s.flags} incident{s.flags !== 1 ? "s" : ""}
                      {s.submittedAt
                        ? ` · submitted ${fmtMY(s.submittedAt, { dateStyle: "short", timeStyle: "short" })}`
                        : ""}
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full border-2 border-ink text-xs font-mono uppercase bg-pink">
                    flagged
                  </span>
                </div>
                {s.flagReasons.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {s.flagReasons.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="font-mono text-xs bg-secondary px-2 py-0.5 rounded">
                          {f.time}
                        </span>
                        <span>{f.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </Section>
      )}

      <Section title="Grade essays">
        {subs.filter((s) => s.essayAnswers.length > 0).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No essay submissions for this exam yet.
          </p>
        ) : (
          <div className="space-y-3">
            {subs
              .filter((s) => s.essayAnswers.length > 0)
              .map((s) => {
                const isOpen = expandedId === s.id;
                const gradedCount = s.essayAnswers.filter((ea) => ea.score !== null).length;
                return (
                  <Card key={s.id}>
                    <button
                      className="w-full flex items-center justify-between gap-4"
                      onClick={() => setExpandedId(isOpen ? null : s.id)}
                    >
                      <div className="text-left">
                        <div className="font-display font-bold">{s.studentName}</div>
                        <div className="text-xs font-mono text-muted-foreground">
                          {s.essayAnswers.length} essay question
                          {s.essayAnswers.length !== 1 ? "s" : ""} · {gradedCount}/{s.essayAnswers.length} graded
                        </div>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="w-5 h-5 shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 shrink-0" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="mt-5 space-y-8 border-t-2 border-ink/10 pt-5">
                        {s.essayAnswers.map((ea) => {
                          const key = getScoreKey(s.id, ea.id);
                          return (
                            <div key={ea.id} className="space-y-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                  {ea.maxPoints} pts available
                                </span>
                                {ea.score !== null && (
                                  <span className="px-2 py-0.5 rounded-full bg-lime border-2 border-ink text-xs font-mono font-bold">
                                    {ea.score} / {ea.maxPoints} pts · {Math.round((ea.score / ea.maxPoints) * 100)}%
                                  </span>
                                )}
                              </div>
                              <div className="font-semibold">{ea.questionText}</div>

                              {/* Model answer */}
                              {ea.modelAnswer && (
                                <div className="rounded-2xl border-2 border-ink/30 bg-lime/20 p-4">
                                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink/50 mb-1">
                                    Model answer
                                  </div>
                                  <p className="text-sm leading-relaxed">{ea.modelAnswer}</p>
                                </div>
                              )}

                              {/* Rubric */}
                              {ea.rubric && (
                                <div className="rounded-2xl border-2 border-ink/30 bg-violet/10 p-4">
                                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink/50 mb-1">
                                    Rubric
                                  </div>
                                  <p className="text-sm leading-relaxed whitespace-pre-line">{ea.rubric}</p>
                                </div>
                              )}

                              {/* Student answer */}
                              <div className="bg-secondary rounded-2xl border-2 border-ink/20 p-4 text-sm leading-relaxed">
                                {ea.answer || (
                                  <span className="text-ink/40 italic">No answer provided</span>
                                )}
                              </div>

                              <div className="flex items-center gap-3">
                                <label className="text-xs font-mono uppercase tracking-widest">
                                  Give pts
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={ea.maxPoints}
                                  value={scores[key] ?? (ea.score !== null ? String(ea.score) : "")}
                                  onChange={(ev) =>
                                    setScores((prev) => ({ ...prev, [key]: ev.target.value }))
                                  }
                                  placeholder={`0–${ea.maxPoints}`}
                                  className="w-28 border-2 border-ink rounded-xl px-3 py-2 bg-background font-mono text-sm"
                                />
                                <span className="text-xs text-muted-foreground">/ {ea.maxPoints} pts</span>
                                <WakeoutButton
                                  variant="primary"
                                  size="sm"
                                  disabled={saving === key}
                                  onClick={() => handleGrade(ea.id, s.id)}
                                >
                                  {saving === key ? "Saving…" : "Save score"}
                                </WakeoutButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
          </div>
        )}
      </Section>
    </>
  );
}
