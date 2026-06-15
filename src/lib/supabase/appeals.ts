import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { pushNotification } from "./notifications";
import { writeAudit } from "./audit";
import { APPEAL } from "@/lib/constants";

const db = (supabase: ReturnType<typeof createClient>) => supabase;

export type AppealType = "score" | "integrity";
export type AppealStatus = "pending" | "approved" | "rejected";

export type Appeal = {
  id: string;
  submissionId: string;
  examId: string;
  examTitle: string;
  classCode: string;
  type: AppealType;
  reason: string;
  status: AppealStatus;
  submissionStatus: string;
  lecturerReply: string | null;
  submittedAt: string;
  decidedAt: string | null;
  deadlineAt: string;
};

export type LecturerAppeal = Appeal & {
  studentName: string;
  studentId: string;
  submissionScore: number | null;
  submissionAutoScore: number;
  submissionTotal: number | null;
  submissionFlags: number;
};

// ── Badge count: pending appeals (student = own, lecturer = to review) ───────
export const getPendingAppealsCount = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { count: 0 };

  // Read role from profiles (RLS-locked), never user_metadata (client-mutable).
  const { data: profile } = await db(supabase)
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role as string;

  if (role === "student") {
    const { count } = await db(supabase)
      .from("appeals")
      .select("id", { count: "exact", head: true })
      .eq("student_id", user.id)
      .eq("status", "pending");
    return { count: count ?? 0 };
  }

  if (role === "lecturer") {
    const { data: classes } = await db(supabase)
      .from("classes")
      .select("id")
      .eq("lecturer_id", user.id);
    const classIds = (classes ?? []).map((c: any) => c.id);
    if (classIds.length === 0) return { count: 0 };

    const { data: exams } = await db(supabase)
      .from("exams")
      .select("id")
      .in("class_id", classIds);
    const examIds = (exams ?? []).map((e: any) => e.id);
    if (examIds.length === 0) return { count: 0 };

    const { count } = await db(supabase)
      .from("appeals")
      .select("id", { count: "exact", head: true })
      .in("exam_id", examIds)
      .eq("status", "pending");
    return { count: count ?? 0 };
  }

  return { count: 0 };
});

// ── Student: submit a new appeal ─────────────────────────────────────────────
export const submitAppeal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { submissionId: string; examId: string; type: AppealType; reason: string }) => data
  )
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Verify submission belongs to this student
    const { data: sub, error: subErr } = await db(supabase)
      .from("submissions")
      .select("id, submitted_at, status, auto_score, score")
      .eq("id", data.submissionId)
      .eq("student_id", user.id)
      .single();

    if (subErr || !sub) throw new Error("Submission not found");

    // Enforce 7-day window from submission
    const submittedAt = new Date(sub.submitted_at);
    const deadline = new Date(submittedAt.getTime() + APPEAL.WINDOW_MS);
    if (new Date() > deadline) {
      throw new Error("Appeal window has closed (7 days after submission)");
    }

    // Integrity appeals only valid when submission was flagged
    if (data.type === "integrity" && sub.status !== "flagged") {
      throw new Error("Integrity appeals are only for flagged submissions");
    }

    const { data: appeal, error } = await db(supabase)
      .from("appeals")
      .insert({
        submission_id: data.submissionId,
        exam_id: data.examId,
        student_id: user.id,
        type: data.type,
        reason: data.reason,
        status: "pending",
        deadline_at: deadline.toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("You have already submitted a " + data.type + " appeal for this exam");
      }
      throw new Error(error.message);
    }

    // Notify the exam's lecturer
    try {
      const { data: examRow } = await db(supabase)
        .from("exams")
        .select("title, classes(lecturer_id)")
        .eq("id", data.examId)
        .single();
      const { data: profileRow } = await db(supabase)
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single();
      const lecturerId = examRow?.classes?.lecturer_id;
      const studentName = profileRow?.name ?? "A student";
      const examTitle = examRow?.title ?? "an exam";
      if (lecturerId) {
        const appealLabel = data.type === "integrity" ? "integrity appeal" : "score appeal";
        await pushNotification(supabase, {
          userId: lecturerId,
          type: "appeal_submitted",
          title: `New ${appealLabel}`,
          body: `${studentName} submitted a ${appealLabel} for "${examTitle}"`,
          link: "/lecturer/appeals",
        });
      }
    } catch {}

    return { id: appeal.id as string };
  });

