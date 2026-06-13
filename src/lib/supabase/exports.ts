import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { requireRole } from "./authz";

const db = (s: ReturnType<typeof createClient>) => s as any;

export type ExportStudent = { id: string; name: string };
export type ExportExam = { id: string; title: string; startAt: string; total: number; status: string };
export type ExportSubmission = {
  id: string;
  studentId: string;
  studentName: string;
  examId: string;
  score: number | null;
  autoScore: number;
  total: number;
  status: string;
  flags: number;
  submittedAt: string | null;
};
export type ClassExportData = {
  classInfo: { id: string; name: string; code: string };
  students: ExportStudent[];
  exams: ExportExam[];
  submissions: ExportSubmission[];
};

export const getClassExportData = createServerFn({ method: "GET" })
  .inputValidator((data: { classId: string }) => data)
  .handler(async ({ data }): Promise<ClassExportData> => {
    const supabase = createClient();
    const { user } = await requireRole("lecturer", supabase, "Unauthorized");

    const { data: cls } = await db(supabase)
      .from("classes")
      .select("id, name, code, lecturer_id")
      .eq("id", data.classId)
      .eq("lecturer_id", user.id)
      .single();
    if (!cls) throw new Error("Class not found");

    const { data: enrollments } = await db(supabase)
      .from("class_enrollments")
      .select("student_id, profiles!student_id(id, name)")
      .eq("class_id", data.classId);

    const students: ExportStudent[] = ((enrollments ?? []) as any[])
      .map((e: any) => ({ id: e.profiles?.id ?? e.student_id, name: e.profiles?.name ?? "Unknown" }))
      .sort((a: ExportStudent, b: ExportStudent) => a.name.localeCompare(b.name));

    const { data: exams } = await db(supabase)
      .from("exams")
      .select("id, title, start_time, status")
      .eq("class_id", data.classId)
      .neq("status", "draft")
      .order("start_time", { ascending: true });

    const examIds = ((exams ?? []) as any[]).map((e: any) => e.id);
    let submissions: ExportSubmission[] = [];

    if (examIds.length > 0) {
      const { data: subs } = await db(supabase)
        .from("submissions")
        .select("id, student_id, exam_id, score, auto_score, total, status, flags, submitted_at, profiles!student_id(name)")
        .in("exam_id", examIds)
        .neq("status", "in-progress");

      submissions = ((subs ?? []) as any[]).map((s: any) => ({
        id: s.id,
        studentId: s.student_id,
        studentName: s.profiles?.name ?? "Unknown",
        examId: s.exam_id,
        score: s.score,
        autoScore: s.auto_score ?? 0,
        total: s.total ?? 0,
        status: s.status,
        flags: s.flags ?? 0,
        submittedAt: s.submitted_at,
      }));
    }

    const examTotalMap: Record<string, number> = {};
    for (const s of submissions) {
      if (s.total > (examTotalMap[s.examId] ?? 0)) examTotalMap[s.examId] = s.total;
    }

    return {
      classInfo: { id: cls.id, name: cls.name, code: cls.code },
      students,
      exams: ((exams ?? []) as any[]).map((e: any) => ({
        id: e.id,
        title: e.title,
        startAt: e.start_time,
        total: examTotalMap[e.id] ?? 0,
        status: e.status,
      })),
      submissions,
    };
  });
