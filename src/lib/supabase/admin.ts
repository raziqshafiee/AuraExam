import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { requireRole } from "./authz";
import { createAdminClient } from "./admin-client";
import { writeAudit } from "./audit";

const db = (supabase: ReturnType<typeof createClient>) => supabase;
const dbAdmin = (client: ReturnType<typeof createAdminClient>) => client;

// GET: platform-wide integrity log — all submissions where flags > 0.
// Uses service role to bypass per-student RLS. Admin observe-only.
export const getAdminIntegrityLog = createServerFn({ method: "GET" })
  .inputValidator((data: { page?: number; statusFilter?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    await requireRole("admin", supabase);

    const admin = createAdminClient();
    const PAGE_SIZE = 25;
    const page = data.page ?? 1;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = dbAdmin(admin)
      .from("submissions")
      .select(
        "id, flags, status, submitted_at, reviewed_at, profiles!student_id(name), reviewer:profiles!reviewed_by(name), exams(title, classes(code, profiles!lecturer_id(name)))",
        { count: "exact" }
      )
      .gt("flags", 0)
      .order("submitted_at", { ascending: false })
      .range(from, to);

    if (data.statusFilter === "flagged") query = query.eq("status", "flagged");
    if (data.statusFilter === "active")  query = query.neq("status", "flagged");

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);

    const subIds = (rows ?? []).map((r: any) => r.id);
    let flagsBySubmission: Record<string, { type: string; label: string; time: string }[]> = {};
    if (subIds.length > 0) {
      const { data: fr } = await dbAdmin(admin)
        .from("flag_reasons")
        .select("submission_id, type, label, time")
        .in("submission_id", subIds)
        .order("created_at", { ascending: true });
      for (const row of fr ?? []) {
        if (!flagsBySubmission[row.submission_id]) flagsBySubmission[row.submission_id] = [];
        flagsBySubmission[row.submission_id].push({ type: row.type, label: row.label, time: row.time });
      }
    }

    const records = (rows ?? []).map((r: any) => ({
      id: r.id as string,
      studentName: r.profiles?.name ?? "Unknown",
      examTitle: r.exams?.title ?? "",
      classCode: r.exams?.classes?.code ?? "",
      lecturerName: r.exams?.classes?.profiles?.name ?? "Unknown",
      flags: r.flags as number,
      status: r.status as string,
      submittedAt: r.submitted_at as string | null,
      reviewedAt: r.reviewed_at as string | null,
      reviewerName: r.reviewer?.name ?? null,
      flagReasons: flagsBySubmission[r.id] ?? [],
    }));

    return {
      records,
      totalCount: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
    };
  });

// Manually clear a flagged submission from the "needs attention" queues when no
// appeal was ever filed for it (an appeal resolution already marks it reviewed —
// see resolveAppeal). Does not change submission.status: the flag stays on the
// record as history, only reviewed_at/reviewed_by change.
export const dismissFlag = createServerFn({ method: "POST" })
  .inputValidator((submissionId: string) => submissionId)
  .handler(async ({ data: submissionId }) => {
    const supabase = createClient();
    const { user } = await requireRole("admin", supabase);

    const admin = createAdminClient();
    const { data: sub } = await dbAdmin(admin)
      .from("submissions")
      .select("status, profiles!student_id(name), exams(title)")
      .eq("id", submissionId)
      .single();

    if (!sub) throw new Error("Submission not found");
    if (sub.status !== "flagged") throw new Error("Only auto-submitted (flagged) submissions can be dismissed");

    const { error } = await dbAdmin(admin)
      .from("submissions")
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq("id", submissionId);
    if (error) throw new Error(error.message);

    await writeAudit(user.id, {
      action: "Dismissed integrity flag",
      target: `${sub.profiles?.name ?? "Unknown"} — ${sub.exams?.title ?? ""}`,
      category: "integrity",
    });

    return { success: true };
  });

// Server function so process.env.SUPABASE_SERVICE_ROLE_KEY is always available.
// Restricts role to student/lecturer; admin can only be granted via seed scripts.
export const createUserProfile = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; name: string; role: string }) => data)
  .handler(async ({ data }) => {
    const safeRole = ["student", "lecturer"].includes(data.role) ? data.role : "student";
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").upsert(
      { id: data.id, name: data.name, role: safeRole, status: "active" },
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (error) throw new Error(error.message);
    return { success: true };
  });