// ── Student: list own appeals ─────────────────────────────────────────────────
export const getStudentAppeals = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: rows, error } = await db(supabase)
    .from("appeals")
    .select("*, exams(title, classes(code)), submissions!submission_id(status)")
    .eq("student_id", user.id)
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (rows ?? []).map((r: any) => ({
    id: r.id,
    submissionId: r.submission_id,
    examId: r.exam_id,
    examTitle: r.exams?.title ?? "",
    classCode: r.exams?.classes?.code ?? "",
    type: r.type as AppealType,
    reason: r.reason,
    status: r.status as AppealStatus,
    submissionStatus: r.submissions?.status ?? "",
    lecturerReply: r.lecturer_reply ?? null,
    submittedAt: r.submitted_at,
    decidedAt: r.decided_at ?? null,
    deadlineAt: r.deadline_at,
  })) as Appeal[];
});

// ── Student: list submissions eligible for appeal ─────────────────────────────
// Submissions submitted/graded/flagged within the last 7 days
export const getAppealableSubmissions = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const cutoff = new Date(Date.now() - APPEAL.WINDOW_MS).toISOString();

  const { data: rows, error } = await db(supabase)
    .from("submissions")
    .select("id, exam_id, status, score, auto_score, submitted_at, exams(title, classes(code))")
    .eq("student_id", user.id)
    .in("status", ["submitted", "graded", "flagged"])
    .gte("submitted_at", cutoff)
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Fetch already-filed appeals to disable duplicate types in the UI
  const subIds = (rows ?? []).map((r: any) => r.id);
  let existingAppeals: any[] = [];
  if (subIds.length > 0) {
    const { data: ea } = await db(supabase)
      .from("appeals")
      .select("submission_id, type, status")
      .in("submission_id", subIds);
    existingAppeals = ea ?? [];
  }

  return (rows ?? []).map((r: any) => {
    const filed = existingAppeals.filter((a: any) => a.submission_id === r.id);
    return {
      submissionId: r.id,
      examId: r.exam_id,
      examTitle: r.exams?.title ?? "",
      classCode: r.exams?.classes?.code ?? "",
      status: r.status as string,
      score: r.score as number | null,
      autoScore: (r.auto_score ?? 0) as number,
      submittedAt: r.submitted_at as string,
      deadlineAt: new Date(
        new Date(r.submitted_at).getTime() + APPEAL.WINDOW_MS
      ).toISOString(),
      filedAppeals: filed.map((a: any) => ({
        type: a.type as AppealType,
        status: a.status as AppealStatus,
      })),
    };
  });
});

// ── Lecturer: fetch questions + student answers for a score dispute ───────────
export const getAppealSubmissionReview = createServerFn({ method: "GET" })
  .inputValidator((data: { submissionId: string; examId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Verify lecturer owns this exam
    const { data: examRow } = await db(supabase)
      .from("exams")
      .select("id, classes(lecturer_id)")
      .eq("id", data.examId)
      .single();
    if (examRow?.classes?.lecturer_id !== user.id) throw new Error("Forbidden");

    const [eqRes, eaRes] = await Promise.all([
      db(supabase)
        .from("exam_questions")
        .select("order_index, questions(id, type, text, points, meta)")
        .eq("exam_id", data.examId)
        .order("order_index", { ascending: true }),
      db(supabase)
        .from("essay_answers")
        .select("question_id, answer, score")
        .eq("submission_id", data.submissionId),
    ]);

    const answerMap: Record<string, { answer: string | null; score: number | null }> = {};
    for (const ea of eaRes.data ?? []) {
      answerMap[ea.question_id] = { answer: ea.answer, score: ea.score };
    }

    return (eqRes.data ?? []).map((eq: any) => {
      const q = eq.questions;
      const ea = answerMap[q.id] ?? null;
      return {
        orderIndex: eq.order_index as number,
        id: q.id as string,
        type: q.type as "MCQ" | "TF" | "ESSAY",
        text: q.text as string,
        points: q.points as number,
        meta: q.meta as any,
        studentAnswer: ea?.answer ?? null,
        studentScore: ea?.score ?? null,
      };
    });
  });

// ── Lecturer: list appeals queue (paginated, integrity first) ─────────────────
export const getLecturerAppeals = createServerFn({ method: "GET" })
  .inputValidator((data: { page?: number; statusFilter?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const PAGE_SIZE = 20;
    const page = data.page ?? 1;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Fetch lecturer's class IDs first to avoid nested subquery issues
    const { data: classes } = await db(supabase)
      .from("classes")
      .select("id")
      .eq("lecturer_id", user.id);

    const classIds = (classes ?? []).map((c: any) => c.id);
    if (classIds.length === 0) {
      return { appeals: [], totalCount: 0, page, pageSize: PAGE_SIZE, totalPages: 0 };
    }

    const { data: examRows } = await db(supabase)
      .from("exams")
      .select("id")
      .in("class_id", classIds);

    const examIds = (examRows ?? []).map((e: any) => e.id);
    if (examIds.length === 0) {
      return { appeals: [], totalCount: 0, page, pageSize: PAGE_SIZE, totalPages: 0 };
    }

    let query = db(supabase)
      .from("appeals")
      .select(
        "*, exams(title, classes(code)), profiles!student_id(name), submissions!submission_id(score, auto_score, total, flags, status)",
        { count: "exact" }
      )
      .in("exam_id", examIds)
      .order("status", { ascending: true })   // pending first
      .order("type", { ascending: false })     // integrity before score
      .order("submitted_at", { ascending: true })
      .range(from, to);

    if (data.statusFilter && data.statusFilter !== "all") {
      query = query.eq("status", data.statusFilter);
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);

    const appeals: LecturerAppeal[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      submissionId: r.submission_id,
      examId: r.exam_id,
      examTitle: r.exams?.title ?? "",
      classCode: r.exams?.classes?.code ?? "",
      type: r.type as AppealType,
      reason: r.reason,
      status: r.status as AppealStatus,
      lecturerReply: r.lecturer_reply ?? null,
      submittedAt: r.submitted_at,
      decidedAt: r.decided_at ?? null,
      deadlineAt: r.deadline_at,
      studentName: r.profiles?.name ?? "Unknown",
      studentId: r.student_id,
      submissionScore: r.submissions?.score ?? null,
      submissionAutoScore: r.submissions?.auto_score ?? 0,
      submissionTotal: r.submissions?.total ?? null,
      submissionFlags: r.submissions?.flags ?? 0,
    }));

    return {
      appeals,
      totalCount: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
    };
  });

