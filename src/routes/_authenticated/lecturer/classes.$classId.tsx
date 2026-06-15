import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useRef, useState, useCallback } from "react";
import { Card, PageHeader, Section, Empty } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { ConfirmModal } from "@/components/brand/confirm-modal";
import {
  getClassDetail,
  postAnnouncement,
  deleteNote,
  addNote,
  deleteAnnouncement,
  getClassMembers,
  removeStudent,
  createAssignment,
  deleteAssignment,
  getClassAssignments,
  getAssignmentSubmissions,
  reviewAssignmentSubmission,
} from "@/lib/supabase/classes";
import { unpublishExam, deleteExam } from "@/lib/supabase/exams";
import { saveGradeConfig, getGradeConfig, getGradeReport, type GradeConfigItem } from "@/lib/supabase/grade-report";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { fmtMY, myLocalInputToISO } from "@/lib/datetime";
import { getClassExportData, type ClassExportData, type ExportStudent } from "@/lib/supabase/exports";
import { buildCSV, downloadCSV, printTable } from "@/lib/export";
import { FileText, Image, File, Trash2, Upload, Users, CheckCircle, ChevronDown, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lecturer/classes/$classId")({
  head: () => ({ meta: [{ title: "Class — Aura" }] }),
  loader: async ({ params }) => {
    let detail: Awaited<ReturnType<typeof getClassDetail>>;
    try {
      detail = await getClassDetail({ data: params.classId });
    } catch {
      throw notFound();
    }
    const [members, assignments, gradeConfig] = await Promise.all([
      getClassMembers({ data: params.classId }).catch(() => []),
      getClassAssignments({ data: params.classId }).catch(() => []),
      getGradeConfig({ data: params.classId }).catch(() => ({ classId: params.classId, items: [], updatedAt: null })),
    ]);
    const gradeReport = (gradeConfig as any).items?.length > 0
      ? await getGradeReport({ data: params.classId }).catch(() => null)
      : null;
    return { ...detail, members, assignments, gradeConfig, gradeReport };
  },
  component: ClassDetail,
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
          <div className="absolute left-0 top-full mt-1 z-20 bg-card border-2 border-ink rounded-xl shadow-brut-sm overflow-hidden min-w-[150px]">
            <button onClick={() => { onCSV(); setOpen(false); }} className="block w-full px-4 py-2.5 text-sm text-left hover:bg-secondary font-mono">↓ CSV</button>
            <button onClick={() => { onPDF(); setOpen(false); }} className="block w-full px-4 py-2.5 text-sm text-left hover:bg-secondary font-mono border-t border-ink/10">⎙ Print / PDF</button>
          </div>
        </>
      )}
    </div>
  );
}

function fmtEx(iso: string | null) {
  return fmtMY(iso, { dateStyle: "short", timeStyle: "short" });
}

function letterGrade(pct: number): string {
  if (!isFinite(pct) || pct < 0) return "N/A";
  if (pct >= 80) return "A";
  if (pct >= 65) return "B";
  if (pct >= 50) return "C";
  if (pct >= 40) return "D";
  return "F";
}

function pctEx(score: number | null, total: number) {
  if (!total || score == null) return "—";
  return `${Math.round((score / total) * 100)}%`;
}

const FILE_ICON = { pdf: FileText, image: Image, file: File } as const;

type Tab = "announcements" | "notes" | "members" | "assignments" | "exams" | "grades";

function detectType(name: string): "pdf" | "image" | "file" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  return "file";
}

function fmtDate(iso: string) {
  return fmtMY(iso, { dateStyle: "medium", timeStyle: "short" });
}

function localNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EXAM_STATUS_STYLE: Record<string, string> = {
  draft:    "bg-secondary",
  upcoming: "bg-sky",
  live:     "bg-lime",
  closed:   "bg-amber",
  graded:   "bg-violet text-violet-foreground",
};

type ConfirmPending = {
  title: string;
  message: string;
  confirmLabel?: string;
  fn: () => Promise<void>;
} | null;

