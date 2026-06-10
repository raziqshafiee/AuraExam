import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { pushNotification } from "./notifications";
import { writeAudit } from "./audit";
import { MY_TZ } from "@/lib/datetime";

const db = (supabase: ReturnType<typeof createClient>) => supabase as any;

// Types
export type ExamStatus = "draft" | "upcoming" | "live" | "closed" | "graded";

export type ExamListItem = {
  id: string;
  title: string;
  class_id: string;
  classCode: string;
  className: string;
  start_time: string;
  end_time: string;
  duration: number;
  require_camera: boolean;
  questions_count: number;
  status: ExamStatus;
  created_at: string;
};

export type ExamDetail = ExamListItem & {
  questions: Array<{
    id: string;
    type: "MCQ" | "TF" | "ESSAY";
    text: string;
    points: number;
    order_index: number;
    meta: any;
    difficulty: string;
    tags: string[];
  }>;
};

type CreateExamInput = {
  title: string;
  class_id: string;
  start_time: string;
  end_time: string;
  duration: number;
  require_camera: boolean;
  status: ExamStatus;
  question_ids: string[];
};

// GET: Lecturer's exams
export const getLecturerExams = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: classes } = await db(supabase)
      .from("classes")
      .select("id")
      .eq("lecturer_id", user.id);

    if (!classes || classes.length === 0) return [] as ExamListItem[];

    const classIds = classes.map((c: any) => c.id);

    const { data: exams, error } = await db(supabase)
      .from("exams")
      .select("*, classes(code, name)")
      .in("class_id", classIds)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return (exams ?? []).map((e: any) => ({
      id: e.id,
      title: e.title,
      class_id: e.class_id,
      classCode: e.classes?.code ?? "",
      className: e.classes?.name ?? "",
      start_time: e.start_time,
      end_time: e.end_time,
      duration: e.duration,
      require_camera: e.require_camera ?? false,
      questions_count: e.questions_count,
      status: e.status,
      created_at: e.created_at,
    })) as ExamListItem[];
  }
);

// GET: Single exam detail
export const getExam = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: exam, error } = await db(supabase)
      .from("exams")
      .select("*, classes(code, name)")
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    if (!exam || exam.created_by !== user.id) throw new Error("Forbidden");

    const { data: examQuestions, error: eqErr } = await db(supabase)
      .from("exam_questions")
      .select(
        "order_index, questions(id, type, text, points, meta, difficulty, tags)"
      )
      .eq("exam_id", id)
      .order("order_index", { ascending: true });

    if (eqErr) throw new Error(eqErr.message);

    const questions = (examQuestions ?? []).map((eq: any) => ({
      id: eq.questions.id,
      type: eq.questions.type,
      text: eq.questions.text,
      points: eq.questions.points,
      order_index: eq.order_index,
      meta: eq.questions.meta,
      difficulty: eq.questions.difficulty,
      tags: eq.questions.tags ?? [],
    }));

    return {
      id: exam.id,
      title: exam.title,
      class_id: exam.class_id,
      classCode: exam.classes?.code ?? "",
      className: exam.classes?.name ?? "",
      start_time: exam.start_time,
      end_time: exam.end_time,
      duration: exam.duration,
      require_camera: exam.require_camera ?? false,
      questions_count: exam.questions_count,
      status: exam.status,
      created_at: exam.created_at,
      questions,
    } as ExamDetail;
  });

// POST: Create exam
export const createExam = createServerFn({ method: "POST" })
  .inputValidator((data: CreateExamInput) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: exam, error } = await db(supabase)
      .from("exams")
      .insert({
        title: data.title,
        class_id: data.class_id,
        start_time: data.start_time,
        end_time: data.end_time,
        duration: data.duration,
        require_camera: data.require_camera,
        status: data.status,
        questions_count: data.question_ids.length,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    if (data.question_ids.length > 0) {
      const rows = data.question_ids.map((qid, i) => ({
        exam_id: exam.id,
        question_id: qid,
        order_index: i,
      }));
      const { error: eqErr } = await db(supabase)
        .from("exam_questions")
        .insert(rows);
      if (eqErr) throw new Error(eqErr.message);
    }

    return { id: exam.id as string };
  });

