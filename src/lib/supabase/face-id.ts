import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";
import { writeAudit } from "./audit";
import { pushNotification } from "./notifications";
import { cosineSimilarity } from "@/lib/face-id/compare";
import { nextRegistrationOutcome, canRequestPhotoChange } from "@/lib/face-id/business-rules";
import { FACE_ID } from "@/lib/constants";
import { signExamToken } from "./exam-session-token";

const db = (supabase: ReturnType<typeof createClient>) => supabase as any;

const FACIAL_PROFILES_BUCKET = "facial-profiles";

function base64ToBuffer(base64: string): Buffer {
  const clean = base64.includes(",") ? base64.split(",")[1] : base64;
  return Buffer.from(clean, "base64");
}

// POST: upload a passport photo. Does not lock/verify — that happens in
// verifyEnrolment once the live-frame match succeeds.
export const registerPassportPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: { photoBase64: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await db(supabase)
      .from("user_facial_profiles")
      .select("is_photo_locked")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.is_photo_locked) {
      throw new Error("Your photo is locked. Request a photo change first.");
    }

    const admin = createAdminClient();
    const path = `${user.id}/passport.jpg`;
    const { error: uploadError } = await admin.storage
      .from(FACIAL_PROFILES_BUCKET)
      .upload(path, base64ToBuffer(data.photoBase64), { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    await db(supabase)
      .from("user_facial_profiles")
      .upsert({ user_id: user.id, photo_url: path, status: profile ? undefined : "UNREGISTERED" });

    return { photoPath: path };
  });

// POST: unlock a locked, verified profile for one new registration cycle,
// subject to the 90-day cooldown and 48-hour pre-exam freeze window.
export const requestPhotoChange = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await db(supabase)
    .from("user_facial_profiles")
    .select("status, is_photo_locked, last_photo_update")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "VERIFIED" || !profile.is_photo_locked) {
    throw new Error("No locked photo to change.");
  }

  const { data: examRows } = await db(supabase)
    .from("submissions")
    .select("exams(start_time)")
    .eq("student_id", user.id);
  const upcomingStarts = (examRows ?? [])
    .map((r: any) => r.exams?.start_time)
    .filter(Boolean)
    .map((s: string) => new Date(s));

  const check = canRequestPhotoChange(
    profile.last_photo_update ? new Date(profile.last_photo_update) : null,
    upcomingStarts,
    new Date(),
    FACE_ID.COOLDOWN_DAYS,
    FACE_ID.FREEZE_HOURS,
  );
  if (!check.allowed) throw new Error(check.reason);

  await db(supabase)
    .from("user_facial_profiles")
    .update({ is_photo_locked: false, verification_attempts: 0 })
    .eq("user_id", user.id);

  return { unlocked: true as const };
});

