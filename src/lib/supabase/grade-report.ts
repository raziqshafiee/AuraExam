import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";

const db = (supabase: ReturnType<typeof createClient>) => supabase as any;

export type GradeConfigItem = {
  type: "exam" | "assignment";
  id: string;
  weight: number;
};

export type GradeConfig = {
  classId: string;
  items: GradeConfigItem[];
  updatedAt: string | null;
};

function letterGrade(pct: number): string {
  if (pct >= 80) return "A";
  if (pct >= 65) return "B";
  if (pct >= 50) return "C";
  if (pct >= 40) return "D";
  return "F";
}

export const saveGradeConfig = createServerFn({ method: "POST" })
  .inputValidator((data: { classId: string; items: GradeConfigItem[] }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (user.user_metadata as any)?.role !== "lecturer") throw new Error("Unauthorized");

    const { data: cls } = await db(supabase).from("classes").select("lecturer_id").eq("id", data.classId).single();
    if (!cls || cls.lecturer_id !== user.id) throw new Error("Forbidden");

    const totalWeight = data.items.reduce((s, i) => s + i.weight, 0);
    if (totalWeight > 100) throw new Error(`Total weight is ${totalWeight} — cannot exceed 100`);

    // Use admin client to bypass RLS — auth ownership already verified above.
    const admin = createAdminClient() as any;
    const { error } = await admin
      .from("class_grade_config")
      .upsert({ class_id: data.classId, items: data.items, updated_at: new Date().toISOString() }, { onConflict: "class_id" });

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const getGradeConfig = createServerFn({ method: "GET" })
  .inputValidator((classId: string) => classId)
  .handler(async ({ data: classId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data } = await db(supabase)
      .from("class_grade_config")
      .select("items, updated_at")
      .eq("class_id", classId)
      .maybeSingle();

    return {
      classId,
      items: (data?.items ?? []) as GradeConfigItem[],
      updatedAt: data?.updated_at ?? null,
    } as GradeConfig;
  });

export const getGradeReport = createServerFn({ method: "GET" })
  .inputValidator((classId: string) => classId)
  .handler(async ({ data: classId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const role = (user.user_metadata as any)?.role;
    if (role !== "lecturer" && role !== "admin") throw new Error("Unauthorized");

    if (role === "lecturer") {
      const { data: cls } = await db(supabase).from("classes").select("lecturer_id").eq("id", classId).single();
      if (!cls || cls.lecturer_id !== user.id) throw new Error("Forbidden");
    }

    // Use admin client for all data reads — submissions and grade_config are behind
    // RLS that blocks cross-student reads for the lecturer's session token.
    const admin = createAdminClient() as any;

    const { data: configRow } = await admin
      .from("class_grade_config").select("items").eq("class_id", classId).maybeSingle();
    const items: GradeConfigItem[] = configRow?.items ?? [];

    const examIds = items.filter((i) => i.type === "exam").map((i) => i.id);
    const assignIds = items.filter((i) => i.type === "assignment").map((i) => i.id);
    const totalWeight = items.reduce((s, i) => s + i.weight, 0);

    const [examsData, assignsData] = await Promise.all([
      examIds.length > 0
        ? admin.from("exams").select("id, title, status").in("id", examIds)
        : Promise.resolve({ data: [] as any[] }),
      assignIds.length > 0
        ? admin.from("class_assignments").select("id, title, max_score").in("id", assignIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // Derive exam max scores from any existing graded submission's total
    const examMaxScores: Record<string, number> = {};
    if (examIds.length > 0) {
      const { data: sampleSubs } = await admin
        .from("submissions").select("exam_id, total").in("exam_id", examIds).neq("status", "in-progress").limit(examIds.length * 5);
      for (const s of (sampleSubs ?? [])) {
        if (!examMaxScores[s.exam_id] && s.total > 0) examMaxScores[s.exam_id] = s.total;
      }
    }

    const { data: enrollments } = await admin
      .from("class_enrollments").select("student_id, profiles!student_id(id, name)").eq("class_id", classId);
    const students: { id: string; name: string }[] = ((enrollments ?? []) as any[])
      .map((e: any) => ({ id: e.profiles?.id ?? e.student_id, name: e.profiles?.name ?? "Unknown" }));

    const [allExamSubsRes, allAssignSubsRes] = await Promise.all([
      examIds.length > 0
        ? admin.from("submissions").select("student_id, exam_id, score, total").in("exam_id", examIds).neq("status", "in-progress")
        : Promise.resolve({ data: [] as any[] }),
      assignIds.length > 0
        ? admin.from("assignment_submissions").select("student_id, assignment_id, grade").in("assignment_id", assignIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const examSubs: any[] = allExamSubsRes.data ?? [];
    const assignSubs: any[] = allAssignSubsRes.data ?? [];

    const studentGrades = students.map((student) => {
      let rawScore = 0;
      const breakdown: { label: string; weight: number; score: number; maxScore: number; contribution: number }[] = [];

      for (const item of items) {
        if (item.type === "exam") {
          const exam = (examsData.data ?? []).find((e: any) => e.id === item.id);
          const sub = examSubs.find((s) => s.student_id === student.id && s.exam_id === item.id);
          const maxScore = sub?.total ?? examMaxScores[item.id] ?? 0;
          const score = sub?.score ?? 0;
          const contribution = maxScore > 0 ? (score / maxScore) * item.weight : 0;
          rawScore += contribution;
          breakdown.push({ label: exam?.title ?? item.id, weight: item.weight, score, maxScore, contribution: Math.round(contribution * 10) / 10 });
        } else {
          const assign = (assignsData.data ?? []).find((a: any) => a.id === item.id);
          const sub = assignSubs.find((s) => s.student_id === student.id && s.assignment_id === item.id);
          const maxScore = assign?.max_score ?? 0;
          const score = sub?.grade ?? 0;
          const contribution = maxScore > 0 ? (score / maxScore) * item.weight : 0;
          rawScore += contribution;
          breakdown.push({ label: assign?.title ?? item.id, weight: item.weight, score, maxScore, contribution: Math.round(contribution * 10) / 10 });
        }
      }

      const pct = totalWeight > 0 ? (rawScore / totalWeight) * 100 : 0;
      return {
        studentId: student.id,
        studentName: student.name,
        pct: Math.round(pct * 10) / 10,
        grade: letterGrade(pct),
        breakdown,
      };
    });

    return {
      items: items.map((i) => {
        const examRow = (examsData.data ?? []).find((e: any) => e.id === i.id);
        const assignRow = (assignsData.data ?? []).find((a: any) => a.id === i.id);
        return { ...i, label: examRow?.title ?? assignRow?.title ?? i.id };
      }),
      totalWeight,
      studentGrades,
    };
  });

export const getMyGrade = createServerFn({ method: "GET" })
  .inputValidator((classId: string) => classId)
  .handler(async ({ data: classId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const admin = createAdminClient() as any;

    const { data: configRow } = await admin
      .from("class_grade_config").select("items, updated_at").eq("class_id", classId).maybeSingle();

    if (!configRow || !configRow.items?.length) return null;

    const items: GradeConfigItem[] = configRow.items;
    const examIds = items.filter((i) => i.type === "exam").map((i) => i.id);
    const assignIds = items.filter((i) => i.type === "assignment").map((i) => i.id);
    const totalWeight = items.reduce((s, i) => s + i.weight, 0);

    const [examsData, assignsData, examSubsRes, assignSubsRes] = await Promise.all([
      examIds.length > 0
        ? db(supabase).from("exams").select("id, title").in("id", examIds)
        : Promise.resolve({ data: [] as any[] }),
      assignIds.length > 0
        ? db(supabase).from("class_assignments").select("id, title, max_score").in("id", assignIds)
        : Promise.resolve({ data: [] as any[] }),
      examIds.length > 0
        ? db(supabase).from("submissions").select("exam_id, score, total").eq("student_id", user.id).in("exam_id", examIds).neq("status", "in-progress")
        : Promise.resolve({ data: [] as any[] }),
      assignIds.length > 0
        ? db(supabase).from("assignment_submissions").select("assignment_id, grade").eq("student_id", user.id).in("assignment_id", assignIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const examSubs: any[] = examSubsRes.data ?? [];
    const assignSubs: any[] = assignSubsRes.data ?? [];

    let rawScore = 0;
    const breakdown: { label: string; weight: number; score: number; maxScore: number; contribution: number }[] = [];

    for (const item of items) {
      if (item.type === "exam") {
        const exam = (examsData.data ?? []).find((e: any) => e.id === item.id);
        const sub = examSubs.find((s: any) => s.exam_id === item.id);
        const maxScore = sub?.total ?? 0;
        const score = sub?.score ?? 0;
        const contribution = maxScore > 0 ? (score / maxScore) * item.weight : 0;
        rawScore += contribution;
        breakdown.push({ label: exam?.title ?? item.id, weight: item.weight, score, maxScore, contribution: Math.round(contribution * 10) / 10 });
      } else {
        const assign = (assignsData.data ?? []).find((a: any) => a.id === item.id);
        const sub = assignSubs.find((s: any) => s.assignment_id === item.id);
        const maxScore = assign?.max_score ?? 0;
        const score = sub?.grade ?? 0;
        const contribution = maxScore > 0 ? (score / maxScore) * item.weight : 0;
        rawScore += contribution;
        breakdown.push({ label: assign?.title ?? item.id, weight: item.weight, score, maxScore, contribution: Math.round(contribution * 10) / 10 });
      }
    }

    const pct = totalWeight > 0 ? (rawScore / totalWeight) * 100 : 0;
    return {
      pct: Math.round(pct * 10) / 10,
      grade: letterGrade(pct),
      totalWeight,
      breakdown,
      updatedAt: configRow.updated_at as string,
    };
  });