// POST: Update exam
export const updateExam = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string } & CreateExamInput) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Fetch the current status before any write so we can enforce lifecycle rules.
    const { data: current } = await db(supabase)
      .from("exams")
      .select("status, class_id, created_by")
      .eq("id", data.id)
      .single();

    if (!current || current.created_by !== user.id) {
      throw new Error("Forbidden — you do not own this exam");
    }

    const locked = ["live", "closed", "graded"] as const;
    if (locked.includes(current?.status)) {
      throw new Error(
        `This exam is ${current.status} and can no longer be edited`
      );
    }

    if (current?.status === "upcoming") {
      // Once published, only cosmetic fields may change. Questions, schedule,
      // duration, and class are committed — students are already expecting them.
      const { error } = await db(supabase)
        .from("exams")
        .update({ title: data.title, require_camera: data.require_camera })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id as string };
    }

    // Draft: full update
    const { error } = await db(supabase)
      .from("exams")
      .update({
        title: data.title,
        class_id: data.class_id,
        start_time: data.start_time,
        end_time: data.end_time,
        duration: data.duration,
        require_camera: data.require_camera,
        status: data.status,
        questions_count: data.question_ids.length,
      })
      .eq("id", data.id);

    if (error) throw new Error(error.message);

    await db(supabase).from("exam_questions").delete().eq("exam_id", data.id);

    if (data.question_ids.length > 0) {
      const rows = data.question_ids.map((qid, i) => ({
        exam_id: data.id,
        question_id: qid,
        order_index: i,
      }));
      const { error: eqErr } = await db(supabase)
        .from("exam_questions")
        .insert(rows);
      if (eqErr) throw new Error(eqErr.message);
    }

    // Notify enrolled students only on the actual draft → upcoming transition.
    // Re-saves of an already-published exam (title/camera edits) must not re-fire.
    if (current.status !== "upcoming" && data.status === "upcoming") {
      try {
        const { data: enrollments } = await db(supabase)
          .from("class_enrollments")
          .select("student_id")
          .eq("class_id", data.class_id);
        const students = enrollments ?? [];
        if (students.length > 0) {
          await Promise.all(
            students.map((e: any) =>
              pushNotification(supabase, {
                userId: e.student_id,
                type: "exam_published",
                title: "Exam published",
                body: `${data.title} is now scheduled`,
                link: "/student/exams",
              })
            )
          );
        }
      } catch {}
      await writeAudit(user.id, {
        action: "Published exam",
        target: data.title,
        category: "exam",
      });
    }

    return { id: data.id as string };
  });

// POST: Delete exam
export const deleteExam = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: exam } = await db(supabase)
      .from("exams")
      .select("status, title, created_by")
      .eq("id", id)
      .single();

    if (!exam || exam.created_by !== user.id) {
      throw new Error("Forbidden — you do not own this exam");
    }

    if (["live", "closed", "graded"].includes(exam?.status)) {
      throw new Error(
        `Cannot delete a ${exam.status} exam — student data exists`
      );
    }

    const { count } = await db(supabase)
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", id);

    if (count && count > 0) {
      throw new Error(
        "Cannot delete an exam that already has student submissions"
      );
    }

    const { error } = await db(supabase).from("exams").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await writeAudit(user.id, {
      action: "Deleted exam",
      target: exam?.title ?? id,
      category: "exam",
    });

    return { success: true as const };
  });

// POST: Unpublish exam (upcoming → draft)
export const unpublishExam = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: exam } = await db(supabase)
      .from("exams")
      .select("status, start_time, title, created_by")
      .eq("id", id)
      .single();

    if (!exam || exam.created_by !== user.id) {
      throw new Error("Forbidden — you do not own this exam");
    }

    if (exam?.status !== "upcoming") {
      throw new Error("Only upcoming exams can be unpublished");
    }
    if (new Date() >= new Date(exam.start_time)) {
      throw new Error(
        "Cannot unpublish — the exam window has already opened"
      );
    }

    const { count } = await db(supabase)
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", id);

    if (count && count > 0) {
      throw new Error(
        "Cannot unpublish — students have already started this exam"
      );
    }

    const { error } = await db(supabase)
      .from("exams")
      .update({ status: "draft" })
      .eq("id", id);
    if (error) throw new Error(error.message);

    await writeAudit(user.id, {
      action: "Unpublished exam",
      target: exam?.title ?? id,
      category: "exam",
    });

    return { success: true as const };
  });