// POST: 1:1 match between the passport-photo embedding and a live webcam
// embedding. Server-authoritative — the client's own locally-computed score,
// if any, is never trusted.
export const verifyEnrolment = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      passportEmbedding: number[];
      liveEmbedding: number[];
      livenessPassed: boolean;
      liveSnapshotBase64?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await db(supabase)
      .from("user_facial_profiles")
      .select("verification_attempts, is_photo_locked")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.is_photo_locked) {
      throw new Error("Your photo is already locked and verified.");
    }

    const score = cosineSimilarity(data.passportEmbedding, data.liveEmbedding);
    const effectiveScore = data.livenessPassed ? score : 0;
    const outcome = nextRegistrationOutcome(
      profile?.verification_attempts ?? 0,
      effectiveScore,
      FACE_ID.MATCH_THRESHOLD,
      FACE_ID.MAX_ENROLL_ATTEMPTS,
    );

    if (outcome.status === "VERIFIED") {
      await db(supabase)
        .from("user_facial_profiles")
        .upsert({
          user_id: user.id,
          status: "VERIFIED",
          baseline_embedding: data.liveEmbedding,
          pending_embedding: null,
          is_photo_locked: true,
          verification_attempts: 0,
          last_photo_update: new Date().toISOString(),
          rejection_reason: null,
        });
      await writeAudit(user.id, {
        action: "Face ID registration verified",
        target: user.id,
        category: "identity",
      });
      return { status: "VERIFIED" as const, score };
    }

    if (outcome.status === "PENDING_REVIEW") {
      if (data.liveSnapshotBase64) {
        const admin = createAdminClient();
        await admin.storage
          .from(FACIAL_PROFILES_BUCKET)
          .upload(`${user.id}/review-${Date.now()}.jpg`, base64ToBuffer(data.liveSnapshotBase64), {
            contentType: "image/jpeg",
            upsert: true,
          });
      }
      await db(supabase)
        .from("user_facial_profiles")
        .upsert({
          user_id: user.id,
          status: "PENDING_REVIEW",
          pending_embedding: data.liveEmbedding,
          verification_attempts: FACE_ID.MAX_ENROLL_ATTEMPTS,
        });
      await writeAudit(user.id, {
        action: "Face ID registration sent to manual review",
        target: user.id,
        category: "identity",
      });
      return { status: "PENDING_REVIEW" as const, score };
    }

    await db(supabase)
      .from("user_facial_profiles")
      .upsert({
        user_id: user.id,
        status: "UNREGISTERED",
        verification_attempts: FACE_ID.MAX_ENROLL_ATTEMPTS - outcome.attemptsRemaining,
      });
    return { status: "RETRY" as const, score, attemptsRemaining: outcome.attemptsRemaining };
  });

async function signedFacialProfileUrls(userId: string): Promise<{ photoUrl: string | null; snapshotUrl: string | null }> {
  const admin = createAdminClient();
  const { data: files } = await admin.storage.from(FACIAL_PROFILES_BUCKET).list(userId, {
    limit: 100,
    sortBy: { column: "name", order: "desc" },
  });
  const names = (files ?? []).map((f: any) => f.name);
  const passportName = names.find((n: string) => n === "passport.jpg");
  const snapshotName = names.find((n: string) => n.startsWith("review-"));

  const paths = [passportName, snapshotName].filter(Boolean).map((n) => `${userId}/${n}`);
  if (paths.length === 0) return { photoUrl: null, snapshotUrl: null };

  const { data: signed } = await admin.storage.from(FACIAL_PROFILES_BUCKET).createSignedUrls(paths, 60 * 30);
  const urlFor = (name?: string) =>
    name ? (signed ?? []).find((s: any) => s.path === `${userId}/${name}`)?.signedUrl ?? null : null;

  return { photoUrl: urlFor(passportName), snapshotUrl: urlFor(snapshotName) };
}

// GET: PENDING_REVIEW registrations. Admin sees every profile; a lecturer
// sees only students enrolled in a class they teach.
export const getFacialReviewQueue = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: me } = await db(supabase).from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin" && me?.role !== "lecturer") throw new Error("Unauthorized");

  const admin = createAdminClient();
  let query = admin
    .from("user_facial_profiles")
    .select("user_id, verification_attempts, profiles!user_id(name, email)")
    .eq("status", "PENDING_REVIEW");

  if (me.role === "lecturer") {
    const { data: rosterRows } = await admin
      .from("class_enrollments")
      .select("student_id, classes!inner(lecturer_id)")
      .eq("classes.lecturer_id", user.id);
    const studentIds = [...new Set((rosterRows ?? []).map((r: any) => r.student_id))];
    if (studentIds.length === 0) return [];
    query = query.in("user_id", studentIds);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  return Promise.all(
    (rows ?? []).map(async (r: any) => {
      const { photoUrl, snapshotUrl } = await signedFacialProfileUrls(r.user_id);
      return {
        userId: r.user_id as string,
        name: r.profiles?.name ?? "Unknown",
        email: r.profiles?.email ?? "",
        photoUrl,
        snapshotUrl,
      };
    }),
  );
});

