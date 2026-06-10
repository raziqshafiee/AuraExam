import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";

const db = (supabase: ReturnType<typeof createClient>) => supabase as any;
const dbAdmin = (client: ReturnType<typeof createAdminClient>) => client as any;

// GET: platform-wide integrity log — all submissions where flags > 0.
// Uses service role to bypass per-student RLS. Admin observe-only.
export const getAdminIntegrityLog = createServerFn({ method: "GET" })
  .inputValidator((data: { page?: number; statusFilter?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const role = user.user_metadata?.role as string;
    if (role !== "admin") throw new Error("Forbidden");

    const admin = createAdminClient();
    const PAGE_SIZE = 25;
    const page = data.page ?? 1;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = dbAdmin(admin)
      .from("submissions")
      .select(
        "id, flags, status, submitted_at, profiles!student_id(name), exams(title, classes(code, profiles!lecturer_id(name)))",
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

// Creates a user via the admin API (no confirmation email, no rate limit).
// Auto-confirms the email so the user can sign in immediately.
export const registerUser = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string; name: string; role: string }) => data)
  .handler(async ({ data }) => {
    const safeRole = data.role === "lecturer" ? "lecturer" : "student";
    const admin = createAdminClient();

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      user_metadata: { name: data.name, role: safeRole },
      email_confirm: true,
    });
    if (authError) throw new Error(authError.message);

    const { error: profileError } = await admin.from("profiles").upsert(
      { id: authData.user.id, name: data.name, role: safeRole, status: "active" },
      { onConflict: "id", ignoreDuplicates: true }
    );
    if (profileError) throw new Error(profileError.message);

    return { role: safeRole as "student" | "lecturer" };
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
