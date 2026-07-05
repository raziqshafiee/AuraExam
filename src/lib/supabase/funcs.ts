import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";

const db = (supabase: ReturnType<typeof createClient>) => supabase;

export const getStudentDashboardData = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const studentId = user.id;

    const [{ data: profile }, { data: enrollments }] = await Promise.all([
      db(supabase).from("profiles").select("name").eq("id", studentId).single(),
      db(supabase)
        .from("class_enrollments")
        .select("class_id, classes(*, profiles!lecturer_id(name))")
        .eq("student_id", studentId),
    ]);

    const classes = (enrollments as any[])?.map((e: any) => e.classes) || [];
    const classIds = classes.map((c: any) => c?.id).filter(Boolean);

    if (classIds.length === 0) {
      return {
        profile: profile as any,
        classes: [],
        exams: [],
        submissions: [],
        assignments: [],
        announcements: [],
        appeals: [],
        unreadCount: 0,
      };
    }

    const [
      { data: exams },
      { data: submissions },
      { count: unreadCount },
      { data: assignmentsRaw },
      { data: announcementsRaw },
      { data: appeals },
    ] = await Promise.all([
      db(supabase)
        .from("exams")
        .select("*, classes(code, name)")
        .in("class_id", classIds)
        .neq("status", "draft")
        .order("start_time", { ascending: true }),
      db(supabase).from("submissions").select("*").eq("student_id", studentId),
      db(supabase)
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", studentId)
        .eq("read", false),
      db(supabase)
        .from("class_assignments")
        .select("*")
        .in("class_id", classIds)
        .order("end_at", { ascending: true }),
      db(supabase)
        .from("announcements")
        .select("*")
        .in("class_id", classIds)
        .order("created_at", { ascending: false }),
      db(supabase)
        .from("appeals")
        .select("id, type, status, exam_title, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const assignmentIds = ((assignmentsRaw as any[]) ?? []).map((a: any) => a.id);
    let mySubs: any[] = [];
    if (assignmentIds.length > 0) {
      const { data } = await db(supabase)
        .from("assignment_submissions")
        .select("*")
        .eq("student_id", studentId)
        .in("assignment_id", assignmentIds);
      mySubs = (data as any[]) ?? [];
    }

    const assignments = ((assignmentsRaw as any[]) ?? []).map((a: any) => ({
      ...a,
      mySubmission: mySubs.find((s: any) => s.assignment_id === a.id) ?? null,
    }));

    return {
      profile: profile as any,
      classes,
      exams: (exams as any[]) ?? [],
      submissions: (submissions as any[]) ?? [],
      assignments,
      announcements: (announcementsRaw as any[]) ?? [],
      appeals: (appeals as any[]) ?? [],
      unreadCount: unreadCount ?? 0,
    };
  });

export const getLecturerDashboardData = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const lecturerId = user.id;

    const [{ data: profile }, { data: classes }] = await Promise.all([
      db(supabase).from("profiles").select("name").eq("id", lecturerId).single(),
      db(supabase).from("classes").select("*").eq("lecturer_id", lecturerId),
    ]);

    const classIds = (classes as any[])?.map((c: any) => c.id) || [];

    if (classIds.length === 0) {
      return {
        profile: profile as any,
        classes: [],
        exams: [],
        questionsCount: 0,
        liveSubmissionsCount: 0,
        pendingEssaysCount: 0,
        liveExams: [],
        pendingAppeals: [],
        flaggedSubs: [],
        assignments: [],
        enrolledByClass: {},
      };
    }

    const [
      { data: exams },
      { count: questionsCount },
      { data: enrollments },
      { data: assignmentsRaw },
      { data: pendingAppeals },
    ] = await Promise.all([
      db(supabase).from("exams").select("*, classes(code)").in("class_id", classIds).order("created_at", { ascending: false }),
      db(supabase).from("questions").select("*", { count: "exact", head: true }).in("class_id", classIds),
      db(supabase).from("class_enrollments").select("class_id").in("class_id", classIds),
      db(supabase).from("class_assignments").select("id, class_id, title, end_at").in("class_id", classIds).order("end_at", { ascending: true }),
      db(supabase).from("appeals").select("id, type, exam_title, created_at, profiles!student_id(name)").eq("status", "pending").order("created_at", { ascending: true }).limit(5),
    ]);

    const enrolledByClass: Record<string, number> = {};
    for (const e of (enrollments as any[]) ?? []) {
      enrolledByClass[e.class_id] = (enrolledByClass[e.class_id] ?? 0) + 1;
    }

    const examIds = (exams as any[])?.map((e: any) => e.id) || [];
    const liveExamIds = ((exams as any[]) ?? []).filter((e: any) => e.status === "live").map((e: any) => e.id);
    const assignmentIds = ((assignmentsRaw as any[]) ?? []).map((a: any) => a.id);

    const { data: submittedSubs } = examIds.length > 0
      ? await db(supabase).from("submissions").select("id").in("exam_id", examIds).eq("status", "submitted")
      : { data: [] };

    const submittedSubIds = ((submittedSubs as any[]) ?? []).map((s: any) => s.id);

    const [
      pendingEssayResult,
      flaggedSubsResult,
      inProgressResult,
      assignmentSubsResult,
    ] = await Promise.all([
      submittedSubIds.length > 0
        ? db(supabase).from("essay_answers").select("*", { count: "exact", head: true }).in("submission_id", submittedSubIds).is("score", null)
        : Promise.resolve({ count: 0 }),
      examIds.length > 0
        ? db(supabase).from("submissions").select("id, exam_id, flags, submitted_at, profiles!student_id(name), exams(title, classes(code))").eq("status", "flagged").in("exam_id", examIds).order("submitted_at", { ascending: false }).limit(5)
        : Promise.resolve({ data: [] }),
      liveExamIds.length > 0
        ? db(supabase).from("submissions").select("exam_id, status").in("exam_id", liveExamIds)
        : Promise.resolve({ data: [] }),
      assignmentIds.length > 0
        ? db(supabase).from("assignment_submissions").select("assignment_id").in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [] }),
    ]);

    const pendingEssaysCount = (pendingEssayResult as any).count ?? 0;

    const inProgressByExam: Record<string, number> = {};
    const submittedByExam: Record<string, number> = {};
    for (const s of (inProgressResult.data as any[]) ?? []) {
      if (s.status === "in-progress") {
        inProgressByExam[s.exam_id] = (inProgressByExam[s.exam_id] ?? 0) + 1;
      } else {
        submittedByExam[s.exam_id] = (submittedByExam[s.exam_id] ?? 0) + 1;
      }
    }
    const liveSubmissionsCount = Object.values(inProgressByExam).reduce((a, b) => a + b, 0);

    const liveExams = ((exams as any[]) ?? [])
      .filter((e: any) => e.status === "live")
      .map((e: any) => ({
        id: e.id as string,
        title: e.title as string,
        classCode: e.classes?.code ?? "",
        class_id: e.class_id as string,
        end_time: e.end_time as string,
        inProgressCount: inProgressByExam[e.id] ?? 0,
        submittedCount: submittedByExam[e.id] ?? 0,
        enrolledCount: enrolledByClass[e.class_id] ?? 0,
      }));

    const subCountByAssignment: Record<string, number> = {};
    for (const s of (assignmentSubsResult.data as any[]) ?? []) {
      subCountByAssignment[s.assignment_id] = (subCountByAssignment[s.assignment_id] ?? 0) + 1;
    }

    const assignments = ((assignmentsRaw as any[]) ?? []).map((a: any) => ({
      ...a,
      submittedCount: subCountByAssignment[a.id] ?? 0,
      enrolledCount: enrolledByClass[a.class_id] ?? 0,
    }));

    return {
      profile: profile as any,
      classes: (classes as any[]) ?? [],
      exams: (exams as any[]) ?? [],
      questionsCount: questionsCount ?? 0,
      liveSubmissionsCount,
      pendingEssaysCount,
      liveExams,
      pendingAppeals: (pendingAppeals as any[]) ?? [],
      flaggedSubs: (flaggedSubsResult.data as any[]) ?? [],
      assignments,
      enrolledByClass,
    };
  });

