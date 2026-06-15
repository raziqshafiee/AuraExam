import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PageHeader, Card, Section, Empty } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import {
  getClassDetail,
  getClassAssignments,
  getMyAssignmentSubmissions,
  submitToAssignment,
} from "@/lib/supabase/classes";
import { getMyGrade } from "@/lib/supabase/grade-report";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { FileText, Image, File, Download, Upload } from "lucide-react";
import { fmtMY } from "@/lib/datetime";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/student/classes/$classId")({
  head: () => ({ meta: [{ title: "Class — Aura" }] }),
  loader: async ({ params }) => {
    let detail: Awaited<ReturnType<typeof getClassDetail>>;
    try {
      detail = await getClassDetail({ data: params.classId });
    } catch {
      throw notFound();
    }
    const [assignments, mySubmissions, myGrade] = await Promise.all([
      getClassAssignments({ data: params.classId }).catch(() => []),
      getMyAssignmentSubmissions({ data: params.classId }).catch(() => []),
      getMyGrade({ data: params.classId }).catch(() => null),
    ]);
    return { ...detail, assignments, mySubmissions, myGrade };
  },
  component: ClassDetail,
});

const FILE_ICON = { pdf: FileText, image: Image, file: File } as const;

function detectType(name: string): "pdf" | "image" | "file" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  return "file";
}

function fmtDate(iso: string) {
  return fmtMY(iso, { dateStyle: "medium", timeStyle: "short" });
}

type Tab = "announcements" | "notes" | "assignments" | "exams";