// GET: Lecturer exam results
export const getLecturerExamResults = createServerFn({ method: "GET" })
  .inputValidator((examId: string) => examId)
  .handler(async ({ data: examId }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: exam, error: examErr } = await db(supabase)
      .from("exams")
      .select("id, title, status, created_by, classes(code, name)")
      .eq("id", examId)
      .single();

    if (examErr) throw new Error(examErr.message);
    if (!exam || exam.created_by !== user.id) throw new Error("Forbidden");

    const { data: subs, error: subErr } = await db(supabase)
      .from("submissions")
      .select("id, status, score, auto_score, flags, appeal_required, submitted_at, profiles!student_id(name)")
      .eq("exam_id", examId);

    if (subErr) throw new Error(subErr.message);

    // Compute true total from question points (not stale submissions.total)
    const { data: pointRows } = await db(supabase)
      .from("exam_questions")
      .select("questions(points)")
      .eq("exam_id", examId);
    const examTotal = (pointRows ?? []).reduce(
      (sum: number, eq: any) => sum + (eq.questions?.points ?? 0),
      0
    );

    const subIds = (subs ?? []).map((s: any) => s.id);

    let flagReasons: any[] = [];
    if (subIds.length > 0) {
      const { data: fr } = await db(supabase)
        .from("flag_reasons")
        .select("id, submission_id, time, type, label")
        .in("submission_id", subIds);
      flagReasons = fr ?? [];
    }

    let essayAnswers: any[] = [];
    if (subIds.length > 0) {
      const { data: ea } = await db(supabase)
        .from("essay_answers")
        .select("id, submission_id, question_id, answer, score, questions(type, text, points, meta)")
        .in("submission_id", subIds);
      essayAnswers = (ea ?? []).filter((e: any) => e.questions?.type === "ESSAY");
    }

    const submissions = (subs ?? []).map((s: any) => ({
      id: s.id,
      studentName: s.profiles?.name ?? "Unknown",
      status: s.status,
      score: s.score,
      auto_score: s.auto_score ?? 0,
      total: examTotal,
      flags: s.flags ?? 0,
      submittedAt: s.submitted_at,
      flagReasons: flagReasons
        .filter((fr) => fr.submission_id === s.id)
        .map((fr) => ({ time: fr.time, type: fr.type, label: fr.label })),
      essayAnswers: essayAnswers
        .filter((ea) => ea.submission_id === s.id)
        .map((ea) => ({
          id: ea.id,
          question_id: ea.question_id,
          questionText: ea.questions?.text ?? "",
          maxPoints: ea.questions?.points ?? 0,
          modelAnswer: (ea.questions?.meta as any)?.model_answer ?? null,
          rubric: (ea.questions?.meta as any)?.rubric ?? null,
          answer: ea.answer,
          score: ea.score,
        })),
    }));

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        classCode: exam.classes?.code ?? "",
        status: exam.status,
      },
      submissions,
    };
  });

// POST: Grade essay answer
export const gradeEssayAnswer = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { answerId: string; submissionId: string; score: number }) => data
  )
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Verify the submission belongs to an exam this lecturer owns.
    const { data: ownership } = await db(supabase)
      .from("submissions")
      .select("exam_id, exams!exam_id(created_by)")
      .eq("id", data.submissionId)
      .single();

    if (!ownership || (ownership.exams as any)?.created_by !== user.id) {
      throw new Error("Forbidden — you do not own this exam");
    }

    // 1. Save the essay score
    const { error } = await db(supabase)
      .from("essay_answers")
      .update({
        score: data.score,
        graded_by: user.id,
        graded_at: new Date().toISOString(),
      })
      .eq("id", data.answerId);

    if (error) throw new Error(error.message);

    // 2. Fetch only ESSAY answers for this submission (MCQ/TF are already in auto_score)
    const { data: allEssays } = await db(supabase)
      .from("essay_answers")
      .select("score, questions!question_id(type)")
      .eq("submission_id", data.submissionId);

    const essays = (allEssays ?? []).filter((e: any) => e.questions?.type === "ESSAY");
    const allGraded = essays.length > 0 && essays.every((e: any) => e.score !== null);
    const essaySum = essays.reduce((sum: number, e: any) => sum + (e.score ?? 0), 0);

    // 3. Get the immutable MCQ+TF base score
    const { data: sub } = await db(supabase)
      .from("submissions")
      .select("auto_score")
      .eq("id", data.submissionId)
      .single();

    const newScore = (sub?.auto_score ?? 0) + essaySum;

    // 4. Update submission score + promote to "graded" when complete
    const { data: subRow } = await db(supabase)
      .from("submissions")
      .select("student_id, exam_id, exams(title)")
      .eq("id", data.submissionId)
      .single();

    await db(supabase)
      .from("submissions")
      .update({
        score: newScore,
        ...(allGraded ? { status: "graded" } : {}),
      })
      .eq("id", data.submissionId);

    if (allGraded) {
      const examTitle = (subRow as any)?.exams?.title ?? "exam";
      if (subRow?.student_id) {
        try {
          await pushNotification(supabase, {
            userId: subRow.student_id,
            type: "grade_published",
            title: "Exam graded",
            body: `"${examTitle}" has been fully graded — your final score is ${newScore} pts`,
            link: `/student/exams/${subRow.exam_id}/result`,
          });
        } catch {}
      }
      await writeAudit(user.id, {
        action: "Fully graded exam",
        target: examTitle,
        category: "exam",
      });
    }

    return { success: true as const, newScore, allGraded };
  });