// ── Lecturer: approve or reject an appeal ─────────────────────────────────────
export const resolveAppeal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { appealId: string; decision: "approved" | "rejected"; lecturerReply: string; newScore?: number }) => data
  )
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: appeal, error: fetchErr } = await db(supabase)
      .from("appeals")
      .select("*, submissions!submission_id(id, auto_score, score, status)")
      .eq("id", data.appealId)
      .single();

    if (fetchErr || !appeal) throw new Error("Appeal not found");
    if (appeal.status !== "pending") throw new Error("Appeal already resolved");

    // Verify lecturer owns this exam
    const { data: examRow } = await db(supabase)
      .from("exams")
      .select("id, title, classes(lecturer_id)")
      .eq("id", appeal.exam_id)
      .single();

    if (examRow?.classes?.lecturer_id !== user.id) throw new Error("Forbidden");

    const { error: updateErr } = await db(supabase)
      .from("appeals")
      .update({
        status: data.decision,
        lecturer_reply: data.lecturerReply,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.appealId);

    if (updateErr) throw new Error(updateErr.message);

    // Integrity appeal approved → unlock retake (score stays 0 until they retake)
    if (data.decision === "approved" && appeal.type === "integrity") {
      const { error: subErr } = await db(supabase)
        .from("submissions")
        .update({ status: "retake-approved", appeal_required: false })
        .eq("id", appeal.submission_id);
      if (subErr) throw new Error(subErr.message);
    }

    // Score dispute approved → update submission score with lecturer's corrected value
    if (data.decision === "approved" && appeal.type === "score") {
      if (data.newScore === undefined) throw new Error("Corrected score is required");
      const { error: subErr } = await db(supabase)
        .from("submissions")
        .update({ score: data.newScore })
        .eq("id", appeal.submission_id);
      if (subErr) throw new Error(subErr.message);
    }

    // Notify the student of the decision
    try {
      const studentId = appeal.student_id;
      if (studentId) {
        const appealLabel = appeal.type === "integrity" ? "integrity appeal" : "score appeal";
        if (data.decision === "approved") {
          await pushNotification(supabase, {
            userId: studentId,
            type: "appeal_approved",
            title: "Appeal approved",
            body: appeal.type === "integrity"
              ? "Your integrity appeal was approved. You may now retake the exam."
              : `Your score appeal was approved. New score: ${data.newScore} pts.`,
            link: "/student/appeals",
          });
        } else {
          await pushNotification(supabase, {
            userId: studentId,
            type: "appeal_rejected",
            title: "Appeal rejected",
            body: `Your ${appealLabel} was reviewed and rejected.`,
            link: "/student/appeals",
          });
        }
      }
    } catch {}

    const examTitle = examRow?.title ?? appeal.exam_id;
    const appealTypeLabel = appeal.type === "integrity" ? "integrity appeal" : "score appeal";
    await writeAudit(user.id, {
      action: data.decision === "approved" ? "Approved appeal" : "Rejected appeal",
      target: `${examTitle} — ${appealTypeLabel}`,
      category: "appeal",
    });

    return { success: true as const, decision: data.decision };
  });
