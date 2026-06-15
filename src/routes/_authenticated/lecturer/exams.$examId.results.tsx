import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";

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

import { Card, PageHeader, Section } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getLecturerExamResults, gradeEssayAnswer } from "@/lib/supabase/exams";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { fmtMY } from "@/lib/datetime";
import { toast } from "sonner";
import { buildCSV, downloadCSV, printTable } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/lecturer/exams/$examId/results")({
  head: () => ({ meta: [{ title: "Results — Aura" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab === "grading" ? "grading" : "results") as Tab,
  }),
  loader: ({ params }) => getLecturerExamResults({ data: params.examId }),
  component: Results,
});

type Tab = "results" | "grading";

const STATUS_COLORS: Record<string, string> = {
  "in-progress":  "bg-amber text-amber-900",
  submitted:      "bg-sky text-sky-900",
  graded:         "bg-lime text-lime-900",
  flagged:        "bg-pink text-white",
  "not-answered": "bg-secondary text-muted-foreground",
};

const SCORE_BAR: Record<string, string> = {
  graded:    "bg-lime",
  submitted: "bg-sky",
  flagged:   "bg-pink",
};

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
          <div className="absolute right-0 top-full mt-1 z-20 bg-card border-2 border-ink rounded-xl shadow-brut-sm overflow-hidden min-w-[140px]">
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

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`rounded-2xl border-2 border-ink p-3 text-center shadow-brut-sm ${color}`}>
      <div className="text-2xl font-display font-black">{value}</div>
      <div className="text-[10px] font-mono uppercase tracking-widest mt-0.5 opacity-70 leading-tight">{label}</div>
    </div>
  );
}