function ClassDetail() {
  const { classInfo: c, announcements: initialAnn, notes: initialNotes, members: initialMembers, assignments: initialAssignments, exams: initialExams, gradeConfig: initialGradeConfig, gradeReport: initialGradeReport } =
    Route.useLoaderData() as any;

  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "grades";
    return (localStorage.getItem("lecturer-class-tab") as Tab) ?? "grades";
  });
  const [notes, setNotes] = useState<any[]>(initialNotes);
  const [ann, setAnn] = useState<any[]>(initialAnn);
  const [members, setMembers] = useState<any[]>(initialMembers);
  const [assignments, setAssignments] = useState<any[]>(initialAssignments);
  const [exams, setExams] = useState<any[]>(initialExams ?? []);

  const [confirm, setConfirm] = useState<ConfirmPending>(null);
  const [confirming, setConfirming] = useState(false);

  const [annModal, setAnnModal] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [assModal, setAssModal] = useState(false);

  function triggerConfirm(opts: { title: string; message: string; confirmLabel?: string; fn: () => Promise<void> }) {
    setConfirm(opts);
  }

  async function runConfirm() {
    if (!confirm) return;
    setConfirming(true);
    try {
      await confirm.fn();
      setConfirm(null);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setConfirming(false);
    }
  }

  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  const [noteTitle, setNoteTitle] = useState("");
  const [noteDesc, setNoteDesc] = useState("");
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [isUploadingNote, setIsUploadingNote] = useState(false);
  const noteFileRef = useRef<HTMLInputElement>(null);

  const [assTitle, setAssTitle] = useState("");
  const [assDesc, setAssDesc] = useState("");
  const [assMaxScore, setAssMaxScore] = useState("");
  const [assStartAt, setAssStartAt] = useState("");
  const [assEndAt, setAssEndAt] = useState("");
  const [assFile, setAssFile] = useState<File | null>(null);
  const [isCreatingAss, setIsCreatingAss] = useState(false);
  const assFileRef = useRef<HTMLInputElement>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assignmentSubs, setAssignmentSubs] = useState<Record<string, any[]>>({});
  const [loadingSubsFor, setLoadingSubsFor] = useState<string | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeInputs, setGradeInputs] = useState<Record<string, { grade: string; feedback: string }>>({});

  const [exportData, setExportData] = useState<ClassExportData | null>(null);
  const [loadingExport, setLoadingExport] = useState(false);

  const ensureExportData = useCallback(async (): Promise<ClassExportData | null> => {
    if (exportData) return exportData;
    setLoadingExport(true);
    try {
      const d = await getClassExportData({ data: { classId: c.id } });
      setExportData(d as ClassExportData);
      return d as ClassExportData;
    } catch (e: any) {
      toast.error(e.message || "Failed to load export data");
      return null;
    } finally {
      setLoadingExport(false);
    }
  }, [exportData, c.id]);

  async function exportRosterCSV() {
    const d = await ensureExportData(); if (!d) return;
    const headers = ["Student", ...d.exams.map((e) => e.title), "Average"];
    const rows = d.students.map((st) => {
      let totalPct = 0, count = 0;
      const cols = d.exams.map((ex) => {
        const s = d.submissions.find((s) => s.studentId === st.id && s.examId === ex.id);
        if (!s || s.score == null || !s.total) return s ? s.status : "—";
        const p = Math.round((s.score / s.total) * 100);
        totalPct += p; count++;
        return `${s.score}/${s.total} (${p}%)`;
      });
      return [st.name, ...cols, count > 0 ? `${Math.round(totalPct / count)}%` : "—"];
    });
    downloadCSV(`${c.code}-class-roster`, buildCSV(headers, rows));
  }
  async function exportRosterPDF() {
    const d = await ensureExportData(); if (!d) return;
    const headers = ["Student", ...d.exams.map((e) => e.title), "Average"];
    const rows = d.students.map((st) => {
      let totalPct = 0, count = 0;
      const cols = d.exams.map((ex) => {
        const s = d.submissions.find((s) => s.studentId === st.id && s.examId === ex.id);
        if (!s || s.score == null || !s.total) return s ? s.status : "—";
        const p = Math.round((s.score / s.total) * 100);
        totalPct += p; count++;
        return `${s.score}/${s.total} (${p}%)`;
      });
      return [st.name, ...cols, count > 0 ? `${Math.round(totalPct / count)}%` : "—"];
    });
    printTable(`${c.name} — Class Roster`, `${c.code} · ${d.students.length} students`, headers, rows);
  }
  async function exportStudentCSV(student: ExportStudent) {
    const d = await ensureExportData(); if (!d) return;
    const headers = ["Exam", "Date", "Score", "Total", "%", "Status", "Flags"];
    const rows = d.exams.map((ex) => {
      const s = d.submissions.find((s) => s.studentId === student.id && s.examId === ex.id);
      if (!s) return [ex.title, fmtEx(ex.startAt), "—", "—", "—", "Not submitted", "—"];
      return [ex.title, fmtEx(ex.startAt), s.score ?? 0, s.total, pctEx(s.score, s.total), s.status, s.flags];
    });
    downloadCSV(`${c.code}-${student.name}-report`, buildCSV(headers, rows));
  }
  async function exportStudentPDF(student: ExportStudent) {
    const d = await ensureExportData(); if (!d) return;
    const headers = ["Exam", "Date", "Score", "Total", "%", "Status", "Flags"];
    const rows = d.exams.map((ex) => {
      const s = d.submissions.find((s) => s.studentId === student.id && s.examId === ex.id);
      if (!s) return [ex.title, fmtEx(ex.startAt), "—", "—", "—", "Not submitted", "—"];
      return [ex.title, fmtEx(ex.startAt), s.score ?? 0, s.total, pctEx(s.score, s.total), s.status, s.flags];
    });
    printTable(`${student.name} — Exam Report`, `${c.name} · ${c.code}`, headers, rows);
  }
  function exportStudentListCSV() {
    const headers = ["Name", "Status", "Enrolled"];
    const rows = members.map((m: any) => [m.name, m.status, fmtEx(m.enrolledAt)]);
    downloadCSV(`${c.code}-students`, buildCSV(headers, rows));
  }
  function exportStudentListPDF() {
    const headers = ["Name", "Status", "Enrolled"];
    const rows = members.map((m: any) => [m.name, m.status, fmtEx(m.enrolledAt)]);
    printTable(`${c.name} — Student List`, `${c.code} · ${members.length} students`, headers, rows);
  }

  async function exportAllExamsCSV() {
    const d = await ensureExportData(); if (!d) return;
    const headers = ["Exam", "Date", "Student", "Score", "Total", "%", "Status", "Flags", "Submitted"];
    const rows: (string | number | null)[][] = [];
    for (const ex of d.exams) for (const st of d.students) {
      const s = d.submissions.find((s) => s.examId === ex.id && s.studentId === st.id);
      rows.push(s
        ? [ex.title, fmtEx(ex.startAt), st.name, s.score ?? 0, s.total, pctEx(s.score, s.total), s.status, s.flags, fmtEx(s.submittedAt)]
        : [ex.title, fmtEx(ex.startAt), st.name, "—", "—", "—", "Not submitted", "—", "—"]);
    }
    downloadCSV(`${c.code}-all-exams`, buildCSV(headers, rows));
  }
  async function exportAllExamsPDF() {
    const d = await ensureExportData(); if (!d) return;
    const headers = ["Exam", "Date", "Student", "Score", "Total", "%", "Status", "Flags", "Submitted"];
    const rows: (string | number | null)[][] = [];
    for (const ex of d.exams) for (const st of d.students) {
      const s = d.submissions.find((s) => s.examId === ex.id && s.studentId === st.id);
      rows.push(s
        ? [ex.title, fmtEx(ex.startAt), st.name, s.score ?? 0, s.total, pctEx(s.score, s.total), s.status, s.flags, fmtEx(s.submittedAt)]
        : [ex.title, fmtEx(ex.startAt), st.name, "—", "—", "—", "Not submitted", "—", "—"]);
    }
    printTable(`${c.name} — All Exams`, `${c.code} · ${d.exams.length} exams · ${d.students.length} students`, headers, rows);
  }
  function buildFullReportTable(d: ClassExportData, report: Awaited<ReturnType<typeof getGradeReport>> | null) {
    const headers = [
      "Student",
      ...d.exams.flatMap((ex) => [ex.title, `${ex.title} %`]),
      ...d.assignments.flatMap((a) => [a.title, `${a.title} %`]),
      "Weighted %", "Grade",
    ];
    const rows = d.students.map((st) => {
      const examCols = d.exams.flatMap((ex) => {
        const s = d.submissions.find((s) => s.examId === ex.id && s.studentId === st.id);
        return s ? [s.score ?? 0, pctEx(s.score, s.total)] : ["—", "—"];
      });
      const assignCols = d.assignments.flatMap((a) => {
        const sub = d.assignmentSubs.find((s) => s.assignmentId === a.id && s.studentId === st.id);
        if (!sub || sub.grade == null) return ["—", "—"];
        const pct = a.maxScore > 0 ? `${Math.round((sub.grade / a.maxScore) * 100)}%` : "—";
        return [sub.grade, pct];
      });
      const sg = report?.studentGrades.find((g) => g.studentId === st.id);
      return [st.name, ...examCols, ...assignCols, sg ? `${sg.pct}%` : "—", sg?.grade ?? "—"];
    });
    return { headers, rows };
  }
  async function exportFullReportCSV() {
    const d = await ensureExportData(); if (!d) return;
    let report: Awaited<ReturnType<typeof getGradeReport>> | null = null;
    try { report = await getGradeReport({ data: c.id }); } catch {}
    const { headers, rows } = buildFullReportTable(d, report);
    downloadCSV(`${c.code}-full-report`, buildCSV(headers, rows));
  }
  async function exportFullReportPDF() {
    const d = await ensureExportData(); if (!d) return;
    let report: Awaited<ReturnType<typeof getGradeReport>> | null = null;
    try { report = await getGradeReport({ data: c.id }); } catch {}
    const { headers, rows } = buildFullReportTable(d, report);
    printTable(`${c.name} — Full Report`, `${c.code} · All exams & submissions`, headers, rows);
  }

  async function handlePostAnnouncement() {
    if (!annTitle.trim() || !annBody.trim()) return;
    setIsPosting(true);
    try {
      await postAnnouncement({ data: { classId: c.id, title: annTitle, body: annBody } });
      toast.success("Announcement posted!");
      setAnn((prev) => [
        { id: crypto.randomUUID(), title: annTitle, body: annBody, author: "You", date: fmtMY(new Date(), { dateStyle: "short" }) },
        ...prev,
      ]);
      setAnnTitle(""); setAnnBody("");
      setAnnModal(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to post");
    } finally {
      setIsPosting(false);
    }
  }

  function handleDeleteAnnouncement(id: string) {
    triggerConfirm({
      title: "Delete announcement?",
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      fn: async () => {
        await deleteAnnouncement({ data: id });
        setAnn((prev) => prev.filter((a) => a.id !== id));
        toast.success("Announcement deleted");
      },
    });
  }

  async function handleAddNote() {
    if (!noteTitle.trim() || !noteFile) return;
    setIsUploadingNote(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const path = `notes/${c.id}/${Date.now()}-${noteFile.name}`;
      const { error: uploadError } = await supabase.storage.from("class-materials").upload(path, noteFile, { upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { data: { publicUrl } } = supabase.storage.from("class-materials").getPublicUrl(path);
      const fileType = detectType(noteFile.name);
      const note = await addNote({ data: { classId: c.id, title: noteTitle, description: noteDesc, fileType, fileName: noteFile.name, fileUrl: publicUrl } });
      toast.success("Note uploaded!");
      setNotes((prev) => [note, ...prev]);
      setNoteTitle(""); setNoteDesc(""); setNoteFile(null);
      if (noteFileRef.current) noteFileRef.current.value = "";
      setNoteModal(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to upload note");
    } finally {
      setIsUploadingNote(false);
    }
  }

  function handleDeleteNote(id: string) {
    triggerConfirm({
      title: "Delete note?",
      message: "The file and all metadata will be removed.",
      confirmLabel: "Delete",
      fn: async () => {
        await deleteNote({ data: id });
        setNotes((prev) => prev.filter((n) => n.id !== id));
        toast.success("Note deleted");
      },
    });
  }

  function handleRemoveStudent(studentId: string, name: string) {
    triggerConfirm({
      title: `Remove ${name}?`,
      message: "They will be unenrolled from this class.",
      confirmLabel: "Remove",
      fn: async () => {
        await removeStudent({ data: { classId: c.id, studentId } });
        setMembers((prev) => prev.filter((m) => m.studentId !== studentId));
        toast.success(`${name} removed from class`);
      },
    });
  }

  async function handleCreateAssignment() {
    const parsedMax = parseFloat(assMaxScore);
    if (!assTitle.trim() || !assStartAt || !assEndAt || !assMaxScore.trim() || isNaN(parsedMax) || parsedMax <= 0 || parsedMax > 100) return;
    const startDate = new Date(myLocalInputToISO(assStartAt));
    if (startDate < new Date(Date.now() - 60_000)) {
      toast.error("Start date cannot be in the past");
      return;
    }
    setIsCreatingAss(true);
    try {
      let fileUrl: string | undefined;
      let fileName: string | undefined;
      let fileType: "pdf" | "image" | "file" | undefined;
      if (assFile) {
        const supabase = createBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const path = `${c.id}/${Date.now()}-${assFile.name}`;
        const { error: uploadError } = await supabase.storage.from("class-materials").upload(path, assFile, { upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        const { data: { publicUrl } } = supabase.storage.from("class-materials").getPublicUrl(path);
        fileUrl = publicUrl; fileName = assFile.name; fileType = detectType(assFile.name);
      }
      const assignment = await createAssignment({
        data: {
          classId: c.id, title: assTitle, description: assDesc || undefined,
          fileUrl, fileName, fileType,
          maxScore: parsedMax,
          startAt: myLocalInputToISO(assStartAt), endAt: myLocalInputToISO(assEndAt),
        },
      });
      toast.success("Assignment created!");
      setAssignments((prev) => [...prev, assignment]);
      setAssTitle(""); setAssDesc(""); setAssMaxScore(""); setAssStartAt(""); setAssEndAt(""); setAssFile(null);
      if (assFileRef.current) assFileRef.current.value = "";
      setAssModal(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to create assignment");
    } finally {
      setIsCreatingAss(false);
    }
  }

  function handleDeleteAssignment(id: string) {
    triggerConfirm({
      title: "Delete assignment?",
      message: "All student submissions for this assignment will also be deleted.",
      confirmLabel: "Delete",
      fn: async () => {
        await deleteAssignment({ data: id });
        setAssignments((prev) => prev.filter((a) => a.id !== id));
        if (expandedId === id) setExpandedId(null);
        toast.success("Assignment deleted");
      },
    });
  }

  async function handleToggleSubmissions(assignmentId: string) {
    if (expandedId === assignmentId) { setExpandedId(null); return; }
    setExpandedId(assignmentId);
    if (assignmentSubs[assignmentId]) return;
    setLoadingSubsFor(assignmentId);
    try {
      const subs = await getAssignmentSubmissions({ data: assignmentId });
      setAssignmentSubs((prev) => ({ ...prev, [assignmentId]: subs }));
    } catch (e: any) {
      toast.error(e.message || "Failed to load submissions");
    } finally {
      setLoadingSubsFor(null);
    }
  }

  async function handleMarkReviewed(submissionId: string, assignmentId: string) {
    const inputs = gradeInputs[submissionId] ?? { grade: "", feedback: "" };
    const grade = inputs.grade.trim() !== "" ? parseFloat(inputs.grade) : null;
    if (inputs.grade.trim() !== "" && (isNaN(grade!) || grade! < 0)) { toast.error("Invalid grade value"); return; }
    setGradingId(submissionId);
    try {
      await reviewAssignmentSubmission({ data: { submissionId, grade, feedback: inputs.feedback || null } });
      setAssignmentSubs((prev) => ({
        ...prev,
        [assignmentId]: (prev[assignmentId] ?? []).map((s) =>
          s.id === submissionId ? { ...s, status: "reviewed", grade, feedback: inputs.feedback || null } : s
        ),
      }));
      toast.success(grade != null ? `Graded — ${grade} pts` : "Marked as reviewed");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setGradingId(null);
    }
  }

  // Grade config state — pre-loaded from route loader
  const [gradeItems, setGradeItems] = useState<GradeConfigItem[]>(initialGradeConfig?.items ?? []);
  const [savedGradeItems, setSavedGradeItems] = useState<GradeConfigItem[]>(initialGradeConfig?.items ?? []);
  const [gradeConfigLoaded, setGradeConfigLoaded] = useState(true);
  const [gradeReport, setGradeReport] = useState<Awaited<ReturnType<typeof getGradeReport>> | null>(initialGradeReport ?? null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  async function handleLoadGradeTab() {
    // grade config and report are pre-loaded in the route loader
  }

  function toggleItem(type: "exam" | "assignment", id: string) {
    setGradeItems((prev) => {
      const exists = prev.find((i) => i.type === type && i.id === id);
      if (exists) return prev.filter((i) => !(i.type === type && i.id === id));
      return [...prev, { type, id, weight: 0 }];
    });
    setGradeReport(null);
  }

  function setItemWeight(type: "exam" | "assignment", id: string, weight: number) {
    setGradeItems((prev) => prev.map((i) => i.type === type && i.id === id ? { ...i, weight } : i));
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      await saveGradeConfig({ data: { classId: c.id, items: gradeItems } });
      setSavedGradeItems([...gradeItems]);
      toast.success("Grade config saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleLoadReport() {
    setLoadingReport(true);
    try {
      const report = await getGradeReport({ data: c.id });
      setGradeReport(report);
    } catch (e: any) {
      toast.error(e.message || "Failed to load report");
    } finally {
      setLoadingReport(false);
    }
  }

  function handleExportGradeCSV() {
    if (!gradeReport) return;
    const header = ["Student", ...gradeReport.items.map((i) => `${i.label} (w=${i.weight})`), "Total %", "Grade"];
    const rows = gradeReport.studentGrades.map((sg) => [
      sg.studentName,
      ...sg.breakdown.map((b) => `${b.contribution}/${b.weight} (${b.score}/${b.maxScore} raw)`),
      `${sg.pct}%`,
      sg.grade,
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${c.name}-grades.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "announcements", label: "Announcements" },
    { key: "notes", label: "Notes" },
    { key: "members", label: `Members (${members.length})` },
    { key: "assignments", label: `Assignments (${assignments.length})` },
    { key: "exams", label: `Exams (${exams.length})` },
    { key: "grades", label: "Grades" },
  ];

  return (
    <>
      <PageHeader badge={c.code} badgeColor={`bg-${c.color}`} title={c.name} subtitle={`${c.students} students enrolled`} />

      <div className="flex justify-end mb-3">
        <ExportMenu label={loadingExport ? "Loading…" : "Full report"} onCSV={exportFullReportCSV} onPDF={exportFullReportPDF} />
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); localStorage.setItem("lecturer-class-tab", t.key); if (t.key === "grades") handleLoadGradeTab(); }}
            className={`px-4 py-2 rounded-full border-2 border-ink text-sm font-semibold transition-all ${
              tab === t.key ? "bg-violet text-white shadow-brut-sm" : "bg-card hover:bg-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "announcements" && (
        <>
          <Section title="Announcements" action={
            <WakeoutButton size="sm" onClick={() => setAnnModal(true)}>+ New announcement</WakeoutButton>
          }>
            <div className="space-y-3">
              {ann.map((a: any) => (
                <Card key={a.id}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-display font-bold">{a.title}</div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono text-muted-foreground">{a.date}</span>
                      <button onClick={() => handleDeleteAnnouncement(a.id)} className="text-muted-foreground hover:text-pink"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
                  <div className="mt-3 text-xs font-mono text-muted-foreground">— {a.author}</div>
                </Card>
              ))}
              {ann.length === 0 && <Empty title="No announcements yet" />}
            </div>
          </Section>
        </>
      )}


      {tab === "notes" && (
        <>
          <Section title="Notes" action={
            <WakeoutButton size="sm" onClick={() => setNoteModal(true)}>+ New note</WakeoutButton>
          }>
            {notes.length === 0 ? <Empty title="No notes posted yet" /> : (
              <div className="space-y-3">
                {notes.map((n: any) => {
                  const Icon = FILE_ICON[n.file_type as keyof typeof FILE_ICON] || File;
                  return (
                    <Card key={n.id} className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-2xl border-2 border-ink bg-secondary flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-bold">{n.title}</div>
                        {n.description && <p className="text-sm text-muted-foreground mt-0.5">{n.description}</p>}
                        <div className="text-xs font-mono text-muted-foreground mt-1">{n.file_name} · {fmtMY(n.created_at, { dateStyle: "short" })}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {n.file_url && (
                          <a href={n.file_url} target="_blank" rel="noopener noreferrer">
                            <WakeoutButton size="sm" variant="secondary" asChild>
                              <span className="flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Download</span>
                            </WakeoutButton>
                          </a>
                        )}
                        <button onClick={() => handleDeleteNote(n.id)} className="text-muted-foreground hover:text-pink shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      )}

      {tab === "members" && (
        <Section title="Enrolled students" action={
          <ExportMenu label="Student list" onCSV={exportStudentListCSV} onPDF={exportStudentListPDF} />
        }>
          {members.length === 0 ? (
            <Empty title="No students enrolled yet" hint="Students join using the class code." />
          ) : (
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-mono uppercase tracking-widest text-muted-foreground border-b-2 border-ink">
                    <th className="py-3">Name</th><th>Status</th><th>Enrolled</th><th></th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-ink/10">
                  {members.map((m) => (
                    <tr key={m.studentId}>
                      <td className="py-3 font-semibold"><div className="flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /> {m.name}</div></td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full border-2 border-ink text-xs font-mono uppercase ${m.status === "active" ? "bg-lime" : m.status === "banned" ? "bg-pink" : "bg-amber"}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="text-xs font-mono text-muted-foreground">{fmtMY(m.enrolledAt, { dateStyle: "short" })}</td>
                      <td className="text-right">
                        <button onClick={() => handleRemoveStudent(m.studentId, m.name)} className="text-muted-foreground hover:text-pink text-xs font-mono">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </Section>
      )}

      {tab === "assignments" && (
        <>
          <Section title="Assignments" action={
            <WakeoutButton size="sm" onClick={() => setAssModal(true)}>+ New assignment</WakeoutButton>
          }>
            {assignments.length === 0 ? <Empty title="No assignments yet" /> : (
              <div className="space-y-3">
                {assignments.map((a: any) => {
                  const isExpanded = expandedId === a.id;
                  const subs = assignmentSubs[a.id];
                  const now = new Date();
                  const isOpen = now >= new Date(a.start_at) && now <= new Date(a.end_at);
                  const isUpcoming = now < new Date(a.start_at);
                  return (
                    <Card key={a.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-display font-bold text-lg">{a.title}</div>
                            <span className={`px-2 py-0.5 rounded-full border-2 border-ink text-xs font-mono uppercase ${isOpen ? "bg-lime" : isUpcoming ? "bg-sky" : "bg-secondary"}`}>
                              {isOpen ? "open" : isUpcoming ? "upcoming" : "closed"}
                            </span>
                          </div>
                          {a.description && <p className="text-sm text-muted-foreground mt-1">{a.description}</p>}
                          <div className="text-xs font-mono text-muted-foreground mt-2 flex items-center gap-3 flex-wrap">
                            <span>{fmtDate(a.start_at)} → {fmtDate(a.end_at)}</span>
                            <span className="px-2 py-0.5 rounded-full border-2 border-ink bg-amber text-xs font-mono font-semibold">{a.max_score} pts</span>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteAssignment(a.id)} className="text-muted-foreground hover:text-pink shrink-0"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      {a.file_url && (
                        <div className="mt-3">
                          <a href={a.file_url} target="_blank" rel="noopener noreferrer">
                            <WakeoutButton size="sm" variant="secondary" asChild>
                              <span className="flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> {a.file_name ?? "Download attachment"}</span>
                            </WakeoutButton>
                          </a>
                        </div>
                      )}
                      <div className="mt-4 border-t-2 border-ink/10 pt-3">
                        <button onClick={() => handleToggleSubmissions(a.id)} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {loadingSubsFor === a.id ? "Loading…" : `Submissions${subs ? ` (${subs.length})` : ""}`}
                        </button>
                        {isExpanded && subs && (
                          <div className="mt-3 space-y-2">
                            {subs.length === 0 ? <p className="text-sm text-muted-foreground">No submissions yet.</p> : (
                              subs.map((s: any) => {
                                const Icon = FILE_ICON[s.file_type as keyof typeof FILE_ICON] || File;
                                return (
                                  <div key={s.id} className="py-3 border-b border-ink/10 last:border-0 space-y-2">
                                    <div className="flex items-center gap-3">
                                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm">{s.studentName}</div>
                                        <div className="text-xs font-mono text-muted-foreground">{s.file_name} · {fmtMY(s.created_at, { dateStyle: "short" })}</div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {s.file_url && (
                                          <a href={s.file_url} target="_blank" rel="noopener noreferrer">
                                            <WakeoutButton size="sm" variant="secondary" asChild><span><Download className="w-3.5 h-3.5" /></span></WakeoutButton>
                                          </a>
                                        )}
                                        <span className={`px-2 py-0.5 rounded-full border-2 border-ink text-xs font-mono uppercase ${s.status === "reviewed" ? "bg-lime" : "bg-amber"}`}>
                                          {s.status === "reviewed" && s.grade != null ? `${s.grade} pts` : s.status}
                                        </span>
                                      </div>
                                    </div>
                                    {s.status === "reviewed" ? (
                                      s.feedback && <div className="pl-7 text-xs text-muted-foreground italic border-l-2 border-ink/20 ml-2">{s.feedback}</div>
                                    ) : isOpen ? (
                                      <div className="pl-7 text-xs font-mono text-muted-foreground">Grading opens after {fmtDate(a.end_at)}</div>
                                    ) : (
                                      <div className="pl-7 space-y-2">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="number" min={0} max={a.max_score} step={0.5}
                                            placeholder={`0 – ${a.max_score}`}
                                            value={gradeInputs[s.id]?.grade ?? ""}
                                            onChange={(e) => setGradeInputs((prev) => ({ ...prev, [s.id]: { ...prev[s.id] ?? { grade: "", feedback: "" }, grade: e.target.value } }))}
                                            className="w-32 border-2 border-ink rounded-xl px-3 py-1.5 bg-background text-sm font-mono focus:outline-none"
                                          />
                                          <span className="text-xs font-mono text-muted-foreground">/ {a.max_score} pts</span>
                                          <button
                                            onClick={() => handleMarkReviewed(s.id, a.id)}
                                            disabled={gradingId === s.id}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-ink bg-lime text-xs font-semibold disabled:opacity-50"
                                          >
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            {gradingId === s.id ? "Saving…" : "Grade"}
                                          </button>
                                        </div>
                                        <textarea
                                          rows={2} placeholder="Feedback (optional)"
                                          value={gradeInputs[s.id]?.feedback ?? ""}
                                          onChange={(e) => setGradeInputs((prev) => ({ ...prev, [s.id]: { ...prev[s.id] ?? { grade: "", feedback: "" }, feedback: e.target.value } }))}
                                          className="w-full border-2 border-ink/30 rounded-xl px-3 py-1.5 bg-background text-sm resize-none focus:outline-none"
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      )}

      {tab === "exams" && (
        <Section
          title="Exams"
          action={
            <WakeoutButton asChild size="sm">
              <Link to="/lecturer/exams/new">+ New exam</Link>
            </WakeoutButton>
          }
        >
          {exams.length === 0 ? (
            <Empty title="No exams for this class yet" hint="Create an exam and assign it to this class." />
          ) : (
            <div className="space-y-3">
              {exams.map((exam: any) => (
                <Card key={exam.id}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-bold text-lg">{exam.title}</span>
                        <span className={`px-2 py-0.5 rounded-full border-2 border-ink text-xs font-mono uppercase ${EXAM_STATUS_STYLE[exam.status] ?? "bg-secondary"}`}>
                          {exam.status}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                        {exam.start_time && <span>{fmtEx(exam.start_time)} → {fmtEx(exam.end_time)}</span>}
                        <span>{exam.duration} min · {exam.questions_count ?? 0} questions</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {exam.status === "draft" && (
                        <WakeoutButton asChild size="sm" variant="secondary">
                          <Link to="/lecturer/exams/$examId/edit" params={{ examId: exam.id }}>Edit</Link>
                        </WakeoutButton>
                      )}
                      {exam.status === "upcoming" && (
                        <>
                          <WakeoutButton asChild size="sm" variant="secondary">
                            <Link to="/lecturer/exams/$examId/edit" params={{ examId: exam.id }}>Edit</Link>
                          </WakeoutButton>
                          <WakeoutButton
                            size="sm"
                            variant="secondary"
                            onClick={() => triggerConfirm({
                              title: "Unpublish exam?",
                              message: `"${exam.title}" will revert to draft. Students will no longer see it.`,
                              confirmLabel: "Unpublish",
                              fn: async () => {
                                await unpublishExam({ data: exam.id });
                                setExams((prev) => prev.map((e: any) => e.id === exam.id ? { ...e, status: "draft" } : e));
                                toast.success("Exam unpublished");
                              },
                            })}
                          >
                            Unpublish
                          </WakeoutButton>
                        </>
                      )}
                      {exam.status === "live" && (
                        <WakeoutButton asChild size="sm">
                          <Link to="/lecturer/exams/$examId/monitor" params={{ examId: exam.id }}>Monitor →</Link>
                        </WakeoutButton>
                      )}
                      {(exam.status === "closed" || exam.status === "graded") && (
                        <WakeoutButton asChild size="sm" variant="secondary">
                          <Link to="/lecturer/exams/$examId/results" params={{ examId: exam.id }}>Results →</Link>
                        </WakeoutButton>
                      )}
                      {/* Delete is allowed at any status. For exams with student
                          data (live/closed/graded) the dialog warns that scores
                          will be destroyed. */}
                      <WakeoutButton
                        size="sm"
                        variant="destructive"
                        onClick={() => triggerConfirm({
                          title: "Delete exam?",
                          message: ["live", "closed", "graded"].includes(exam.status)
                            ? `"${exam.title}" already has student submissions. Deleting it permanently destroys all student answers, scores, and integrity flags. This cannot be undone.`
                            : `"${exam.title}" will be permanently deleted. This cannot be undone.`,
                          confirmLabel: "Delete",
                          fn: async () => {
                            await deleteExam({ data: exam.id });
                            setExams((prev) => prev.filter((e: any) => e.id !== exam.id));
                            toast.success("Exam deleted");
                          },
                        })}
                      >
                        Delete
                      </WakeoutButton>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Section>
      )}

      {tab === "grades" && (
        <>
          <Section title="Grade configuration">
            {/* Currently saved config summary */}
            <div className="mb-5 rounded-2xl border-2 border-ink/20 bg-secondary/40 px-4 py-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Currently saved</div>
              {savedGradeItems.length === 0 ? (
                <p className="text-sm text-muted-foreground font-mono">Not configured yet</p>
              ) : (
                <div className="flex flex-wrap gap-2 items-center">
                  {savedGradeItems.map((item) => {
                    const exam = item.type === "exam" ? (exams as any[]).find((e) => e.id === item.id) : null;
                    const assign = item.type === "assignment" ? (assignments as any[]).find((a) => a.id === item.id) : null;
                    const label = exam?.title ?? assign?.title ?? item.id;
                    const savedTotal = savedGradeItems.reduce((s, i) => s + i.weight, 0);
                    const contribution = savedTotal > 0 ? Math.round((item.weight / savedTotal) * 100) : 0;
                    return (
                      <span key={`saved-${item.type}-${item.id}`}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-ink/30 text-xs font-mono ${item.type === "exam" ? "bg-violet/10" : "bg-sky/10"}`}>
                        <span className="font-bold">{label}</span>
                        <span className="text-muted-foreground">{item.weight}pts · {contribution}%</span>
                      </span>
                    );
                  })}
                  <span className="text-xs font-mono text-muted-foreground ml-1">
                    Total: <strong>{savedGradeItems.reduce((s, i) => s + i.weight, 0)}</strong>
                  </span>
                </div>
              )}
            </div>

            {exams.length === 0 && assignments.length === 0 ? (
              <Empty title="No exams or assignments yet" hint="Create some exams and assignments first, then configure grade weights here." />
            ) : (() => {
              const totalGradeWeight = gradeItems.reduce((s, i) => s + i.weight, 0);
              const weightOver = totalGradeWeight > 100;
              const excludedExams = exams.filter((e: any) => !gradeItems.find((i) => i.type === "exam" && i.id === e.id));
              const excludedAssignments = assignments.filter((a: any) => !gradeItems.find((i) => i.type === "assignment" && i.id === a.id));

              return (
                <>
                  {/* Included items — card grid */}
                  {gradeItems.length > 0 ? (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                      {gradeItems.map((item) => {
                        const exam = item.type === "exam" ? (exams as any[]).find((e) => e.id === item.id) : null;
                        const assign = item.type === "assignment" ? (assignments as any[]).find((a) => a.id === item.id) : null;
                        const label = exam?.title ?? assign?.title ?? item.id;
                        const contribution = totalGradeWeight > 0 ? Math.round((item.weight / totalGradeWeight) * 100) : 0;
                        return (
                          <div key={`${item.type}-${item.id}`} className={`rounded-2xl border-2 border-ink p-4 space-y-3 ${item.type === "exam" ? "bg-violet/5" : "bg-sky/5"}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                                  {item.type === "exam" ? "Exam" : "Assignment"}
                                  {exam && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full border border-ink/40 text-[9px] ${EXAM_STATUS_STYLE[exam.status] ?? "bg-secondary"}`}>{exam.status}</span>}
                                </div>
                                <div className="font-display font-bold text-sm leading-tight mt-0.5 truncate">{label}</div>
                              </div>
                              <button
                                onClick={() => toggleItem(item.type, item.id)}
                                className="w-6 h-6 shrink-0 rounded-full border-2 border-ink flex items-center justify-center text-xs hover:bg-pink hover:text-white transition-colors"
                                title="Remove"
                              >✕</button>
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="range" min={0} max={100} step={1}
                                  value={item.weight}
                                  onChange={(e) => setItemWeight(item.type, item.id, parseFloat(e.target.value))}
                                  className="flex-1 accent-violet h-2 cursor-pointer"
                                />
                                <input
                                  type="number" min={0} max={100} step={1}
                                  value={item.weight || ""}
                                  onChange={(e) => setItemWeight(item.type, item.id, parseFloat(e.target.value) || 0)}
                                  className="w-14 border-2 border-ink rounded-xl px-2 py-1 text-sm font-mono bg-background focus:outline-none text-center"
                                />
                              </div>
                              <div className="text-xs font-mono text-muted-foreground">
                                Contributes <span className="font-bold text-foreground">{contribution}%</span> of grade
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mb-4">No items included yet. Add from the list below.</p>
                  )}

                  {/* Not included — pill buttons */}
                  {(excludedExams.length > 0 || excludedAssignments.length > 0) && (
                    <div className="mb-6">
                      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Not included</div>
                      <div className="flex flex-wrap gap-2">
                        {(excludedExams as any[]).map((exam) => (
                          <button key={exam.id} onClick={() => toggleItem("exam", exam.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-ink/30 bg-card text-sm font-mono hover:border-violet hover:bg-violet/5 transition-colors">
                            <span className="text-violet font-bold">+</span>
                            {exam.title}
                            <span className={`px-1.5 py-0.5 rounded-full border border-ink/30 text-[9px] uppercase ${EXAM_STATUS_STYLE[exam.status] ?? "bg-secondary"}`}>{exam.status}</span>
                          </button>
                        ))}
                        {(excludedAssignments as any[]).map((a) => (
                          <button key={a.id} onClick={() => toggleItem("assignment", a.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-ink/30 bg-card text-sm font-mono hover:border-sky hover:bg-sky/5 transition-colors">
                            <span className="text-sky font-bold">+</span>
                            {a.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Total weight bar + save */}
                  {gradeItems.length > 0 && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between mb-1 text-xs font-mono">
                          <span className="text-muted-foreground">Total weight</span>
                          <span className={weightOver ? "text-pink font-bold" : totalGradeWeight === 100 ? "text-green-600 font-bold" : "text-foreground"}>
                            {totalGradeWeight} / 100{totalGradeWeight === 100 ? " ✓" : ""}
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-secondary border border-ink/10 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${weightOver ? "bg-pink" : totalGradeWeight === 100 ? "bg-lime" : "bg-violet"}`}
                            style={{ width: `${Math.min(totalGradeWeight, 100)}%` }} />
                        </div>
                        {weightOver && <p className="mt-1 text-xs font-mono text-pink">Over by {totalGradeWeight - 100} — reduce weights before saving</p>}
                      </div>
                      <div className="flex gap-3">
                        <WakeoutButton onClick={handleSaveConfig} disabled={savingConfig || weightOver}>
                          {savingConfig ? "Saving…" : "Save config"}
                        </WakeoutButton>
                        <WakeoutButton variant="secondary" onClick={handleLoadReport} disabled={loadingReport || weightOver}>
                          {loadingReport ? "Loading…" : "Refresh report"}
                        </WakeoutButton>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </Section>

          {/* Grade report table */}
          {loadingReport && (
            <div className="text-center py-10 text-muted-foreground text-sm">Loading grade report…</div>
          )}
          {gradeReport && !loadingReport && (() => {
            const totalW = gradeItems.reduce((s, i) => s + i.weight, 0);
            return (
              <Section title="Grade report" action={
                <WakeoutButton size="sm" variant="secondary" onClick={handleExportGradeCSV}>↓ Export CSV</WakeoutButton>
              }>
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-mono uppercase tracking-widest text-muted-foreground border-b-2 border-ink">
                          <th className="py-3 pr-4">Student</th>
                          {gradeReport.items.map((item) => {
                            const gi = gradeItems.find((i) => i.id === item.id);
                            return (
                              <th key={`${item.type}-${item.id}`} className="py-3 pr-4 whitespace-nowrap">
                                <div>{item.label}</div>
                                <div className="flex items-center gap-1 mt-1">
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={gi?.weight ?? item.weight}
                                    onChange={(e) => setItemWeight(item.type as "exam" | "assignment", item.id, parseFloat(e.target.value) || 0)}
                                    className="w-14 border-2 border-ink rounded-lg px-2 py-0.5 text-xs font-mono bg-background normal-case focus:outline-none focus:ring-1 focus:ring-violet"
                                  />
                                  <span className="text-[10px] normal-case">pts</span>
                                </div>
                              </th>
                            );
                          })}
                          <th className="py-3 pr-4">Total %</th>
                          <th className="py-3">Grade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y-2 divide-ink/10">
                        {gradeReport.studentGrades.map((sg) => {
                          let rawScore = 0;
                          const breakdown = sg.breakdown.map((b, idx) => {
                            const itemId = gradeReport.items[idx]?.id;
                            const gi = gradeItems.find((i) => i.id === itemId);
                            const w = gi?.weight ?? b.weight;
                            const contribution = b.maxScore > 0 ? (b.score / b.maxScore) * w : 0;
                            rawScore += contribution;
                            return { ...b, weight: w, contribution: Math.round(contribution * 10) / 10 };
                          });
                          const pct = totalW > 0 ? Math.round((rawScore / totalW) * 1000) / 10 : 0;
                          const grade = letterGrade(pct);
                          return (
                            <tr key={sg.studentId}>
                              <td className="py-3 pr-4 font-semibold">{sg.studentName}</td>
                              {breakdown.map((b, idx) => (
                                <td key={idx} className="py-3 pr-4 font-mono text-xs">
                                  <span className="font-semibold text-sm">{b.contribution} / {b.weight}</span>
                                  <br />
                                  <span className="text-muted-foreground">({b.score}/{b.maxScore} raw)</span>
                                </td>
                              ))}
                              <td className="py-3 pr-4 font-mono font-semibold">{pct}%</td>
                              <td className="py-3">
                                <span className={`px-2.5 py-1 rounded-full border-2 border-ink text-xs font-mono font-bold ${
                                  grade === "A" ? "bg-lime" : grade === "B" ? "bg-sky" : grade === "C" ? "bg-amber" : grade === "D" ? "bg-violet text-violet-foreground" : "bg-pink text-white"
                                }`}>
                                  {grade}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {gradeReport.studentGrades.length === 0 && (
                          <tr><td colSpan={gradeReport.items.length + 3} className="py-6 text-center text-muted-foreground">No students enrolled</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </Section>
            );
          })()}
        </>
      )}

      {annModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => { if (!isPosting) setAnnModal(false); }}>
          <div className="bg-card border-2 border-ink rounded-2xl shadow-brut w-full max-w-lg p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">New announcement</h2>
              <button onClick={() => setAnnModal(false)} disabled={isPosting} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
            </div>
            <input placeholder="Title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" />
            <textarea rows={4} placeholder="What's the news?" value={annBody} onChange={(e) => setAnnBody(e.target.value)} className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background resize-none" />
            <div className="flex gap-3 pt-1">
              <WakeoutButton onClick={handlePostAnnouncement} disabled={isPosting || !annTitle.trim() || !annBody.trim()}>
                {isPosting ? "Posting…" : "Post"}
              </WakeoutButton>
              <WakeoutButton variant="secondary" onClick={() => setAnnModal(false)} disabled={isPosting}>Cancel</WakeoutButton>
            </div>
          </div>
        </div>
      )}

      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => { if (!isUploadingNote) setNoteModal(false); }}>
          <div className="bg-card border-2 border-ink rounded-2xl shadow-brut w-full max-w-lg p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">Upload note</h2>
              <button onClick={() => setNoteModal(false)} disabled={isUploadingNote} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
            </div>
            <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Title (required)" className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" />
            <input value={noteDesc} onChange={(e) => setNoteDesc(e.target.value)} placeholder="Description (optional)" className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" />
            <label className="flex items-center gap-3 border-2 border-ink rounded-xl px-4 py-3 bg-background cursor-pointer hover:bg-secondary transition-colors">
              <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm text-muted-foreground truncate">{noteFile ? noteFile.name : "Attach a file (PDF, image, Word, etc.)"}</span>
              <input ref={noteFileRef} type="file" className="hidden" onChange={(e) => setNoteFile(e.target.files?.[0] ?? null)} />
            </label>
            {noteFile && <div className="text-xs font-mono text-muted-foreground">{detectType(noteFile.name).toUpperCase()} · {(noteFile.size / 1024).toFixed(1)} KB</div>}
            <div className="flex gap-3 pt-1">
              <WakeoutButton onClick={handleAddNote} disabled={isUploadingNote || !noteTitle.trim() || !noteFile}>
                {isUploadingNote ? "Uploading…" : "Upload note"}
              </WakeoutButton>
              <WakeoutButton variant="secondary" onClick={() => setNoteModal(false)} disabled={isUploadingNote}>Cancel</WakeoutButton>
            </div>
          </div>
        </div>
      )}

      {assModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => { if (!isCreatingAss) setAssModal(false); }}>
          <div className="bg-card border-2 border-ink rounded-2xl shadow-brut w-full max-w-lg p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">New assignment</h2>
              <button onClick={() => setAssModal(false)} disabled={isCreatingAss} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
            </div>
            <input value={assTitle} onChange={(e) => setAssTitle(e.target.value)} placeholder="Title (required)" className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" />
            <textarea rows={3} value={assDesc} onChange={(e) => setAssDesc(e.target.value)} placeholder="Instructions / description (optional)" className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background resize-none" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground block mb-1">Start date</label>
                <input type="datetime-local" min={localNow()} value={assStartAt} onChange={(e) => setAssStartAt(e.target.value)} className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" />
              </div>
              <div>
                <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground block mb-1">End date</label>
                <input type="datetime-local" value={assEndAt} onChange={(e) => setAssEndAt(e.target.value)} className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" />
              </div>
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground block mb-1">Max score (pts) — required</label>
              <input type="number" min={1} max={100} step={0.5} value={assMaxScore} onChange={(e) => setAssMaxScore(e.target.value)} placeholder="e.g. 100" className="w-40 border-2 border-ink rounded-xl px-4 py-3 bg-background" />
            </div>
            <label className="flex items-center gap-3 border-2 border-ink rounded-xl px-4 py-3 bg-background cursor-pointer hover:bg-secondary transition-colors">
              <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm text-muted-foreground truncate">{assFile ? assFile.name : "Attach a file (optional)"}</span>
              <input ref={assFileRef} type="file" className="hidden" onChange={(e) => setAssFile(e.target.files?.[0] ?? null)} />
            </label>
            {assFile && <div className="text-xs font-mono text-muted-foreground">{detectType(assFile.name).toUpperCase()} · {(assFile.size / 1024).toFixed(1)} KB</div>}
            <div className="flex gap-3 pt-1">
              <WakeoutButton onClick={handleCreateAssignment} disabled={isCreatingAss || !assTitle.trim() || !assStartAt || !assEndAt || !assMaxScore.trim() || parseFloat(assMaxScore) <= 0 || parseFloat(assMaxScore) > 100}>
                {isCreatingAss ? "Creating…" : "Create assignment"}
              </WakeoutButton>
              <WakeoutButton variant="secondary" onClick={() => setAssModal(false)} disabled={isCreatingAss}>Cancel</WakeoutButton>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirm !== null}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.confirmLabel}
        danger
        loading={confirming}
        onConfirm={runConfirm}
        onClose={() => { if (!confirming) setConfirm(null); }}
      />
    </>
  );
}
