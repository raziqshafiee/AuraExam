import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";

const db = (supabase: ReturnType<typeof createClient>) => supabase as any;

export const getStudentDashboardData = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const studentId = user.id;

    const { data: profile } = await db(supabase).from("profiles").select("name").eq("id", studentId).single();

    const { data: enrollments } = await db(supabase)
      .from("class_enrollments")
      .select("class_id, classes(*)")
      .eq("student_id", studentId);

    const classes = (enrollments as any[])?.map((e: any) => e.classes) || [];
    const classIds = classes.map((c: any) => c?.id).filter(Boolean);

    const { data: exams } = await db(supabase)
      .from("exams")
      .select("*, classes(code)")
      .in("class_id", classIds)
      .neq("status", "draft")
      .order("start_time", { ascending: true });

    const { data: submissions } = await db(supabase)
      .from("submissions")
      .select("*")
      .eq("student_id", studentId);

    const { count: unreadCount } = await db(supabase)
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", studentId)
      .eq("read", false);

    return {
      profile: profile as any,
      classes,
      exams: (exams as any[]) || [],
      submissions: (submissions as any[]) || [],
      unreadCount: unreadCount || 0,
    };
  });

export const getLecturerDashboardData = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const lecturerId = user.id;

    const { data: profile } = await db(supabase).from("profiles").select("name").eq("id", lecturerId).single();

    const { data: classes } = await db(supabase).from("classes").select("*").eq("lecturer_id", lecturerId);

    const classIds = (classes as any[])?.map((c: any) => c.id) || [];

    const { data: exams } = await db(supabase)
      .from("exams")
      .select("*, classes(code)")
      .in("class_id", classIds)
      .order("created_at", { ascending: false });

    const { count: questionsCount } = await db(supabase)
      .from("questions")
      .select("*", { count: "exact", head: true })
      .in("class_id", classIds);

    const examIds = (exams as any[])?.map((e: any) => e.id) || [];
    const { count: liveSubmissionsCount } = await db(supabase)
      .from("submissions")
      .select("*", { count: "exact", head: true })
      .in("exam_id", examIds)
      .eq("status", "in-progress");

    // Pending essays = essay_answers with score IS NULL on submitted exams
    let pendingEssaysCount = 0;
    if (examIds.length > 0) {
      const { data: submittedSubs } = await db(supabase)
        .from("submissions")
        .select("id")
        .in("exam_id", examIds)
        .eq("status", "submitted");

      const submittedSubIds = (submittedSubs ?? []).map((s: any) => s.id);
      if (submittedSubIds.length > 0) {
        const { count } = await db(supabase)
          .from("essay_answers")
          .select("*", { count: "exact", head: true })
          .in("submission_id", submittedSubIds)
          .is("score", null);
        pendingEssaysCount = count ?? 0;
      }
    }

    return {
      profile: profile as any,
      classes: (classes as any[]) || [],
      exams: (exams as any[]) || [],
      questionsCount: questionsCount || 0,
      liveSubmissionsCount: liveSubmissionsCount || 0,
      pendingEssaysCount,
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