// GET: Lecturer exam monitor
export const getLecturerExamMonitor = createServerFn({ method: "GET" })
  .inputValidator((examId: string) => examId)
  .handler(async ({ data: examId }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: exam, error: examErr } = await db(supabase)
      .from("exams")
      .select("id, title, class_id, created_by, classes(code)")
      .eq("id", examId)
      .single();

    if (examErr) throw new Error(examErr.message);
    if (!exam || exam.created_by !== user.id) throw new Error("Forbidden");

    const [subsResult, enrollResult] = await Promise.all([
      db(supabase)
        .from("submissions")
        .select("id, status, flags, submitted_at, last_seen_at, profiles!student_id(name, id)")
        .eq("exam_id", examId),
      db(supabase)
        .from("class_enrollments")
        .select("student_id, profiles!student_id(name)")
        .eq("class_id", exam.class_id),
    ]);

    if (subsResult.error) throw new Error(subsResult.error.message);

    const subs = subsResult.data ?? [];
    const enrollments = enrollResult.data ?? [];

    // All integrity events (hard + advisory) — fetched in one batch, grouped by
    // submission so the UI can render a per-student flag log.
    const subIds = subs.map((s: any) => s.id);
    const flagsBySubmission: Record<string, { type: string; label: string; time: string }[]> = {};
    if (subIds.length > 0) {
      const { data: fr } = await db(supabase)
        .from("flag_reasons")
        .select("submission_id, type, label, time")
        .in("submission_id", subIds)
        .order("created_at", { ascending: true });
      for (const row of fr ?? []) {
        if (!flagsBySubmission[row.submission_id]) {
          flagsBySubmission[row.submission_id] = [];
        }
        flagsBySubmission[row.submission_id].push({
          type: row.type,
          label: row.label,
          time: row.time,
        });
      }
    }

    const startedIds = new Set(subs.map((s: any) => s.profiles?.id));
    const notStarted = enrollments
      .filter((e: any) => !startedIds.has(e.student_id))
      .map((e: any) => e.profiles?.name ?? "Unknown");

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        classCode: exam.classes?.code ?? "",
      },
      submissions: subs.map((s: any) => ({
        id: s.id,
        studentName: s.profiles?.name ?? "Unknown",
        status: s.status,
        flags: s.flags ?? 0,
        submittedAt: s.submitted_at,
        lastSeenAt: s.last_seen_at ?? null,
        flagReasons: flagsBySubmission[s.id] ?? [],
      })),
      notStarted,
    };
  });

// GET: Student's exams
export const getStudentExams = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: enrollments } = await db(supabase)
      .from("class_enrollments")
      .select("class_id")
      .eq("student_id", user.id);

    if (!enrollments || enrollments.length === 0) return [];

    const classIds = enrollments.map((e: any) => e.class_id);

    const { data: exams, error } = await db(supabase)
      .from("exams")
      .select("*, classes(code, name)")
      .in("class_id", classIds)
      .neq("status", "draft")
      .order("start_time", { ascending: true });

    if (error) throw new Error(error.message);

    const examIds = (exams ?? []).map((e: any) => e.id);

    let submissions: any[] = [];
    if (examIds.length > 0) {
      const { data: subs } = await db(supabase)
        .from("submissions")
        .select("id, exam_id, status, score")
        .eq("student_id", user.id)
        .in("exam_id", examIds);
      submissions = subs ?? [];
    }

    // Compute true point totals per exam from question points
    let examTotals: Record<string, number> = {};
    if (examIds.length > 0) {
      const { data: eqRows } = await db(supabase)
        .from("exam_questions")
        .select("exam_id, questions(points)")
        .in("exam_id", examIds);
      for (const row of eqRows ?? []) {
        examTotals[row.exam_id] = (examTotals[row.exam_id] ?? 0) + (row.questions?.points ?? 0);
      }
    }

    return (exams ?? []).map((e: any) => {
      const sub = submissions.find((s: any) => s.exam_id === e.id) ?? null;
      const total = examTotals[e.id] ?? 0;
      return {
        id: e.id,
        title: e.title,
        classCode: e.classes?.code ?? "",
        className: e.classes?.name ?? "",
        start_time: e.start_time,
        end_time: e.end_time,
        duration: e.duration,
        questions_count: e.questions_count,
        status: e.status as ExamStatus,
        submission: sub
          ? { status: sub.status, score: sub.score, total }
          : null,
      };
    });
  }
);

// GET: Student exam lobby
export const getStudentExamLobby = createServerFn({ method: "GET" })
  .inputValidator((examId: string) => examId)
  .handler(async ({ data: examId }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: exam, error } = await db(supabase)
      .from("exams")
      .select("*, classes(code, name)")
      .eq("id", examId)
      .single();

    if (error) throw new Error(error.message);
    if (exam.status === "draft") throw new Error("This exam is not available");

    // Verify enrollment.
    const { data: enrollment } = await db(supabase)
      .from("class_enrollments")
      .select("student_id")
      .eq("class_id", exam.class_id)
      .eq("student_id", user.id)
      .maybeSingle();

    if (!enrollment) throw new Error("You are not enrolled in this exam's class");

    const { data: sub } = await db(supabase)
      .from("submissions")
      .select("id, status")
      .eq("exam_id", examId)
      .eq("student_id", user.id)
      .maybeSingle();

    return {
      id: exam.id,
      title: exam.title,
      classCode: exam.classes?.code ?? "",
      className: exam.classes?.name ?? "",
      start_time: exam.start_time,
      end_time: exam.end_time,
      duration: exam.duration,
      questions_count: exam.questions_count,
      status: exam.status as ExamStatus,
      require_camera: exam.require_camera ?? false,
      existingSubmission: sub ? { id: sub.id, status: sub.status } : null,
    };
  });

