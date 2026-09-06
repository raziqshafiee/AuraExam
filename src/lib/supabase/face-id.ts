import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";
import { writeAudit } from "./audit";
import { pushNotification } from "./notifications";
import { cosineSimilarity } from "@/lib/face-id/compare";
import { nextRegistrationOutcome, canRequestPhotoChange } from "@/lib/face-id/business-rules";
import { FACE_ID } from "@/lib/constants";
import { signExamToken } from "./exam-session-token";
import { MY_TZ } from "@/lib/datetime";
import { PROCTOR_SNAPSHOT_BUCKET } from "./proctor";

const db = (supabase: ReturnType<typeof createClient>) => supabase as any;

const FACIAL_PROFILES_BUCKET = "facial-profiles";

// user_facial_profiles is RLS-protected with an owner-SELECT policy and NO
// write policy (see scripts/migrate-face-id-rls.ts): reads may run in the
// caller's context, but every write must go through the service-role client
// or a student could self-verify by PATCHing status='VERIFIED' onto their own
// row. Same rule for the check-in columns on `submissions`, whose UPDATE
// privilege has been revoked from `authenticated`.

function base64ToBuffer(base64: string): Buffer {
  const clean = base64.includes(",") ? base64.split(",")[1] : base64;
  return Buffer.from(clean, "base64");
}

// Shared by getMyFacialProfile (display) and requestPhotoChange
// (enforcement) so the two can never disagree. Looks at every exam in every
// class the student is enrolled in — not just exams they already have a
// submissions row for — so the 48-hour freeze also covers an upcoming exam
// they haven't checked into yet.
async function getPhotoChangeEligibility(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  lastPhotoUpdate: string | null,
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: enrollRows } = await db(supabase)
    .from("class_enrollments")
    .select("classes(exams(start_time))")
    .eq("student_id", userId);
  const upcomingStarts = (enrollRows ?? [])
    .flatMap((r: any) => r.classes?.exams ?? [])
    .map((e: any) => e.start_time)
    .filter(Boolean)
    .map((s: string) => new Date(s));

  return canRequestPhotoChange(
    lastPhotoUpdate ? new Date(lastPhotoUpdate) : null,
    upcomingStarts,
    new Date(),
    FACE_ID.COOLDOWN_DAYS,
    FACE_ID.FREEZE_HOURS,
  );
}

export type MyFacialProfile = {
  status: "UNREGISTERED" | "VERIFIED" | "PENDING_REVIEW" | "REJECTED";
  rejectionReason: string | null;
  isPhotoLocked: boolean;
  photoUrl: string | null;
  lastPhotoUpdate: string | null;
  photoChangeEligible: boolean;
  photoChangeReason: string | null;
};