// POST: approve/reject a PENDING_REVIEW registration.
export const reviewFacialProfile = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string; action: "APPROVE" | "REJECT"; reason?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: me } = await db(supabase).from("profiles").select("role").eq("id", user.id).single();
    if (me?.role !== "admin" && me?.role !== "lecturer") throw new Error("Unauthorized");

    const admin = createAdminClient();

    if (me.role === "lecturer") {
      const { data: enrolled } = await admin
        .from("class_enrollments")
        .select("student_id, classes!inner(lecturer_id)")
        .eq("student_id", data.userId)
        .eq("classes.lecturer_id", user.id)
        .maybeSingle();
      if (!enrolled) throw new Error("Forbidden");
    }

    const { data: profile } = await admin
      .from("user_facial_profiles")
      .select("status, pending_embedding")
      .eq("user_id", data.userId)
      .single();
    if (!profile || profile.status !== "PENDING_REVIEW") {
      throw new Error("This profile is not awaiting review.");
    }

    if (data.action === "APPROVE") {
      await admin
        .from("user_facial_profiles")
        .update({
          status: "VERIFIED",
          baseline_embedding: profile.pending_embedding,
          pending_embedding: null,
          is_photo_locked: true,
          approved_by: user.id,
          last_photo_update: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq("user_id", data.userId);
      await writeAudit(user.id, {
        action: `Approved Face ID registration for ${data.userId}`,
        target: data.userId,
        category: "identity",
      });
      await pushNotification(supabase, {
        userId: data.userId,
        type: "face_id_approved",
        title: "Face ID approved",
        body: "Your Face ID registration was approved by a reviewer.",
      }).catch(() => {});
    } else {
      await admin
        .from("user_facial_profiles")
        .update({
          status: "REJECTED",
          pending_embedding: null,
          rejection_reason: data.reason ?? null,
          verification_attempts: 0,
        })
        .eq("user_id", data.userId);
      await writeAudit(user.id, {
        action: `Rejected Face ID registration for ${data.userId}`,
        target: data.userId,
        category: "identity",
      });
      await pushNotification(supabase, {
        userId: data.userId,
        type: "face_id_rejected",
        title: "Face ID registration rejected",
        body: data.reason ?? "Please re-register with a clearer photo.",
      }).catch(() => {});
    }

    return { ok: true as const };
  });

// Explicit return type breaks the circular type-inference that would
// otherwise result from checkInExam recursively calling itself below (the
// 23505-retry path) inside its own handler.
type CheckInExamResult =
  | { outcome: "verified"; submissionId: string; token: string }
  | { outcome: "retry"; submissionId: string; score: number; attemptsRemaining: number }
  | { outcome: "checkin-pending-review"; submissionId: string };