function Results() {
  const initial = Route.useLoaderData();
  const [subs, setSubs] = useState<Submission[]>(initial.submissions as Submission[]);
  useEffect(() => { setSubs(initial.submissions as Submission[]); }, [initial]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [scoreErrors, setScoreErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { tab: initialTab } = Route.useSearch();
  const [tab, setTab] = useState<Tab>(initialTab);

  const { exam } = initial;

  const submitted    = useMemo(() => subs.filter((s) => s.status !== "in-progress" && s.status !== "not-answered"), [subs]);
  const inProgress   = useMemo(() => subs.filter((s) => s.status === "in-progress"), [subs]);
  const notAnswered  = useMemo(() => subs.filter((s) => s.status === "not-answered"), [subs]);
  const flagged      = useMemo(() => subs.filter((s) => s.status === "flagged"), [subs]);
  const essayPending = useMemo(() => subs.filter((s) => s.essayAnswers.some((ea) => ea.score === null)), [subs]);

  const scoredSubs = useMemo(() => submitted.filter((s) => s.score !== null && s.total), [submitted]);

  const highScore = useMemo(() => {
    if (!scoredSubs.length) return null;
    return scoredSubs.reduce((best, s) => (s.score! / s.total!) > (best.score! / best.total!) ? s : best);
  }, [scoredSubs]);

  const lowScore = useMemo(() => {
    if (!scoredSubs.length) return null;
    return scoredSubs.reduce((worst, s) => (s.score! / s.total!) < (worst.score! / worst.total!) ? s : worst);
  }, [scoredSubs]);

  const filteredSubs = useMemo(() => {
    const q = search.toLowerCase();
    return subs.filter((s) => {
      const matchSearch = !q || s.studentName.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [subs, search, statusFilter]);

  function exportExamCSV() {
    const headers = ["Student", "Score", "Total", "%", "Status", "MCQ/TF", "Essay", "Flags", "Submitted"];
    const rows = subs.map((s) => [
      s.studentName, s.score ?? 0, s.total ?? 0, pct(s.score, s.total ?? 0),
      s.status, s.auto_score, Math.max(0, (s.score ?? 0) - s.auto_score), s.flags, fmtExport(s.submittedAt),
    ]);
    downloadCSV(`${exam.classCode}-${exam.title}-results`, buildCSV(headers, rows));
  }

  function exportExamPDF() {
    const headers = ["Student", "Score", "Total", "%", "Status", "Flags", "Submitted"];
    const rows = subs.map((s) => [
      s.studentName, s.score ?? 0, s.total ?? 0, pct(s.score, s.total ?? 0),
      s.status, s.flags, fmtExport(s.submittedAt),
    ]);
    printTable(`${exam.title} — Results`, `${exam.classCode} · ${submitted.length} submissions`, headers, rows);
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

  function getScoreKey(submissionId: string, answerId: string) {
    return `${submissionId}-${answerId}`;
  }

  async function handleGrade(answerId: string, submissionId: string, maxPoints: number) {
    const key = getScoreKey(submissionId, answerId);
    const scoreVal = scores[key];
    if (scoreVal === undefined || scoreVal === "") { toast.error("Please enter a score"); return; }
    const numeric = Number(scoreVal);
    if (numeric < 0 || numeric > maxPoints) {
      setScoreErrors((prev) => ({ ...prev, [key]: `Score must be between 0 and ${maxPoints}` }));
      toast.error(`Score must be between 0 and ${maxPoints} pts`);
      return;
    }
    setSaving(key);
    try {
      const result = await gradeEssayAnswer({ data: { answerId, submissionId, score: Number(scoreVal) } });
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
        action={<ExportMenu label="Export" onCSV={exportExamCSV} onPDF={exportExamPDF} />}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <StatBox label="Submitted"      value={submitted.length}    color="bg-lime" />
        <StatBox label="In progress"    value={inProgress.length}   color="bg-amber" />
        <StatBox label="Not answered"   value={notAnswered.length}  color="bg-secondary" />
        <StatBox label="Flagged"        value={flagged.length}      color="bg-pink" />
        <StatBox label="Essays pending" value={essayPending.length} color="bg-violet" />
        <StatBox
          label="Highest"
          value={highScore ? `${Math.round((highScore.score! / highScore.total!) * 100)}%` : "—"}
          color="bg-lime/50"
        />
        <StatBox
          label="Lowest"
          value={lowScore ? `${Math.round((lowScore.score! / lowScore.total!) * 100)}%` : "—"}
          color="bg-pink/30"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(["results", "grading"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-full border-2 border-ink text-sm font-semibold capitalize transition-all ${
              tab === t ? "bg-violet text-white shadow-brut-sm" : "bg-card hover:bg-secondary"
            }`}
          >
            {t === "grading" && essayPending.length > 0
              ? `Grading (${essayPending.length} pending)`
              : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Results tab ── */}
      {tab === "results" && (
        <>
          <div className="flex flex-wrap gap-3 mb-5">
            <input
              type="search"
              placeholder="Search by student name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[180px] border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime cursor-pointer"
            >
              <option value="all">All statuses</option>
              <option value="in-progress">In progress</option>
              <option value="submitted">Submitted</option>
              <option value="graded">Graded</option>
              <option value="flagged">Flagged</option>
              <option value="not-answered">Not answered</option>
            </select>
          </div>

          {filteredSubs.length === 0 ? (
            <Card className="text-center py-12 text-ink/50">No students match your search.</Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {filteredSubs.map((s) => {
                const isNA     = s.status === "not-answered";
                const hasScore = s.score !== null && s.total;
                const scorePct = hasScore ? Math.round((s.score! / s.total!) * 100) : null;
                const barColor = SCORE_BAR[s.status] ?? "bg-secondary";

                return (
                  <div
                    key={s.id}
                    className={`rounded-2xl border-2 border-ink p-4 space-y-3 shadow-brut-sm bg-card ${
                      s.status === "flagged" ? "border-pink bg-pink/5" : isNA ? "opacity-60" : ""
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-full border-2 border-ink flex items-center justify-center font-bold text-sm shrink-0 ${
                          s.status === "flagged"   ? "bg-pink text-white" :
                          s.status === "graded"    ? "bg-lime" :
                          s.status === "submitted" ? "bg-sky" : "bg-secondary"
                        }`}>
                          {s.studentName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-display font-bold truncate">{s.studentName}</div>
                          {s.submittedAt && (
                            <div className="text-[10px] font-mono text-muted-foreground">
                              {fmtMY(s.submittedAt, { dateStyle: "short", timeStyle: "short" })}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full border border-ink/30 text-[10px] font-mono uppercase tracking-wide ${STATUS_COLORS[s.status] ?? "bg-card"}`}>
                        {s.status.replace("-", " ")}
                      </span>
                    </div>

                    {/* Score bar */}
                    {!isNA && (
                      <div>
                        <div className="flex justify-between items-baseline mb-1.5 text-sm font-mono">
                          <span className="font-bold">
                            {hasScore ? `${s.score} / ${s.total} pts` : "—"}
                          </span>
                          {scorePct !== null && (
                            <span className={`font-bold ${scorePct >= 50 ? "text-green-700" : "text-pink"}`}>
                              {scorePct}%
                            </span>
                          )}
                        </div>
                        <div className="h-2 rounded-full bg-secondary border border-ink/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${scorePct ?? 0}%` }}
                          />
                        </div>
                        <div className="flex gap-3 mt-1.5 text-[10px] font-mono text-muted-foreground">
                          <span>MCQ/TF: {s.auto_score ?? 0}pts</span>
                          <span>Essay: {Math.max(0, (s.score ?? 0) - (s.auto_score ?? 0))}pts</span>
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-ink/10">
                      <div className="text-xs font-mono">
                        {s.flags > 0 ? (
                          <span className="flex items-center gap-1 text-pink font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" /> {s.flags} flag{s.flags !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0 flags</span>
                        )}
                      </div>
                      {!isNA && (
                        <ExportMenu label="Slip" onCSV={() => exportSlipCSV(s)} onPDF={() => exportSlipPDF(s)} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Integrity flag review */}
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
                          {s.submittedAt ? ` · submitted ${fmtMY(s.submittedAt, { dateStyle: "short", timeStyle: "short" })}` : ""}
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full border-2 border-ink text-xs font-mono uppercase bg-pink">flagged</span>
                    </div>
                    {s.flagReasons.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {s.flagReasons.map((f, i) => (
                          <div key={i} className="flex items-center gap-3 text-sm">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            <span className="font-mono text-xs bg-secondary px-2 py-0.5 rounded">{f.time}</span>
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
        </>
      )}

      {/* ── Grading tab ── */}
      {tab === "grading" && (
        <Section title="Grade essays">
          {subs.filter((s) => s.essayAnswers.length > 0).length === 0 ? (
            <p className="text-sm text-muted-foreground">No essay submissions for this exam yet.</p>
          ) : (
            <div className="space-y-3">
              {subs.filter((s) => s.essayAnswers.length > 0).map((s) => {
                const isOpen      = expandedId === s.id;
                const gradedCount = s.essayAnswers.filter((ea) => ea.score !== null).length;
                const allGraded   = gradedCount === s.essayAnswers.length;

                return (
                  <Card key={s.id}>
                    <button
                      className="w-full flex items-center justify-between gap-4"
                      onClick={() => setExpandedId(isOpen ? null : s.id)}
                    >
                      <div className="text-left">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-bold">{s.studentName}</span>
                          {allGraded
                            ? <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-lime border border-ink/20 uppercase">Done</span>
                            : <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber border border-ink/20 uppercase">{s.essayAnswers.length - gradedCount} pending</span>}
                        </div>
                        <div className="text-xs font-mono text-muted-foreground mt-0.5">
                          {s.essayAnswers.length} essay question{s.essayAnswers.length !== 1 ? "s" : ""} · {gradedCount}/{s.essayAnswers.length} graded
                        </div>
                      </div>
                      {isOpen ? <ChevronUp className="w-5 h-5 shrink-0" /> : <ChevronDown className="w-5 h-5 shrink-0" />}
                    </button>

                    {isOpen && (
                      <div className="mt-5 space-y-8 border-t-2 border-ink/10 pt-5">
                        {s.essayAnswers.map((ea) => {
                          const key = getScoreKey(s.id, ea.id);
                          return (
                            <div key={ea.id} className="space-y-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{ea.maxPoints} pts available</span>
                                {ea.score !== null && (
                                  <span className="px-2 py-0.5 rounded-full bg-lime border-2 border-ink text-xs font-mono font-bold">
                                    {ea.score} / {ea.maxPoints} pts · {Math.round((ea.score / ea.maxPoints) * 100)}%
                                  </span>
                                )}
                              </div>
                              <div className="font-semibold">{ea.questionText}</div>

                              {ea.modelAnswer && (
                                <div className="rounded-2xl border-2 border-ink/30 bg-lime/20 p-4">
                                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink/50 mb-1">Model answer</div>
                                  <p className="text-sm leading-relaxed">{ea.modelAnswer}</p>
                                </div>
                              )}

                              {ea.rubric && (
                                <div className="rounded-2xl border-2 border-ink/30 bg-violet/10 p-4">
                                  <div className="text-[10px] font-mono uppercase tracking-widest text-ink/50 mb-1">Rubric</div>
                                  <p className="text-sm leading-relaxed whitespace-pre-line">{ea.rubric}</p>
                                </div>
                              )}

                              <div className="bg-secondary rounded-2xl border-2 border-ink/20 p-4 text-sm leading-relaxed">
                                {ea.answer || <span className="text-ink/40 italic">No answer provided</span>}
                              </div>

                              <div className="space-y-1.5">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <label className="text-xs font-mono uppercase tracking-widest">Give pts</label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={ea.maxPoints}
                                    value={scores[key] ?? (ea.score !== null ? String(ea.score) : "")}
                                    onChange={(ev) => {
                                      const raw = ev.target.value;
                                      if (raw !== "" && Number(raw) > ea.maxPoints) {
                                        setScoreErrors((prev) => ({ ...prev, [key]: `Max is ${ea.maxPoints} pts` }));
                                      } else {
                                        setScoreErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
                                      }
                                      setScores((prev) => ({ ...prev, [key]: raw }));
                                    }}
                                    placeholder={`0–${ea.maxPoints}`}
                                    className={`w-28 border-2 rounded-xl px-3 py-2 bg-background font-mono text-sm focus:outline-none ${scoreErrors[key] ? "border-pink" : "border-ink"}`}
                                  />
                                  <span className="text-xs text-muted-foreground">/ {ea.maxPoints} pts</span>
                                  <WakeoutButton
                                    variant="primary"
                                    size="sm"
                                    disabled={saving === key || !!scoreErrors[key]}
                                    onClick={() => handleGrade(ea.id, s.id, ea.maxPoints)}
                                  >
                                    {saving === key ? "Saving…" : "Save score"}
                                  </WakeoutButton>
                                </div>
                                {scoreErrors[key] && (
                                  <p className="text-xs font-mono text-pink font-semibold pl-[72px]">{scoreErrors[key]}</p>
                                )}
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
      )}
    </>
  );
}
