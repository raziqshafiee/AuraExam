import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";

const db = (supabase: ReturnType<typeof createAdminClient>) => supabase;

export type InsightsRange = 7 | 30 | 90;

function dayKey(iso: string) {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function daysBack(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const SCORE_BUCKETS = [
  { label: "0–49", min: 0, max: 49 },
  { label: "50–59", min: 50, max: 59 },
  { label: "60–69", min: 60, max: 69 },
  { label: "70–79", min: 70, max: 79 },
  { label: "80–89", min: 80, max: 89 },
  { label: "90–100", min: 90, max: 100 },
];

function bucketFor(pct: number) {
  const b = SCORE_BUCKETS.find((b) => pct >= b.min && pct <= b.max);
  return b?.label ?? SCORE_BUCKETS[0].label;
}

export const getAdminInsightsData = createServerFn({ method: "GET" })
  .inputValidator((data: { days: InsightsRange }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if ((profile as any)?.role !== "admin") throw new Error("Unauthorized");

    // Platform-wide analytics need every user's submissions/appeals, not just the
    // admin's own — submissions/essay_answers/appeals have no admin SELECT RLS
    // policy, so this must go through the service-role client (same pattern as
    // users.ts/audit.ts), never the cookie-scoped one used for the auth check above.
    const adminDb = createAdminClient();

    const days = data.days;
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const sinceIso = since.toISOString();
    const dateSeries = daysBack(days);

    const [
      { data: submissionsRaw },
      { data: essaysRaw },
      { data: appealsRaw },
      { data: lecturers },
      { data: classes },
      { data: exams },
      { data: pendingEssaysRaw },
    ] = await Promise.all([
      db(adminDb)
        .from("submissions")
        .select("id, exam_id, student_id, status, score, total, flags, submitted_at, profiles!student_id(name), exams(title, created_by, classes(code))")
        .gte("submitted_at", sinceIso),
      db(adminDb)
        .from("essay_answers")
        .select("id, submission_id, graded_at, submissions(exam_id, submitted_at, exams(created_by))")
        .gte("graded_at", sinceIso),
      db(adminDb)
        .from("appeals")
        .select("id, exam_id, status, submitted_at, exams(created_by)")
        .gte("submitted_at", sinceIso),
      db(adminDb).from("profiles").select("id, name").eq("role", "lecturer"),
      db(adminDb).from("classes").select("id, lecturer_id"),
      db(adminDb).from("exams").select("id, created_by"),
      db(adminDb)
        .from("essay_answers")
        .select("id, submission_id, submissions!inner(status, exam_id, exams(created_by))")
        .is("score", null)
        .eq("submissions.status", "submitted"),
    ]);

    const submissions = (submissionsRaw as any[]) ?? [];
    const essays = (essaysRaw as any[]) ?? [];
    const appeals = (appealsRaw as any[]) ?? [];
    const pendingEssays = (pendingEssaysRaw as any[]) ?? [];

    // ── System ──────────────────────────────────────────────────
    const dailyTrendMap: Record<string, { submitted: number; flagged: number }> = {};
    for (const d of dateSeries) dailyTrendMap[d] = { submitted: 0, flagged: 0 };
    for (const s of submissions) {
      const key = dayKey(s.submitted_at);
      if (!dailyTrendMap[key]) continue;
      if (s.status === "flagged") dailyTrendMap[key].flagged++;
      else dailyTrendMap[key].submitted++;
    }
    const dailyTrend = dateSeries.map((d) => ({ date: d, ...dailyTrendMap[d] }));

    const turnaroundHours: number[] = [];
    for (const e of essays) {
      const sub = e.submissions;
      if (!sub?.submitted_at || !e.graded_at) continue;
      const hrs = (new Date(e.graded_at).getTime() - new Date(sub.submitted_at).getTime()) / 3_600_000;
      if (hrs >= 0) turnaroundHours.push(hrs);
    }
    const turnaroundAvgHours = turnaroundHours.length
      ? turnaroundHours.reduce((a, b) => a + b, 0) / turnaroundHours.length
      : null;

    const flaggedCount = submissions.filter((s) => s.status === "flagged").length;
    const flagRatePct = submissions.length ? (flaggedCount / submissions.length) * 100 : 0;

    const appealOutcomes = { pending: 0, approved: 0, rejected: 0 };
    for (const a of appeals) {
      if (a.status === "pending") appealOutcomes.pending++;
      else if (a.status === "approved") appealOutcomes.approved++;
      else if (a.status === "rejected") appealOutcomes.rejected++;
    }

    // ── Students ────────────────────────────────────────────────
    const scored = submissions.filter((s) => (s.status === "submitted" || s.status === "graded") && s.total > 0);

    const scoreDistMap: Record<string, number> = {};
    for (const b of SCORE_BUCKETS) scoreDistMap[b.label] = 0;
    for (const s of scored) {
      const pct = Math.round((s.score / s.total) * 100);
      scoreDistMap[bucketFor(pct)]++;
    }
    const scoreDistribution = SCORE_BUCKETS.map((b) => ({ bucket: b.label, count: scoreDistMap[b.label] }));

    const avgScoreTrendMap: Record<string, { sum: number; count: number }> = {};
    for (const d of dateSeries) avgScoreTrendMap[d] = { sum: 0, count: 0 };
    for (const s of scored) {
      const key = dayKey(s.submitted_at);
      if (!avgScoreTrendMap[key]) continue;
      avgScoreTrendMap[key].sum += (s.score / s.total) * 100;
      avgScoreTrendMap[key].count++;
    }
    const avgScoreTrend = dateSeries.map((d) => ({
      date: d,
      avgPct: avgScoreTrendMap[d].count ? Math.round(avgScoreTrendMap[d].sum / avgScoreTrendMap[d].count) : null,
    }));

    const studentAgg: Record<string, { name: string; examsTaken: number; scoreSum: number; scoreCount: number; flags: number }> = {};
    for (const s of submissions) {
      const id = s.student_id as string;
      if (!studentAgg[id]) studentAgg[id] = { name: s.profiles?.name ?? "Unknown", examsTaken: 0, scoreSum: 0, scoreCount: 0, flags: 0 };
      studentAgg[id].examsTaken++;
      studentAgg[id].flags += s.flags ?? 0;
      if ((s.status === "submitted" || s.status === "graded") && s.total > 0) {
        studentAgg[id].scoreSum += (s.score / s.total) * 100;
        studentAgg[id].scoreCount++;
      }
    }
    const studentTable = Object.entries(studentAgg)
      .map(([id, v]) => ({
        studentId: id,
        name: v.name,
        examsTaken: v.examsTaken,
        avgScorePct: v.scoreCount ? Math.round(v.scoreSum / v.scoreCount) : null,
        totalFlags: v.flags,
      }))
      .sort((a, b) => b.examsTaken - a.examsTaken);

    // ── Lecturers ───────────────────────────────────────────────
    const examLecturer: Record<string, string> = {};
    for (const e of (exams as any[]) ?? []) examLecturer[e.id] = e.created_by;

    const turnaroundByLecturerAll: Record<string, number[]> = {};
    const turnaroundTrendMap: Record<string, { sum: number; count: number }> = {};
    for (const d of dateSeries) turnaroundTrendMap[d] = { sum: 0, count: 0 };
    for (const e of essays) {
      const sub = e.submissions;
      const lecturerId = sub?.exams?.created_by;
      if (!sub?.submitted_at || !e.graded_at) continue;
      const hrs = (new Date(e.graded_at).getTime() - new Date(sub.submitted_at).getTime()) / 3_600_000;
      if (hrs < 0) continue;
      const key = dayKey(e.graded_at);
      if (turnaroundTrendMap[key]) {
        turnaroundTrendMap[key].sum += hrs;
        turnaroundTrendMap[key].count++;
      }
      if (lecturerId) {
        (turnaroundByLecturerAll[lecturerId] ??= []).push(hrs);
      }
    }
    const turnaroundTrend = dateSeries.map((d) => ({
      date: d,
      avgHours: turnaroundTrendMap[d].count ? Math.round((turnaroundTrendMap[d].sum / turnaroundTrendMap[d].count) * 10) / 10 : null,
    }));

    const submissionsByLecturer: Record<string, number> = {};
    for (const s of submissions) {
      const lecturerId = s.exams?.created_by;
      if (lecturerId) submissionsByLecturer[lecturerId] = (submissionsByLecturer[lecturerId] ?? 0) + 1;
    }
    const appealsByLecturer: Record<string, number> = {};
    for (const a of appeals) {
      const lecturerId = a.exams?.created_by;
      if (lecturerId) appealsByLecturer[lecturerId] = (appealsByLecturer[lecturerId] ?? 0) + 1;
    }

    const classCountByLecturer: Record<string, number> = {};
    for (const c of (classes as any[]) ?? []) {
      if (c.lecturer_id) classCountByLecturer[c.lecturer_id] = (classCountByLecturer[c.lecturer_id] ?? 0) + 1;
    }
    const examCountByLecturer: Record<string, number> = {};
    for (const e of (exams as any[]) ?? []) {
      if (e.created_by) examCountByLecturer[e.created_by] = (examCountByLecturer[e.created_by] ?? 0) + 1;
    }
    const pendingEssaysByLecturer: Record<string, number> = {};
    for (const pe of pendingEssays) {
      const lecturerId = pe.submissions?.exams?.created_by;
      if (lecturerId) pendingEssaysByLecturer[lecturerId] = (pendingEssaysByLecturer[lecturerId] ?? 0) + 1;
    }

    const totalAppealsAgg = Object.values(appealsByLecturer).reduce((a, b) => a + b, 0);
    const totalSubmissionsAgg = Object.values(submissionsByLecturer).reduce((a, b) => a + b, 0);
    const appealRatePct = totalSubmissionsAgg ? (totalAppealsAgg / totalSubmissionsAgg) * 100 : 0;

    const lecturerTable = ((lecturers as any[]) ?? []).map((l: any) => {
      const hrsList = turnaroundByLecturerAll[l.id] ?? [];
      const subCount = submissionsByLecturer[l.id] ?? 0;
      const appealCount = appealsByLecturer[l.id] ?? 0;
      return {
        lecturerId: l.id as string,
        name: l.name as string,
        classCount: classCountByLecturer[l.id] ?? 0,
        examCount: examCountByLecturer[l.id] ?? 0,
        pendingEssays: pendingEssaysByLecturer[l.id] ?? 0,
        avgTurnaroundHours: hrsList.length ? Math.round((hrsList.reduce((a, b) => a + b, 0) / hrsList.length) * 10) / 10 : null,
        appealRatePct: subCount ? Math.round((appealCount / subCount) * 1000) / 10 : null,
      };
    }).sort((a, b) => b.examCount - a.examCount);

    return {
      days,
      system: {
        dailyTrend,
        turnaroundAvgHours: turnaroundAvgHours !== null ? Math.round(turnaroundAvgHours * 10) / 10 : null,
        flagRatePct: Math.round(flagRatePct * 10) / 10,
        appealVolume: appeals.length,
        appealOutcomes,
      },
      students: {
        scoreDistribution,
        avgScoreTrend,
        table: studentTable,
      },
      lecturers: {
        turnaroundTrend,
        appealRatePct: Math.round(appealRatePct * 10) / 10,
        table: lecturerTable,
      },
    };
  });