// GET: Exam for taking
export const getExamForTaking = createServerFn({ method: "GET" })
  .inputValidator((examId: string) => examId)
  .handler(async ({ data: examId }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: exam, error } = await db(supabase)
      .from("exams")
      .select("id, title, duration, end_time, require_camera, class_id, classes(code)")
      .eq("id", examId)
      .single();

    if (error) throw new Error(error.message);

    // Verify enrollment before exposing any exam content.
    const { data: enrollment } = await db(supabase)
      .from("class_enrollments")
      .select("student_id")
      .eq("class_id", exam.class_id)
      .eq("student_id", user.id)
      .maybeSingle();

    if (!enrollment) throw new Error("You are not enrolled in this exam's class");

    const { data: sub } = await db(supabase)
      .from("submissions")
      .select("id, status, started_at, created_at")
      .eq("exam_id", examId)
      .eq("student_id", user.id)
      .maybeSingle();

    // Remaining time is computed from server timestamps, never the client clock.
    // The effective deadline is the earlier of (a) this attempt's started_at +
    // the per-attempt duration and (b) the exam's hard end_time window. A page
    // refresh re-runs this loader and gets the correctly decremented value, so
    // the countdown can never be reset by reloading.
    const startedAtMs = sub?.started_at
      ? new Date(sub.started_at).getTime()
      : sub?.created_at
        ? new Date(sub.created_at).getTime()
        : Date.now();
    const durationDeadlineMs = startedAtMs + (exam.duration ?? 0) * 60_000;
    const windowDeadlineMs = exam.end_time
      ? new Date(exam.end_time).getTime()
      : Number.POSITIVE_INFINITY;
    // For retakes on closed exams the window has already passed — use only the
    // duration deadline so the student gets their full allotted time.
    const effectiveWindowMs = windowDeadlineMs < Date.now() ? Number.POSITIVE_INFINITY : windowDeadlineMs;
    const deadlineMs = Math.min(durationDeadlineMs, effectiveWindowMs);
    const remainingSeconds = Math.max(
      0,
      Math.floor((deadlineMs - Date.now()) / 1000)
    );

    const { data: eqs, error: eqErr } = await db(supabase)
      .from("exam_questions")
      .select("order_index, questions(id, type, text, points, meta)")
      .eq("exam_id", examId)
      .order("order_index", { ascending: true });

    if (eqErr) throw new Error(eqErr.message);

    // SECURITY: never send answer keys to the client. MCQ.meta.correct,
    // TF.meta.correct, and ESSAY.meta.model_answer/rubric stay server-side
    // (grading reads them again in submitExam). Only expose what the UI renders.
    const sanitizeMeta = (type: string, meta: any) => {
      if (type === "MCQ") return { options: meta?.options ?? [] };
      return null; // TF renders True/False; ESSAY is a free-text box — neither needs meta
    };

    const questions = (eqs ?? []).map((eq: any) => ({
      id: eq.questions.id,
      type: eq.questions.type,
      text: eq.questions.text,
      points: eq.questions.points,
      meta: sanitizeMeta(eq.questions.type, eq.questions.meta),
      order_index: eq.order_index,
    }));

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        classCode: exam.classes?.code ?? "",
        duration: exam.duration,
        end_time: exam.end_time,
        require_camera: exam.require_camera ?? false,
      },
      submission: sub ? { id: sub.id, status: sub.status } : null,
      remainingSeconds,
      deadline:
        deadlineMs === Number.POSITIVE_INFINITY
          ? null
          : new Date(deadlineMs).toISOString(),
      questions,
    };
  });