// POST: exam-day check-in. Server-authoritative 1:1 match between the
// student's verified baseline embedding and a fresh live embedding captured
// at the exam lobby. On success mints a short-lived signed token that
// startExam requires before it will admit the student.
export const checkInExam = createServerFn({ method: "POST" })
  .inputValidator((data: { examId: string; embedding: number[] }) => data)
  .handler(async ({ data }): Promise<CheckInExamResult> => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await db(supabase)
      .from("user_facial_profiles")
      .select("status, baseline_embedding")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.status !== "VERIFIED" || !profile.baseline_embedding) {
      throw new Error("Your Face ID profile isn't verified yet — contact your lecturer.");
    }

    const { data: exam } = await db(supabase)
      .from("exams")
      .select("class_id, duration, end_time, require_identity_verification")
      .eq("id", data.examId)
      .single();
    if (!exam) throw new Error("Exam not found");
    if (!exam.require_identity_verification) throw new Error("This exam does not require Face ID check-in.");

    const { data: enrollment } = await db(supabase)
      .from("class_enrollments")
      .select("student_id")
      .eq("class_id", exam.class_id)
      .eq("student_id", user.id)
      .maybeSingle();
    if (!enrollment) throw new Error("You are not enrolled in this exam's class");

    const deadlineMs = exam.end_time
      ? new Date(exam.end_time).getTime()
      : Date.now() + (exam.duration ?? 0) * 60_000;
    const mintToken = (submissionId: string) =>
      signExamToken({ sub: user.id, examId: data.examId, submissionId }, new Date(deadlineMs + FACE_ID.TOKEN_BUFFER_MS));

    const existing = await db(supabase)
      .from("submissions")
      .select("id, checkin_status, checkin_attempts")
      .eq("exam_id", data.examId)
      .eq("student_id", user.id)
      .maybeSingle();

    if (existing.data) {
      const sub = existing.data;
      if (sub.checkin_status === "verified") {
        return { outcome: "verified" as const, submissionId: sub.id, token: await mintToken(sub.id) };
      }
      if (sub.checkin_status === "rejected") {
        throw new Error("Your check-in was rejected. Contact your lecturer.");
      }
      if ((sub.checkin_attempts ?? 0) >= FACE_ID.MAX_CHECKIN_ATTEMPTS) {
        return { outcome: "checkin-pending-review" as const, submissionId: sub.id };
      }

      const score = cosineSimilarity(profile.baseline_embedding as number[], data.embedding);
      const attempts = (sub.checkin_attempts ?? 0) + 1;

      if (score >= FACE_ID.MATCH_THRESHOLD) {
        await db(supabase)
          .from("submissions")
          .update({
            checkin_status: "verified",
            check_in_score: score,
            checkin_attempts: attempts,
            checked_in_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
        return { outcome: "verified" as const, submissionId: sub.id, token: await mintToken(sub.id) };
      }
      if (attempts >= FACE_ID.MAX_CHECKIN_ATTEMPTS) {
        await db(supabase)
          .from("submissions")
          .update({ checkin_status: "checkin-pending-review", check_in_score: score, checkin_attempts: attempts })
          .eq("id", sub.id);
        return { outcome: "checkin-pending-review" as const, submissionId: sub.id };
      }
      await db(supabase)
        .from("submissions")
        .update({ check_in_score: score, checkin_attempts: attempts })
        .eq("id", sub.id);
      return {
        outcome: "retry" as const,
        submissionId: sub.id,
        score,
        attemptsRemaining: FACE_ID.MAX_CHECKIN_ATTEMPTS - attempts,
      };
    }

    // First attempt for this (student, exam) pair. Insert with
    // status='checkin-pending' and started_at left unset — startExam later
    // transitions this to 'in-progress' and stamps started_at only once the
    // student is actually admitted, so time spent checking in (including any
    // manual-review wait) never eats into the exam's allotted duration.
    const score = cosineSimilarity(profile.baseline_embedding as number[], data.embedding);
    const passed = score >= FACE_ID.MATCH_THRESHOLD;
    const { data: sub, error } = await db(supabase)
      .from("submissions")
      .insert({
        exam_id: data.examId,
        student_id: user.id,
        status: "checkin-pending",
        total: 0,
        score: 0,
        auto_score: 0,
        flags: 0,
        checkin_status: passed ? "verified" : "pending",
        check_in_score: score,
        checkin_attempts: 1,
        checked_in_at: passed ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error?.code === "23505") {
      return checkInExam({ data });
    }
    if (error) throw new Error(error.message);

    if (passed) {
      return { outcome: "verified" as const, submissionId: sub.id, token: await mintToken(sub.id) };
    }
    return {
      outcome: "retry" as const,
      submissionId: sub.id,
      score,
      attemptsRemaining: FACE_ID.MAX_CHECKIN_ATTEMPTS - 1,
    };
  });