// GET: the caller's own Face ID registration status, so the student page can
// show where they stand instead of always restarting at the upload step.
// Reads run in the caller's context — the owner-SELECT RLS policy is what
// scopes this to their own row. photoUrl is a 30-minute signed URL to the
// registered passport photo — used to show it as the profile picture.
export const getMyFacialProfile = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyFacialProfile> => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await db(supabase)
      .from("user_facial_profiles")
      .select("status, rejection_reason, is_photo_locked, last_photo_update")
      .eq("user_id", user.id)
      .maybeSingle();

    const { photoUrl } = profile ? await signedFacialProfileUrls(user.id) : { photoUrl: null };

    let photoChangeEligible = false;
    let photoChangeReason: string | null = null;
    if (profile?.status === "VERIFIED" && profile.is_photo_locked) {
      const check = await getPhotoChangeEligibility(supabase, user.id, profile.last_photo_update);
      photoChangeEligible = check.allowed;
      photoChangeReason = check.reason ?? null;
    }

    return {
      status: (profile?.status ?? "UNREGISTERED") as MyFacialProfile["status"],
      rejectionReason: profile?.rejection_reason ?? null,
      isPhotoLocked: profile?.is_photo_locked ?? false,
      photoUrl,
      lastPhotoUpdate: profile?.last_photo_update ?? null,
      photoChangeEligible,
      photoChangeReason,
    };
  },
);

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

    await admin
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

  const check = await getPhotoChangeEligibility(supabase, user.id, profile.last_photo_update);
  if (!check.allowed) throw new Error(check.reason);

  await createAdminClient()
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

    const admin = createAdminClient();

    if (outcome.status === "VERIFIED") {
      await admin.from("user_facial_profiles").upsert({
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
        await admin.storage
          .from(FACIAL_PROFILES_BUCKET)
          .upload(`${user.id}/review-${Date.now()}.jpg`, base64ToBuffer(data.liveSnapshotBase64), {
            contentType: "image/jpeg",
            upsert: true,
          });
      }
      await admin.from("user_facial_profiles").upsert({
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

    await admin.from("user_facial_profiles").upsert({
      user_id: user.id,
      status: "UNREGISTERED",
      verification_attempts: FACE_ID.MAX_ENROLL_ATTEMPTS - outcome.attemptsRemaining,
    });
    return { status: "RETRY" as const, score, attemptsRemaining: outcome.attemptsRemaining };
  });

// Signs the two images a reviewer needs side by side: the registered passport
// photo and the most recent live snapshot matching `snapshotPrefix`. Snapshot
// filenames embed a millisecond timestamp, so a descending name sort puts the
// newest one first.
async function signedFacialProfileUrls(
  userId: string,
  snapshotPrefix = "review-",
): Promise<{ photoUrl: string | null; snapshotUrl: string | null }> {
  const admin = createAdminClient();
  const { data: files } = await admin.storage.from(FACIAL_PROFILES_BUCKET).list(userId, {
    limit: 1000,
    sortBy: { column: "name", order: "desc" },
  });
  const names = (files ?? []).map((f: any) => f.name);
  const passportName = names.find((n: string) => n === "passport.jpg");
  const snapshotName = names.find((n: string) => n.startsWith(snapshotPrefix));

  const paths = [passportName, snapshotName].filter(Boolean).map((n) => `${userId}/${n}`);
  if (paths.length === 0) return { photoUrl: null, snapshotUrl: null };

  const { data: signed } = await admin.storage
    .from(FACIAL_PROFILES_BUCKET)
    .createSignedUrls(paths, 60 * 30);
  const urlFor = (name?: string) =>
    name
      ? ((signed ?? []).find((s: any) => s.path === `${userId}/${name}`)?.signedUrl ?? null)
      : null;

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

  const { data: me } = await db(supabase)
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin" && me?.role !== "lecturer") throw new Error("Unauthorized");

  const admin = createAdminClient();
  let query = admin
    .from("user_facial_profiles")
    .select("user_id, verification_attempts, profiles!user_id(name)")
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

  // profiles has no email column — emails live in auth.users, matched here
  // the same way getAllUsers (users.ts) does it.
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  return Promise.all(
    (rows ?? []).map(async (r: any) => {
      const { photoUrl, snapshotUrl } = await signedFacialProfileUrls(r.user_id);
      return {
        userId: r.user_id as string,
        name: r.profiles?.name ?? "Unknown",
        email: emailMap.get(r.user_id) ?? "",
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

    const { data: me } = await db(supabase)
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
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
  .inputValidator(
    (data: { examId: string; embedding: number[]; liveSnapshotBase64?: string }) => data,
  )
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
      .select("status, class_id, duration, end_time, require_identity_verification")
      .eq("id", data.examId)
      .single();
    if (!exam) throw new Error("Exam not found");
    if (!exam.require_identity_verification)
      throw new Error("This exam does not require Face ID check-in.");
    // Mirrors startExam's own window guard: checking in before the exam opens
    // (or after it closes) would leave an orphaned 'checkin-pending' row that
    // can never be started.
    if (exam.status !== "live") throw new Error("This exam is not open for check-in yet.");

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
      signExamToken(
        { sub: user.id, examId: data.examId, submissionId },
        new Date(deadlineMs + FACE_ID.TOKEN_BUFFER_MS),
      );

    // The check-in columns on `submissions` are server-owned — UPDATE on them
    // is revoked from `authenticated`, so every write below runs service-role.
    const admin = createAdminClient();

    // Evidence for the invigilator queue: the live frame that failed to match,
    // stored next to the student's registered passport photo. Best-effort —
    // losing the snapshot must never block the check-in decision itself.
    const uploadCheckinSnapshot = async (submissionId: string) => {
      if (!data.liveSnapshotBase64) return;
      await admin.storage
        .from(FACIAL_PROFILES_BUCKET)
        .upload(
          `${user.id}/checkin-${submissionId}-${Date.now()}.jpg`,
          base64ToBuffer(data.liveSnapshotBase64),
          { contentType: "image/jpeg", upsert: true },
        )
        .catch(() => {});
    };

    const existing = await db(supabase)
      .from("submissions")
      .select("id, checkin_status, checkin_attempts, checkin_rejection_reason")
      .eq("exam_id", data.examId)
      .eq("student_id", user.id)
      .maybeSingle();

    if (existing.data) {
      const sub = existing.data;
      if (sub.checkin_status === "verified") {
        return {
          outcome: "verified" as const,
          submissionId: sub.id,
          token: await mintToken(sub.id),
        };
      }

      // A rejected check-in no longer dead-ends the attempt — the student gets
      // a fresh round of biometric attempts, exactly like a first check-in.
      // If those run out again it goes back to manual review, where the
      // lecturer/admin can clear or reject it again.
      if (sub.checkin_status === "rejected") {
        const score = cosineSimilarity(profile.baseline_embedding as number[], data.embedding);

        if (score >= FACE_ID.MATCH_THRESHOLD) {
          await admin
            .from("submissions")
            .update({
              checkin_status: "verified",
              check_in_score: score,
              checkin_attempts: 1,
              checkin_rejection_reason: null,
              checked_in_at: new Date().toISOString(),
            })
            .eq("id", sub.id);
          return {
            outcome: "verified" as const,
            submissionId: sub.id,
            token: await mintToken(sub.id),
          };
        }

        await admin
          .from("submissions")
          .update({
            checkin_status: "pending",
            check_in_score: score,
            checkin_attempts: 1,
            checkin_rejection_reason: null,
          })
          .eq("id", sub.id);
        return {
          outcome: "retry" as const,
          submissionId: sub.id,
          score,
          attemptsRemaining: FACE_ID.MAX_CHECKIN_ATTEMPTS - 1,
        };
      }

      const attemptsSoFar = sub.checkin_attempts ?? 0;

      if (attemptsSoFar >= FACE_ID.MAX_CHECKIN_ATTEMPTS) {
        return { outcome: "checkin-pending-review" as const, submissionId: sub.id };
      }

      const score = cosineSimilarity(profile.baseline_embedding as number[], data.embedding);
      const attempts = attemptsSoFar + 1;

      if (score >= FACE_ID.MATCH_THRESHOLD) {
        await admin
          .from("submissions")
          .update({
            checkin_status: "verified",
            check_in_score: score,
            checkin_attempts: attempts,
            checked_in_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
        return {
          outcome: "verified" as const,
          submissionId: sub.id,
          token: await mintToken(sub.id),
        };
      }
      if (attempts >= FACE_ID.MAX_CHECKIN_ATTEMPTS) {
        await admin
          .from("submissions")
          .update({
            checkin_status: "checkin-pending-review",
            check_in_score: score,
            checkin_attempts: attempts,
          })
          .eq("id", sub.id);
        await uploadCheckinSnapshot(sub.id);
        return { outcome: "checkin-pending-review" as const, submissionId: sub.id };
      }
      await admin
        .from("submissions")
        .update({ checkin_status: "pending", check_in_score: score, checkin_attempts: attempts })
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
    const { data: sub, error } = await admin
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

export const getCheckinQueue = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: me } = await db(supabase)
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin" && me?.role !== "lecturer") throw new Error("Unauthorized");

  const admin = createAdminClient();
  let query = admin
    .from("submissions")
    .select(
      "id, check_in_score, student_id, profiles!student_id(name), exams!inner(title, classes!inner(lecturer_id))",
    )
    .eq("checkin_status", "checkin-pending-review");

  if (me.role === "lecturer") {
    query = query.eq("exams.classes.lecturer_id", user.id);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  return Promise.all(
    (rows ?? []).map(async (r: any) => {
      // Registered passport photo + the live frame captured when this
      // student's check-in ran out of attempts, so the invigilator compares
      // the same two faces the matcher did.
      const { photoUrl, snapshotUrl } = await signedFacialProfileUrls(
        r.student_id,
        `checkin-${r.id}-`,
      );
      return {
        submissionId: r.id as string,
        studentName: r.profiles?.name ?? "Unknown",
        examTitle: r.exams?.title ?? "Untitled exam",
        score: r.check_in_score as number | null,
        photoUrl,
        snapshotUrl,
      };
    }),
  );
});

export const reviewCheckin = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { submissionId: string; action: "clear" | "reject"; reason?: string }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: me } = await db(supabase)
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (me?.role !== "admin" && me?.role !== "lecturer") throw new Error("Unauthorized");

    const admin = createAdminClient();

    if (me.role === "lecturer") {
      const { data: owned } = await admin
        .from("submissions")
        .select("id, exams!inner(classes!inner(lecturer_id))")
        .eq("id", data.submissionId)
        .eq("exams.classes.lecturer_id", user.id)
        .maybeSingle();
      if (!owned) throw new Error("Forbidden");
    }

    await admin
      .from("submissions")
      .update({
        checkin_status: data.action === "clear" ? "verified" : "rejected",
        checkin_rejection_reason: data.action === "reject" ? (data.reason ?? null) : null,
        ...(data.action === "clear" ? { checked_in_at: new Date().toISOString() } : {}),
      })
      .eq("id", data.submissionId);

    await writeAudit(user.id, {
      action: `${data.action === "clear" ? "Cleared" : "Rejected"} exam check-in for submission ${data.submissionId}`,
      target: data.submissionId,
      category: "identity",
    });

    return { ok: true as const };
  });

// POST: periodic in-exam identity continuity check. Called on an interval
// while the student is taking an exam that requires identity verification.
// Server-authoritative — always recomputes the match from the DB-stored
// baseline embedding rather than trusting any client-reported result.
export const checkIdentityContinuity = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { submissionId: string; embedding: number[]; snapshotBase64?: string }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: sub } = await db(supabase)
      .from("submissions")
      .select("id, status, student_id")
      .eq("id", data.submissionId)
      .eq("student_id", user.id)
      .maybeSingle();
    if (!sub || sub.status !== "in-progress") return { match: true as const, score: 1 };

    const { data: profile } = await db(supabase)
      .from("user_facial_profiles")
      .select("baseline_embedding")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile?.baseline_embedding) return { match: true as const, score: 1 };

    const score = cosineSimilarity(profile.baseline_embedding as number[], data.embedding);
    const match = score >= FACE_ID.MATCH_THRESHOLD;

    if (!match) {
      const admin = createAdminClient();

      // Store the frame that failed the re-check so the lecturer can see who
      // was actually in front of the camera. Same bucket + path convention as
      // the rest of the proctor snapshots ({submissionId}/{timestamp}.jpg).
      let snapshotUrl: string | null = null;
      if (data.snapshotBase64) {
        const path = `${data.submissionId}/${Date.now()}.jpg`;
        const { error: uploadError } = await admin.storage
          .from(PROCTOR_SNAPSHOT_BUCKET)
          .upload(path, base64ToBuffer(data.snapshotBase64), {
            contentType: "image/jpeg",
            upsert: true,
          });
        if (!uploadError) snapshotUrl = path;
      }

      await admin.from("flag_reasons").insert({
        submission_id: data.submissionId,
        time: new Date().toLocaleTimeString("en-MY", {
          timeStyle: "short",
          timeZone: MY_TZ,
        }),
        type: "identity-mismatch",
        label: "Identity re-check did not match the registered profile",
        confidence_score: score,
        snapshot_url: snapshotUrl,
      });
    }

    return { match, score };
  });