// POST: Start exam
export const startExam = createServerFn({ method: "POST" })
  .inputValidator((examId: string) => examId)
  .handler(async ({ data: examId }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Verify the exam is live and the student is enrolled before creating a submission.
    const { data: examCheck } = await db(supabase)
      .from("exams")
      .select("status, class_id")
      .eq("id", examId)
      .single();

    if (!examCheck) throw new Error("Exam not found");

    // For non-live exams, only allow if the student has a retake-approved or
    // already-started-retake (in-progress) submission.
    if (examCheck.status !== "live") {
      const { data: retakeCheck } = await db(supabase)
        .from("submissions")
        .select("status")
        .eq("exam_id", examId)
        .eq("student_id", user.id)
        .maybeSingle();
      if (retakeCheck?.status !== "retake-approved" && retakeCheck?.status !== "in-progress") {
        throw new Error("This exam is not currently active");
      }
    }

    const { data: enrollment } = await db(supabase)
      .from("class_enrollments")
      .select("student_id")
      .eq("class_id", examCheck.class_id)
      .eq("student_id", user.id)
      .maybeSingle();

    if (!enrollment) throw new Error("You are not enrolled in this exam's class");

    const existing = await db(supabase)
      .from("submissions")
      .select("id, status, started_at")
      .eq("exam_id", examId)
      .eq("student_id", user.id)
      .maybeSingle();

    if (existing.data) {
      const sub = existing.data;
      // Retake approved by lecturer — reset the submission for a fresh attempt.
      // started_at is re-stamped so the per-attempt timer restarts cleanly.
      if (sub.status === "retake-approved") {
        await Promise.all([
          db(supabase).from("essay_answers").delete().eq("submission_id", sub.id),
          db(supabase).from("flag_reasons").delete().eq("submission_id", sub.id),
        ]);
        await db(supabase)
          .from("submissions")
          .update({ status: "in-progress", score: 0, auto_score: 0, flags: 0, submitted_at: null, started_at: new Date().toISOString(), appeal_required: false })
          .eq("id", sub.id);
        return { submissionId: sub.id as string };
      }
      // Resuming an in-progress attempt that predates the started_at column
      // (or was somehow never stamped): anchor it now so the timer has a base.
      if (sub.status === "in-progress" && !sub.started_at) {
        await db(supabase)
          .from("submissions")
          .update({ started_at: new Date().toISOString() })
          .eq("id", sub.id);
      }
      return { submissionId: sub.id as string };
    }

    const { data: pointRows } = await db(supabase)
      .from("exam_questions")
      .select("questions(points)")
      .eq("exam_id", examId);

    const totalPoints = (pointRows ?? []).reduce(
      (sum: number, eq: any) => sum + (eq.questions?.points ?? 0),
      0
    );

    const { data: sub, error } = await db(supabase)
      .from("submissions")
      .insert({
        exam_id: examId,
        student_id: user.id,
        status: "in-progress",
        total: totalPoints,
        score: 0,
        auto_score: 0,
        flags: 0,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    // 23505 = unique_violation: a concurrent request (double-click) beat us to
    // the insert. Re-fetch and return the existing row so the student lands on
    // the same submission rather than erroring out.
    if (error?.code === "23505") {
      const { data: race } = await db(supabase)
        .from("submissions")
        .select("id")
        .eq("exam_id", examId)
        .eq("student_id", user.id)
        .single();
      if (race) return { submissionId: race.id as string };
    }

    if (error) throw new Error(error.message);

    return { submissionId: sub.id as string };
  });

// POST: Submit exam
export const submitExam = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      examId: string;
      submissionId: string;
      answers: Record<string, string>;
    }) => data
  )
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Load the attempt + exam window before grading so the deadline is decided
    // by the server, not by whatever the client claims its timer said.
    const { data: sub } = await db(supabase)
      .from("submissions")
      .select("id, status, score, started_at, created_at")
      .eq("id", data.submissionId)
      .eq("student_id", user.id)
      .eq("exam_id", data.examId)
      .single();

    if (!sub) throw new Error("Submission not found");

    // Only an in-progress attempt may be finalised. A submission that is already
    // submitted/graded/flagged (e.g. auto-submitted on 3 integrity flags, or a
    // duplicate/replayed submit) must not be re-scored or overwritten.
    if (sub.status !== "in-progress") {
      return { success: true as const, score: sub.score ?? 0 };
    }

    const { data: examRow } = await db(supabase)
      .from("exams")
      .select("duration, end_time")
      .eq("id", data.examId)
      .single();

    const startedAtMs = sub.started_at
      ? new Date(sub.started_at).getTime()
      : sub.created_at
        ? new Date(sub.created_at).getTime()
        : Date.now();
    const durationDeadlineMs =
      startedAtMs + (examRow?.duration ?? 0) * 60_000;
    const windowDeadlineMs = examRow?.end_time
      ? new Date(examRow.end_time).getTime()
      : Number.POSITIVE_INFINITY;
    const deadlineMs = Math.min(durationDeadlineMs, windowDeadlineMs);
    // Grace window absorbs the auto-submit round-trip + minor clock skew so an
    // honest student finishing on the buzzer is not penalised.
    const GRACE_MS = 30_000;
    const lateSubmission = Date.now() > deadlineMs + GRACE_MS;

    const { data: eqs } = await db(supabase)
      .from("exam_questions")
      .select("questions(id, type, points, meta)")
      .eq("exam_id", data.examId);

    let score = 0;
    const allInserts: any[] = [];

    for (const eq of eqs ?? []) {
      const q = eq.questions;
      const studentAnswer = data.answers[q.id] ?? "";

      if (q.type === "MCQ") {
        const letterMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
        const studentIdx = letterMap[studentAnswer];
        const pts = studentIdx !== undefined && studentIdx === q.meta?.correct ? (q.points ?? 1) : 0;
        if (studentIdx !== undefined) score += pts;
        // Guard with studentIdx (not studentAnswer) so invalid letters like "E"
        // are not stored — only A/B/C/D produce a valid row.
        if (studentIdx !== undefined) {
          allInserts.push({ submission_id: data.submissionId, question_id: q.id, answer: studentAnswer, score: pts });
        }
      } else if (q.type === "TF") {
        const studentBool = studentAnswer === "True";
        const pts = studentAnswer !== "" && studentBool === q.meta?.correct ? (q.points ?? 1) : 0;
        if (studentAnswer !== "") score += pts;
        if (studentAnswer) {
          allInserts.push({ submission_id: data.submissionId, question_id: q.id, answer: studentAnswer, score: pts });
        }
      } else if (q.type === "ESSAY") {
        if (studentAnswer.trim()) {
          const truncated = studentAnswer.slice(0, 5000);
          allInserts.push({ submission_id: data.submissionId, question_id: q.id, answer: truncated, score: null });
        }
      }
    }

    if (allInserts.length > 0) {
      const { error: insertErr } = await db(supabase).from("essay_answers").upsert(allInserts, { onConflict: "submission_id,question_id" });
      if (insertErr) throw new Error(insertErr.message);
    }

    // A submission that lands past the server-computed deadline is still graded
    // on the answers received (we never silently discard a student's work), but
    // it is flagged for lecturer review via a flag reason + appeal_required.
    // NOTE: answers are only transmitted at submit time, so the server cannot
    // reconstruct a snapshot of the paper as it stood at the deadline — human
    // review is the backstop for anyone who exploited extra time.
    if (lateSubmission) {
      await db(supabase)
        .from("flag_reasons")
        .insert({
          submission_id: data.submissionId,
          time: new Date().toLocaleTimeString("en-MY", { timeStyle: "short", timeZone: MY_TZ }),
          type: "time-window",
          label: "Submitted after the allotted time",
        });
    }

    const { error } = await db(supabase)
      .from("submissions")
      .update({
        status: "submitted",
        score,
        auto_score: score,
        submitted_at: new Date().toISOString(),
        ...(lateSubmission ? { appeal_required: true } : {}),
      })
      .eq("id", data.submissionId);

    if (error) throw new Error(error.message);

    return { success: true as const, score, lateSubmission };
  });