export const getAdminDashboardData = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await db(supabase).from("profiles").select("name").eq("id", user.id).single();

    // Platform-wide counts — run in parallel
    const [
      { count: usersCount },
      { count: classesCount },
      { count: examsCount },
      { count: liveExamsCount },
      { count: pendingAppealsCount },
      { count: flaggedCount },
      { count: bannedUsersCount },
    ] = await Promise.all([
      db(supabase).from("profiles").select("*", { count: "exact", head: true }),
      db(supabase).from("classes").select("*", { count: "exact", head: true }),
      db(supabase).from("exams").select("*", { count: "exact", head: true }),
      db(supabase).from("exams").select("*", { count: "exact", head: true }).eq("status", "live"),
      db(supabase).from("appeals").select("*", { count: "exact", head: true }).eq("status", "pending"),
      db(supabase).from("submissions").select("*", { count: "exact", head: true }).eq("status", "flagged"),
      db(supabase).from("profiles").select("*", { count: "exact", head: true }).eq("status", "banned"),
    ]);

    // Live exam details with in-progress student counts
    const { data: liveExamsRaw } = await db(supabase)
      .from("exams")
      .select("id, title, classes(code, profiles!lecturer_id(name))")
      .eq("status", "live");

    const liveExamIds = (liveExamsRaw ?? []).map((e: any) => e.id);
    let inProgressByExam: Record<string, number> = {};
    if (liveExamIds.length > 0) {
      const { data: inProg } = await db(supabase)
        .from("submissions")
        .select("exam_id")
        .in("exam_id", liveExamIds)
        .eq("status", "in-progress");
      for (const s of inProg ?? []) {
        inProgressByExam[s.exam_id] = (inProgressByExam[s.exam_id] ?? 0) + 1;
      }
    }
    const liveExams = (liveExamsRaw ?? []).map((e: any) => ({
      id: e.id as string,
      title: e.title as string,
      classCode: e.classes?.code ?? "",
      lecturerName: e.classes?.profiles?.name ?? "Unknown",
      inProgressCount: inProgressByExam[e.id] ?? 0,
    }));

    // 5 most recently auto-submitted flagged submissions
    const { data: flaggedRaw } = await db(supabase)
      .from("submissions")
      .select("id, flags, submitted_at, profiles!student_id(name), exams(title, classes(code))")
      .eq("status", "flagged")
      .order("submitted_at", { ascending: false })
      .limit(5);

    const recentFlagged = (flaggedRaw ?? []).map((s: any) => ({
      id: s.id as string,
      studentName: s.profiles?.name ?? "Unknown",
      examTitle: s.exams?.title ?? "",
      classCode: s.exams?.classes?.code ?? "",
      flags: s.flags ?? 0,
      submittedAt: s.submitted_at as string,
    }));

    return {
      profile: profile as any,
      usersCount: usersCount ?? 0,
      classesCount: classesCount ?? 0,
      examsCount: examsCount ?? 0,
      liveExamsCount: liveExamsCount ?? 0,
      pendingAppealsCount: pendingAppealsCount ?? 0,
      flaggedCount: flaggedCount ?? 0,
      bannedUsersCount: bannedUsersCount ?? 0,
      liveExams,
      recentFlagged,
    };
  });