function ClassDetail() {
  const {
    classInfo: c,
    announcements: ann,
    notes,
    exams: classExams,
    assignments: initialAssignments,
    mySubmissions: initialMySubs,
    myGrade,
  } = Route.useLoaderData() as any;

  const [tab, setTab] = useState<Tab>("announcements");
  const [assignments] = useState<any[]>(initialAssignments);
  const [mySubs, setMySubs] = useState<any[]>(initialMySubs);

  const [submittingFor, setSubmittingFor] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getMySubmission = (assignmentId: string) =>
    mySubs.find((s) => s.assignment_id === assignmentId);

  function openUploadFor(assignmentId: string) {
    setSubmittingFor(assignmentId);
    setPickedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(assignmentId: string) {
    if (!pickedFile) return;
    setIsUploading(true);
    try {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const path = `${assignmentId}/${user.id}/${Date.now()}-${pickedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("student-submissions")
        .upload(path, pickedFile, { upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      const {
        data: { publicUrl },
      } = supabase.storage.from("student-submissions").getPublicUrl(path);

      const submission = await submitToAssignment({
        data: {
          assignmentId,
          classId: c.id,
          fileUrl: publicUrl,
          fileName: pickedFile.name,
          fileType: detectType(pickedFile.name),
        },
      });

      toast.success(
        mySubs.some((s) => s.assignment_id === assignmentId)
          ? "Submission updated!"
          : "Submitted!"
      );
      setMySubs((prev) => {
        const exists = prev.some((s) => s.assignment_id === assignmentId);
        return exists
          ? prev.map((s) => (s.assignment_id === assignmentId ? submission : s))
          : [...prev, submission];
      });
      setSubmittingFor(null);
      setPickedFile(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to submit");
    } finally {
      setIsUploading(false);
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "announcements", label: `Announcements (${ann.length})` },
    { key: "notes", label: `Notes (${notes.length})` },
    { key: "assignments", label: `Assignments (${assignments.length})` },
    { key: "exams", label: `Exams (${classExams.length})` },
  ];

  return (
    <>
      <PageHeader
        badge={c.code}
        badgeColor={`bg-${c.color}`}
        title={c.name}
        subtitle={`${c.lecturer} · ${c.students} students`}
      />

      {/* Subject grade card */}
      {myGrade ? (
        <Card className="mb-6">
          <div className="flex items-center gap-4 flex-wrap mb-4">
            <div className="flex-1">
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">Subject grade</div>
              <div className="flex items-baseline gap-3">
                <span className="font-display font-extrabold text-3xl">{myGrade.pct}%</span>
                <span className={`px-3 py-1 rounded-full border-2 border-ink text-sm font-mono font-bold ${
                  myGrade.grade === "A" ? "bg-lime" : myGrade.grade === "B" ? "bg-sky" : myGrade.grade === "C" ? "bg-amber" : myGrade.grade === "D" ? "bg-violet text-violet-foreground" : "bg-pink text-white"
                }`}>
                  {myGrade.grade}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {myGrade.breakdown.map((b: any) => (
              <div key={b.label} className="flex items-center gap-3 rounded-xl border-2 border-ink/10 px-3 py-2 bg-secondary/40">
                <div className="flex-1 text-sm font-semibold truncate">{b.label}</div>
                <div className="text-right font-mono">
                  <div className="text-sm font-bold">{b.contribution} / {b.weight}</div>
                  <div className="text-[10px] text-muted-foreground">{b.score}/{b.maxScore} raw</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="mb-6 border-ink/20 bg-secondary/30">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">Subject grade</div>
          <p className="text-sm text-muted-foreground">Not configured yet — your lecturer hasn't set up grade weights for this class.</p>
        </Card>
      )}

      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-full border-2 border-ink text-sm font-semibold transition-all ${
              tab === t.key
                ? "bg-sky text-white shadow-brut-sm"
                : "bg-card hover:bg-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Announcements ── */}
      {tab === "announcements" && (
        <Section title="Announcements">
          {ann.length === 0 ? (
            <Empty title="No announcements yet" />
          ) : (
            <div className="space-y-3">
              {ann.map((a: any) => (
                <Card key={a.id}>
                  <div className="flex items-baseline justify-between">
                    <div className="font-display font-bold text-lg">{a.title}</div>
                    <div className="text-xs font-mono text-muted-foreground">{a.date}</div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
                  <div className="mt-3 text-xs font-mono text-muted-foreground">
                    — {a.author}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Notes ── */}
      {tab === "notes" && (
        <Section title="Class notes">
          {notes.length === 0 ? (
            <Empty
              title="No notes posted yet"
              hint="Your lecturer hasn't uploaded any materials for this class."
            />
          ) : (
            <div className="space-y-3">
              {notes.map((n: any) => {
                const Icon = FILE_ICON[n.file_type as keyof typeof FILE_ICON] || File;
                return (
                  <Card key={n.id} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl border-2 border-ink bg-secondary flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold">{n.title}</div>
                      {n.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {n.description}
                        </p>
                      )}
                      <div className="text-xs font-mono text-muted-foreground mt-1">
                        {n.file_name} · posted {fmtMY(n.created_at, { dateStyle: "short" })}
                      </div>
                    </div>
                    {n.file_url && (
                      <a href={n.file_url} target="_blank" rel="noopener noreferrer">
                        <WakeoutButton size="sm" variant="secondary" asChild>
                          <span className="flex items-center gap-1.5">
                            <Download className="w-3.5 h-3.5" /> Download
                          </span>
                        </WakeoutButton>
                      </a>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ── Assignments ── */}
      {tab === "assignments" && (
        <Section title="Assignments">
          {assignments.length === 0 ? (
            <Empty
              title="No assignments yet"
              hint="Your lecturer hasn't posted any assignments."
            />
          ) : (
            <div className="space-y-4">
              {assignments.map((a: any) => {
                const mySub = getMySubmission(a.id);
                const now = new Date();
                const isOpen =
                  now >= new Date(a.start_at) && now <= new Date(a.end_at);
                const isUpcoming = now < new Date(a.start_at);
                const isExpanding = submittingFor === a.id;

                return (
                  <Card key={a.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-display font-bold text-lg">{a.title}</div>
                          <span
                            className={`px-2 py-0.5 rounded-full border-2 border-ink text-xs font-mono uppercase ${
                              isOpen
                                ? "bg-lime"
                                : isUpcoming
                                  ? "bg-sky"
                                  : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {isOpen ? "open" : isUpcoming ? "upcoming" : "closed"}
                          </span>
                        </div>
                        {a.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {a.description}
                          </p>
                        )}
                        <div className="text-xs font-mono text-muted-foreground mt-2">
                          {fmtDate(a.start_at)} → {fmtDate(a.end_at)}
                        </div>
                      </div>
                    </div>

                    {a.file_url && (
                      <div className="mt-3">
                        <a href={a.file_url} target="_blank" rel="noopener noreferrer">
                          <WakeoutButton size="sm" variant="secondary" asChild>
                            <span className="flex items-center gap-1.5">
                              <Download className="w-3.5 h-3.5" />{" "}
                              {a.file_name ?? "Download attachment"}
                            </span>
                          </WakeoutButton>
                        </a>
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t-2 border-ink/10 space-y-3">
                      {/* Current submission summary (shown whenever one exists) */}
                      {mySub && (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                              Your submission
                            </div>
                            <div className="text-sm font-semibold truncate">
                              {mySub.file_name}
                            </div>
                            <div className="text-xs font-mono text-muted-foreground">
                              {fmtMY(mySub.created_at, { dateStyle: "short" })}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {mySub.file_url && (
                              <a
                                href={mySub.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <WakeoutButton size="sm" variant="secondary" asChild>
                                  <span>
                                    <Download className="w-3.5 h-3.5" />
                                  </span>
                                </WakeoutButton>
                              </a>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-full border-2 border-ink text-xs font-mono uppercase ${
                                mySub.status === "reviewed" ? "bg-lime" : "bg-amber"
                              }`}
                            >
                              {mySub.status === "reviewed" && mySub.grade != null
                                ? `${mySub.grade} / ${a.max_score} pts`
                                : mySub.status}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Feedback from lecturer */}
                      {mySub?.status === "reviewed" && mySub.feedback && (
                        <div className="text-sm text-muted-foreground bg-secondary rounded-xl border-2 border-ink/20 px-4 py-2.5 italic">
                          "{mySub.feedback}"
                        </div>
                      )}

                      {/* Upload / resubmit panel — only while assignment is open and not yet reviewed */}
                      {isOpen && mySub?.status !== "reviewed" && (
                        isExpanding ? (
                          <div className="space-y-3">
                            <label className="flex items-center gap-3 border-2 border-ink rounded-xl px-4 py-3 bg-background cursor-pointer hover:bg-secondary transition-colors">
                              <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="flex-1 text-sm text-muted-foreground truncate">
                                {pickedFile ? pickedFile.name : "Choose file…"}
                              </span>
                              <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                onChange={(e) =>
                                  setPickedFile(e.target.files?.[0] ?? null)
                                }
                              />
                            </label>
                            {pickedFile && (
                              <div className="text-xs font-mono text-muted-foreground">
                                {detectType(pickedFile.name).toUpperCase()} ·{" "}
                                {(pickedFile.size / 1024).toFixed(1)} KB
                              </div>
                            )}
                            <div className="flex gap-2">
                              <WakeoutButton
                                onClick={() => handleSubmit(a.id)}
                                disabled={isUploading || !pickedFile}
                              >
                                {isUploading
                                  ? "Uploading…"
                                  : mySub
                                    ? "Replace submission"
                                    : "Submit"}
                              </WakeoutButton>
                              <WakeoutButton
                                variant="secondary"
                                onClick={() => {
                                  setSubmittingFor(null);
                                  setPickedFile(null);
                                }}
                                disabled={isUploading}
                              >
                                Cancel
                              </WakeoutButton>
                            </div>
                          </div>
                        ) : (
                          <WakeoutButton
                            size="sm"
                            variant={mySub ? "secondary" : "primary"}
                            onClick={() => openUploadFor(a.id)}
                          >
                            {mySub ? "Change submission" : "Submit file"}
                          </WakeoutButton>
                        )
                      )}

                      {/* Closed / upcoming state when no submission yet */}
                      {!mySub && !isOpen && (
                        <p className="text-sm text-muted-foreground">
                          {isUpcoming
                            ? "Submissions open on " + fmtDate(a.start_at)
                            : "Submission closed"}
                        </p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ── Exams ── */}
      {tab === "exams" && (
        <Section title="Exams in this class">
          {classExams.length === 0 ? (
            <Empty title="No exams scheduled yet" />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {classExams.map((e: any) => {
                const examEnded = e.status === "closed" || e.status === "graded";
                return (
                  <Card key={e.id}>
                    <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                      {e.status}
                    </div>
                    <div className="font-display font-bold text-lg mt-1">{e.title}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {e.questions_count || 0} questions · {e.duration} min
                    </div>
                    <div className="text-xs font-mono text-muted-foreground mt-1">
                      {fmtMY(e.start_time, { dateStyle: "medium", timeStyle: "short" })}
                      {" → "}
                      {fmtMY(e.end_time, { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                    <WakeoutButton asChild size="sm" className="mt-3" variant="secondary">
                      {examEnded ? (
                        <Link to="/student/exams/$examId/result" params={{ examId: e.id }}>
                          Result →
                        </Link>
                      ) : (
                        <Link to="/student/exams/$examId/lobby" params={{ examId: e.id }}>
                          Open →
                        </Link>
                      )}
                    </WakeoutButton>
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