// GET: Student exam result
export const getStudentExamResult = createServerFn({ method: "GET" })
  .inputValidator((examId: string) => examId)
  .handler(async ({ data: examId }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: exam, error: examErr } = await db(supabase)
      .from("exams")
      .select("id, title, classes(code)")
      .eq("id", examId)
      .single();

    if (examErr) throw new Error(examErr.message);

    const { data: sub, error: subErr } = await db(supabase)
      .from("submissions")
      .select("id, status, score, flags, submitted_at")
      .eq("exam_id", examId)
      .eq("student_id", user.id)
      .maybeSingle();

    if (subErr) throw new Error(subErr.message);
    if (!sub) throw new Error("No submission found for this exam");

    // Compute true total from question points
    const { data: pointRows } = await db(supabase)
      .from("exam_questions")
      .select("questions(points)")
      .eq("exam_id", examId);
    const examTotal = (pointRows ?? []).reduce(
      (sum: number, eq: any) => sum + (eq.questions?.points ?? 0),
      0
    );

    const { data: fr } = await db(supabase)
      .from("flag_reasons")
      .select("time, type, label")
      .eq("submission_id", sub.id);

    // Fetch review data for submitted/graded exams
    let review: any[] = [];
    if (sub.status === "submitted" || sub.status === "graded") {
      const [eqRes, eaRes] = await Promise.all([
        db(supabase)
          .from("exam_questions")
          .select("order_index, questions(id, type, text, points, meta)")
          .eq("exam_id", examId)
          .order("order_index", { ascending: true }),
        db(supabase)
          .from("essay_answers")
          .select("question_id, answer, score")
          .eq("submission_id", sub.id),
      ]);

      const essayMap: Record<string, { answer: string; score: number | null }> = {};
      for (const ea of eaRes.data ?? []) {
        essayMap[ea.question_id] = { answer: ea.answer, score: ea.score };
      }

      review = (eqRes.data ?? []).map((eq: any) => {
        const q = eq.questions;
        const essay = essayMap[q.id] ?? null;
        return {
          orderIndex: eq.order_index,
          id: q.id,
          type: q.type,
          text: q.text,
          points: q.points,
          meta: q.meta,
          essayAnswer: essay?.answer ?? null,
          essayScore: essay?.score ?? null,
        };
      });
    }

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        classCode: exam.classes?.code ?? "",
      },
      submission: {
        id: sub.id,
        status: sub.status,
        score: sub.score,
        total: examTotal,
        flags: sub.flags ?? 0,
        submittedAt: sub.submitted_at,
        flagReasons: (fr ?? []).map((f: any) => ({
          time: f.time,
          type: f.type,
          label: f.label,
        })),
      },
      review,
    };
  });

