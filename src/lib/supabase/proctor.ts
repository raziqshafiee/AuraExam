import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";

const db = (supabase: ReturnType<typeof createClient>) => supabase as any;

export const PROCTOR_SNAPSHOT_BUCKET = "proctor-snapshots";

// Advisory proctor event types. These are recorded for lecturer review but are
// deliberately NOT counted toward the 3-strike auto-submit (recordFlag) — face
// detection is noisy, so they inform human review rather than automatically
// zeroing an exam. Note: multiple-faces was promoted to a hard flag (recordFlag).
const ADVISORY_TYPES = new Set(["face-missing", "camera-lost", "gaze-away", "head-turned"]);

// POST: heartbeat — proves the exam tab is still open. The client pings this on
// an interval; a stale last_seen_at means the student likely disconnected.
export const recordHeartbeat = createServerFn({ method: "POST" })
  .inputValidator((submissionId: string) => submissionId)
  .handler(async ({ data: submissionId }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Only stamp while the attempt is live and owned by the caller. RLS already
    // restricts UPDATE to the owning student; the status guard avoids touching
    // already-submitted rows.
    await db(supabase)
      .from("submissions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", submissionId)
      .eq("student_id", user.id)
      .eq("status", "in-progress");

    return { ok: true as const };
  });

// POST: advisory proctor event (e.g. face missing / multiple faces). Recorded as
// a flag_reason for lecturer review WITHOUT bumping the integrity flag counter or
// triggering auto-submit. Client-side detection is bypassable, so this is
// deterrence + evidence, not enforcement.
export const recordProctorEvent = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { submissionId: string; type: string; label: string }) => data
  )
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const type = ADVISORY_TYPES.has(data.type) ? data.type : "face-missing";

    // Confirm the submission belongs to the caller and is still in progress.
    const { data: sub } = await db(supabase)
      .from("submissions")
      .select("id, status")
      .eq("id", data.submissionId)
      .eq("student_id", user.id)
      .maybeSingle();

    if (!sub || sub.status !== "in-progress") {
      return { recorded: false as const };
    }

    await db(supabase)
      .from("flag_reasons")
      .insert({
        submission_id: data.submissionId,
        time: new Date().toLocaleTimeString("en-MY", { timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" }),
        type,
        label: data.label?.slice(0, 200) || "Proctor event",
      });

    return { recorded: true as const };
  });

// GET: all flag_reasons for a submission. Lecturer-only — used in appeal review
// so the lecturer can see exactly what triggered each integrity flag.
export const getSubmissionFlagReasons = createServerFn({ method: "GET" })
  .inputValidator((submissionId: string) => submissionId)
  .handler(async ({ data: submissionId }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: sub } = await db(supabase)
      .from("submissions")
      .select("id, exams(classes(lecturer_id))")
      .eq("id", submissionId)
      .single();

    if (!sub) throw new Error("Submission not found");
    if (sub.exams?.classes?.lecturer_id !== user.id) throw new Error("Forbidden");

    const { data: rows, error } = await db(supabase)
      .from("flag_reasons")
      .select("type, label, time")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    return (rows ?? []) as { type: string; label: string; time: string }[];
  });

// GET: signed URLs for a submission's face snapshots. Authorised for the owning
// student or the lecturer of the exam's class (storage RLS enforces the same).
export const getProctorSnapshots = createServerFn({ method: "GET" })
  .inputValidator((submissionId: string) => submissionId)
  .handler(async ({ data: submissionId }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Authorisation: owner student OR lecturer of the class.
    const { data: sub } = await db(supabase)
      .from("submissions")
      .select("id, student_id, exams(classes(lecturer_id))")
      .eq("id", submissionId)
      .single();

    if (!sub) throw new Error("Submission not found");
    const lecturerId = sub.exams?.classes?.lecturer_id;
    if (sub.student_id !== user.id && lecturerId !== user.id) {
      throw new Error("Forbidden");
    }

    const { data: files } = await db(supabase).storage
      .from(PROCTOR_SNAPSHOT_BUCKET)
      .list(submissionId, {
        limit: 100,
        sortBy: { column: "name", order: "asc" },
      });

    const paths = (files ?? [])
      .filter((f: any) => f.name && !f.name.startsWith("."))
      .map((f: any) => `${submissionId}/${f.name}`);

    if (paths.length === 0) return { snapshots: [] as { url: string; takenAt: string | null }[] };

    const { data: signed } = await db(supabase).storage
      .from(PROCTOR_SNAPSHOT_BUCKET)
      .createSignedUrls(paths, 60 * 30); // 30-minute links

    const snapshots = (signed ?? [])
      .filter((s: any) => s.signedUrl)
      .map((s: any) => {
        // Filename is the capture timestamp in ms: "{ts}.jpg"
        const base = (s.path ?? "").split("/").pop() ?? "";
        const tsMatch = base.match(/^(\d+)/);
        const takenAt = tsMatch ? new Date(Number(tsMatch[1])).toISOString() : null;
        return { url: s.signedUrl as string, takenAt };
      });

    return { snapshots };
  });