// Hard-flag types that count toward the 3-strike auto-submit.
// Advisory types (face-missing, camera-lost, gaze-away, head-turned) are recorded
// in flag_reasons for review but must NOT increment the flags counter.
const HARD_FLAG_TYPES = new Set([
  "tab-switch",
  "copy",
  "paste",
  "fullscreen-exit",
  "multiple-faces",
  "screenshot",
  "right-click",
]);

// POST: Record an integrity flag during exam
export const recordFlag = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { submissionId: string; type: string; label: string }) => data
  )
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: sub } = await db(supabase)
      .from("submissions")
      .select("id, flags, status")
      .eq("id", data.submissionId)
      .eq("student_id", user.id)
      .single();

    if (!sub || sub.status !== "in-progress") {
      return { flags: sub?.flags ?? 0, autoSubmitted: false };
    }

    const isHardFlag = HARD_FLAG_TYPES.has(data.type);
    const newFlags = isHardFlag ? (sub.flags ?? 0) + 1 : (sub.flags ?? 0);

    await db(supabase)
      .from("flag_reasons")
      .insert({
        submission_id: data.submissionId,
        time: new Date().toLocaleTimeString("en-MY", { timeStyle: "short", timeZone: MY_TZ }),
        type: data.type,
        label: data.label,
      });

    if (isHardFlag && newFlags >= 3) {
      await db(supabase)
        .from("submissions")
        .update({ flags: newFlags, status: "flagged", score: 0, auto_score: 0, submitted_at: new Date().toISOString() })
        .eq("id", data.submissionId);

      try {
        const { data: subRow } = await db(supabase)
          .from("submissions")
          .select("exam_id, exams(title, classes(lecturer_id))")
          .eq("id", data.submissionId)
          .single();
        const examTitle = (subRow as any)?.exams?.title ?? "exam";
        const lecturerId = (subRow as any)?.exams?.classes?.lecturer_id;
        await pushNotification(supabase, {
          userId: user.id,
          type: "exam_flagged",
          title: "Exam auto-submitted",
          body: `Your exam "${examTitle}" was auto-submitted due to 3 integrity flags. You have 7 days to file an appeal.`,
          link: `/student/exams`,
        });
        // Notify the lecturer so they can review the flagged submission promptly.
        if (lecturerId) {
          await pushNotification(supabase, {
            userId: lecturerId,
            type: "exam_flagged",
            title: "Student exam auto-submitted",
            body: `A student's "${examTitle}" exam was auto-submitted after 3 integrity flags.`,
            link: `/lecturer/exams/${subRow?.exam_id}/results`,
          }).catch(() => {});
        }
        await writeAudit(user.id, {
          action: "Exam auto-submitted (integrity)",
          target: examTitle,
          category: "integrity",
        });
      } catch {}

      return { flags: newFlags, autoSubmitted: true };
    }

    await db(supabase)
      .from("submissions")
      .update({ flags: newFlags })
      .eq("id", data.submissionId);

    return { flags: newFlags, autoSubmitted: false };
  });

// GET: All exams (admin)
export const getAllExamsAdmin = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await db(supabase)
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") throw new Error("Forbidden");

    const { data: exams, error } = await db(supabase)
      .from("exams")
      .select("id, title, status, questions_count, start_time, created_at, classes(code, name, profiles!lecturer_id(name))")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return (exams ?? []).map((e: any) => ({
      id: e.id,
      title: e.title,
      classCode: e.classes?.code ?? "",
      className: e.classes?.name ?? "",
      lecturerName: e.classes?.profiles?.name ?? "",
      status: e.status,
      questions_count: e.questions_count,
      start_time: e.start_time,
      created_at: e.created_at,
    }));
  }
);

// POST: run the exam status state machine on demand. pg_cron runs this every
// minute server-side (see scripts/migrate-exam-lifecycle.ts); this endpoint is a
// fallback so an external scheduler — or the app itself — can drive transitions
// (upcoming → live → closed → graded) where pg_cron isn't enabled.
export const syncExamStatuses = createServerFn({ method: "POST" }).handler(
  async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Any authenticated user may trigger this — it is the fallback driver for
    // exam lifecycle transitions when pg_cron is not enabled. The RPC itself is
    // idempotent and safe to call repeatedly; the only risk is DB load, which
    // the function handles internally.
    if (!user) throw new Error("Unauthorized");

    const { error } = await db(supabase).rpc("sync_exam_statuses");
    if (error) throw new Error(error.message);

    return { ok: true as const };
  }
);
