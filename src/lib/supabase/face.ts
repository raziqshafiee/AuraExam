// src/lib/supabase/face.ts
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";
import { pushNotification } from "./notifications";
import { writeAudit } from "./audit";
import { getFaceSettings } from "./settings";
import { cosine, l2normalize, bestMatch, parseVector } from "@/lib/face/similarity";
import { MODEL_VERSION } from "@/lib/face/human-config";
import { nameSimilarity, isPlausibleMatric } from "@/lib/face/name-match";
import { ocrMatricCard } from "@/lib/face/ocr";

const db = (supabase: ReturnType<typeof createClient>) => supabase;

const CHALLENGE_STEPS: readonly string[][] = [
  ["blink_twice"],
  ["turn_left"],
  ["turn_right"],
  ["blink_once", "turn_right"],
  ["blink_once", "turn_left"],
];
const CHALLENGE_TTL_MS = 90_000;

// Pure so it's cheaply unit-testable without mocking the DB. `priorRejectedCount`
// must be the count of this user's rejected face_enrollments rows that existed
// BEFORE the current attempt began — the "+1" accounts for the current attempt
// itself, regardless of which exit path (recordAttempt vs. the main handler's
// band-routing return) ultimately reports it.
export function computeAttemptsRemaining(maxAttempts: number, priorRejectedCount: number): number {
  return Math.max(0, maxAttempts - (priorRejectedCount + 1));
}

// POST: issue a randomized, single-use liveness challenge.
export const faceChallenge = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const steps = CHALLENGE_STEPS[Math.floor(Math.random() * CHALLENGE_STEPS.length)];
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("face_challenges")
    .insert({ user_id: user.id, steps, expires_at: expiresAt })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { challengeId: data.id as string, steps, expiresAt };
});

type EnrollInput = {
  // Card and profile-photo descriptors/images are null/empty ONLY for
  // supervised enrollments (Task 7) — physical lecturer supervision replaces
  // both. For the normal (student self-serve) path, both are required.
  embeddingCard: number[] | null;
  embeddingProfile: number[] | null;
  embeddingSamples: number[][]; // live-capture descriptors (liveness-proof side)
  cardImageBase64: string; // uploaded matric card FRONT photo — OCR'd, then stored as evidence
  profileImageBase64: string; // uploaded profile/selfie photo — the primary high-quality reference face
  matricNo: string; // only used on the supervised path (no card to OCR there)
  challengeId: string;
  challengeStepsCompleted: string[];
  antispoofScore: number;
  livenessScore: number;
  sessionId?: string; // present only for supervised enrollments (Task 7)
};

export const faceEnroll = createServerFn({ method: "POST" })
  .inputValidator((data: EnrollInput) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const settings = await getFaceSettings();
    const admin = createAdminClient();

    // 0. Prior rejected-attempt count for this user, queried once up front so
    // attemptsRemaining reflects real history rather than a constant. "+1" in
    // the formula below accounts for the current attempt, whichever exit path
    // it takes (recordAttempt's early liveness/antispoof failure, or the main
    // band-routing path landing on "rejected").
    const { count: priorRejectedCountRaw } = await (admin as any)
      .from("face_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "rejected");
    const priorRejectedCount = priorRejectedCountRaw ?? 0;

    // 1. Challenge validation — unexpired, unconsumed, belongs to this user,
    // steps actually completed. Consumed immediately so it cannot be replayed.
    const { data: challenge } = await (admin as any)
      .from("face_challenges")
      .select("id, user_id, steps, expires_at, consumed_at")
      .eq("id", data.challengeId)
      .maybeSingle();

    const isSupervised = !!data.sessionId;
    // Set inside the supervised-window validation below (section 2) so the
    // audit trail and supervised_by column record who actually authorized
    // the card-bypass — the lecturer who opened the window (session.opened_by)
    // — never the student's own id.
    let supervisorId: string | null = null;

    if (!isSupervised) {
      if (!challenge || challenge.user_id !== user.id || challenge.consumed_at) {
        throw new Error("Invalid or already-used challenge");
      }
      if (new Date(challenge.expires_at) < new Date()) {
        throw new Error("Challenge expired — please retry");
      }
      const allStepsDone = (challenge.steps as string[]).every((s) =>
        data.challengeStepsCompleted.includes(s),
      );
      if (!allStepsDone) throw new Error("Liveness challenge was not completed");
      await (admin as any)
        .from("face_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", challenge.id);
    }

    // Antispoof/liveness enforced UNCONDITIONALLY — the physical-presence
    // assumption of a supervised window doesn't eliminate the value of
    // confirming a live, non-spoofed face was actually presented (and the
    // liveness challenge itself is skipped entirely for supervised
    // enrollments, so this is the only spoof defense left on that path).
    if (data.antispoofScore < settings.antispoofMin || data.livenessScore < settings.livenessMin) {
      return await recordAttempt(
        admin,
        user.id,
        "Liveness/antispoof check failed",
        settings,
        priorRejectedCount,
      );
    }

    // 2. Supervised-window validation, if this is a supervised enrollment
    // (Task 7 opens these windows). Physical supervision replaces card provenance.
    if (isSupervised) {
      const { data: session } = await (admin as any)
        .from("face_enrollment_sessions")
        .select("id, class_id, target_user, expires_at, closed_at, opened_by")
        .eq("id", data.sessionId)
        .maybeSingle();
      const now = new Date();
      const windowOpen = session && !session.closed_at && new Date(session.expires_at) > now;
      const scopedToMe =
        session?.target_user === user.id ||
        (session?.class_id &&
          (
            await (admin as any)
              .from("class_enrollments")
              .select("student_id")
              .eq("class_id", session.class_id)
              .eq("student_id", user.id)
              .maybeSingle()
          ).data);
      if (!windowOpen || !scopedToMe)
        throw new Error("No open supervised verification window applies to you");
      supervisorId = session.opened_by ?? null;
    }

    // 3. Reference embedding: the uploaded profile photo when there is one
    // (higher quality, "compulsory for accuracy" per design) — the mean of
    // the live-capture samples only for the supervised path, which has no
    // profile photo. Duplicate scan runs against this same reference.
    const meanRef = l2normalize(
      data.embeddingSamples[0].map(
        (_, i) =>
          data.embeddingSamples.reduce((s, v) => s + v[i], 0) / data.embeddingSamples.length,
      ),
    );
    const referenceVec = data.embeddingProfile ? l2normalize(data.embeddingProfile) : meanRef;
    const vectorLiteral = `[${referenceVec.join(",")}]`;
    const { data: dupRows } = await (admin as any).rpc("face_find_duplicates", {
      probe: vectorLiteral,
      exclude_user: user.id,
      threshold: settings.duplicateThreshold,
    });
    if (dupRows && dupRows.length > 0) {
      await (admin as any).from("face_enrollments").insert({
        user_id: user.id,
        embedding_card: data.embeddingCard,
        embedding_reference: vectorLiteral,
        embedding_samples: data.embeddingSamples.map((s) => `[${s.join(",")}]`),
        model_version: MODEL_VERSION,
        antispoof_score: data.antispoofScore,
        liveness_score: data.livenessScore,
        status: "blocked",
        session_id: data.sessionId ?? null,
        consent_at: new Date().toISOString(),
        consent_version: "v1",
      });
      await writeAudit(user.id, {
        action: "Duplicate face enrollment blocked",
        target: user.id,
        category: "identity",
      });
      throw new Error(
        "This face is already enrolled under a different account. Contact an administrator.",
      );
    }

    // 4. Two face-similarity scores for the non-supervised path:
    //   cardProfileScore — card photo vs profile photo (sanity check: is the
    //     card actually a photo of the same person as the profile photo?).
    //     Unlike the old design, a HIGH score here is expected and good —
    //     the old SUSPICIOUS_CARD_LIVE_SCORE guard existed only because the
    //     old "card step" was just another live face capture with no real
    //     card provenance; now the card is a genuinely uploaded ID photo,
    //     verified separately by OCR, so near-1.0 similarity is the normal
    //     case for a real card, not a spoof signal.
    //   profileLiveScore — profile photo vs live-capture samples (the
    //     primary accuracy-driving score liveness capture exists to prove).
    let cardProfileScore: number | null = null;
    let profileLiveScore: number | null = null;
    if (data.embeddingCard && data.embeddingProfile) {
      cardProfileScore = cosine(
        l2normalize(data.embeddingCard),
        l2normalize(data.embeddingProfile),
      );
    }
    if (data.embeddingProfile) {
      profileLiveScore = cosine(l2normalize(data.embeddingProfile), meanRef);
    }

    // 5. OCR the uploaded card (front only — see ocr.ts) and cross-check
    // against the student's existing profile name. The matric number has no
    // typed value to compare against anymore — it's read straight off the
    // card and saved as-is once approved; isPlausibleMatric only guards
    // against saving OCR noise as if it were a real matric number.
    let ocrName: string | null = null;
    let ocrMatric: string | null = null;
    let ocrOk = false;
    if (!isSupervised && data.cardImageBase64) {
      const cardBytes = Buffer.from(data.cardImageBase64, "base64");
      const ocr = await ocrMatricCard(cardBytes);
      ocrName = ocr.name;
      ocrMatric = ocr.matricNo;
      const { data: profileRow } = await (admin as any)
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single();
      const nameOk =
        !!ocrName && !!profileRow?.name && nameSimilarity(ocrName, profileRow.name) >= 0.6;
      const matricOk = !!ocrMatric && isPlausibleMatric(ocrMatric);
      ocrOk = nameOk && matricOk;
    }

    // 6. Band-route.
    let status: "active" | "pending" | "rejected";
    let pendingReason: "face_score" | "ocr_mismatch" | null = null;
    if (isSupervised) {
      status = "active";
    } else if (!ocrOk) {
      // Can't confirm this really is the student's own card — a human (the
      // student's lecturer, who can vouch for a typo or a blurry photo)
      // needs to look at it, not an auto-reject.
      status = "pending";
      pendingReason = "ocr_mismatch";
    } else if (cardProfileScore !== null && cardProfileScore < settings.reviewThreshold) {
      // OCR passed but the card photo doesn't look like the same person as
      // the profile photo — needs a human face-comparison call.
      status = "pending";
      pendingReason = "face_score";
    } else if (profileLiveScore! >= settings.autoApproveThreshold) {
      status = "active";
    } else if (profileLiveScore! >= settings.reviewThreshold) {
      status = "pending";
      pendingReason = "face_score";
    } else {
      status = "rejected";
    }

    // 7. Evidence upload — the card photo and profile photo themselves
    // (replacing the old co-presence frame). Retained for the normal
    // retention window regardless of outcome, same rationale as before:
    // there's always something for a reviewer to check, even for
    // auto-approved enrollments. Supervised enrollments upload neither (no
    // card/profile step ever ran). The existing facePurge sweep is extended
    // below to clean these up after settings.evidenceRetentionDays.
    let cardImagePath: string | null = null;
    let profileImagePath: string | null = null;
    if (!isSupervised) {
      if (data.cardImageBase64) {
        cardImagePath = `${user.id}/enrollment/card-${Date.now()}.jpg`;
        const bytes = Uint8Array.from(atob(data.cardImageBase64), (c) => c.charCodeAt(0));
        await (admin as any).storage
          .from("identity-evidence")
          .upload(cardImagePath, bytes, { contentType: "image/jpeg" });
      }
      if (data.profileImageBase64) {
        profileImagePath = `${user.id}/enrollment/profile-${Date.now()}.jpg`;
        const bytes = Uint8Array.from(atob(data.profileImageBase64), (c) => c.charCodeAt(0));
        await (admin as any).storage
          .from("identity-evidence")
          .upload(profileImagePath, bytes, { contentType: "image/jpeg" });
      }
    }
    const evidenceExpiresAt =
      cardImagePath || profileImagePath
        ? new Date(Date.now() + settings.evidenceRetentionDays * 86_400_000).toISOString()
        : null;

    // 8. Supersede any prior active enrollment for this user, then insert.
    if (status === "active") {
      await (admin as any)
        .from("face_enrollments")
        .update({ status: "superseded" })
        .eq("user_id", user.id)
        .eq("status", "active");
    }

    const { error: insertErr } = await (admin as any).from("face_enrollments").insert({
      user_id: user.id,
      embedding_card: data.embeddingCard,
      embedding_reference: vectorLiteral,
      embedding_samples: data.embeddingSamples.map((s) => `[${s.join(",")}]`),
      model_version: MODEL_VERSION,
      card_live_score: cardProfileScore,
      profile_live_score: profileLiveScore,
      antispoof_score: data.antispoofScore,
      liveness_score: data.livenessScore,
      ocr_name_extracted: ocrName,
      ocr_matric_extracted: ocrMatric,
      status,
      pending_reason: pendingReason,
      session_id: data.sessionId ?? null,
      // The lecturer who opened the window (fetched above), NOT the
      // student's own id — this is the one audit trail that should record
      // who authorized the card-bypass.
      supervised_by: isSupervised ? supervisorId : null,
      consent_at: new Date().toISOString(),
      consent_version: "v1",
      card_image_path: cardImagePath,
      profile_image_path: profileImagePath,
      evidence_expires_at: evidenceExpiresAt,
    });
    if (insertErr) throw new Error(insertErr.message);

    // matric_no is only ever written from a verified source: OCR (once the
    // card was confirmed to belong to this student) for the normal path, or
    // the typed value on the supervised path (no card exists to OCR there,
    // physical supervision is the trust source instead).
    if (isSupervised && data.matricNo) {
      await (admin as any).from("profiles").update({ matric_no: data.matricNo }).eq("id", user.id);
    } else if (status === "active" && ocrMatric) {
      await (admin as any).from("profiles").update({ matric_no: ocrMatric }).eq("id", user.id);
    }

    if (status === "active") {
      await pushNotification(supabase, {
        userId: user.id,
        type: "identity_verified",
        title: "Identity verified",
        body: "Face Match enrollment complete.",
      });
    } else if (pendingReason === "ocr_mismatch") {
      await notifyStudentClassLecturers(admin, user.id, {
        type: "identity_ocr_review",
        title: "A student's card needs a manual check",
        body: "We couldn't automatically confirm a student's uploaded matric card — please review it.",
        link: "/lecturer/identity-sessions",
      });
    }

    // Highest-trust action in the whole feature — a lecturer authorized
    // skipping the card entirely. Always audit-logged, regardless of
    // band-routing outcome, since it's the physical supervision itself
    // (not the resulting score) that's the trust event being recorded.
    if (isSupervised) {
      await writeAudit(user.id, {
        action: "Supervised face enrollment",
        target: `lecturer ${supervisorId ?? "unknown"} (session ${data.sessionId})`,
        category: "identity",
      });
    }

    return {
      status,
      pendingReason,
      ocrName,
      ocrMatric,
      attemptsRemaining:
        status === "rejected"
          ? computeAttemptsRemaining(settings.maxAttempts, priorRejectedCount)
          : settings.maxAttempts,
    };
  });

// Best-effort fan-out to every lecturer teaching a class this student is
// enrolled in — face_enrollments isn't scoped to a class/exam, so an
// OCR-mismatch review has no single "owning" lecturer the way a supervised
// session does; every lecturer who could plausibly vouch for this student
// gets notified. Never throws — mirrors notifyIdentityUnverified below.
async function notifyStudentClassLecturers(
  admin: any,
  studentId: string,
  params: { type: string; title: string; body: string; link?: string },
) {
  try {
    const { data: enrollments } = await admin
      .from("class_enrollments")
      .select("class_id")
      .eq("student_id", studentId);
    const classIds = [...new Set((enrollments ?? []).map((e: any) => e.class_id))];
    if (classIds.length === 0) return;
    const { data: classes } = await admin.from("classes").select("lecturer_id").in("id", classIds);
    const lecturerIds = [
      ...new Set((classes ?? []).map((c: any) => c.lecturer_id).filter(Boolean)),
    ];
    for (const lecturerId of lecturerIds) {
      await admin.from("notifications").insert({
        user_id: lecturerId,
        type: params.type,
        title: params.title,
        body: params.body,
        link: params.link ?? null,
      });
    }
  } catch {
    // Best-effort — a notification failure must never block enrollment.
  }
}

// GET: admin review queue — oldest first
export const getFaceReviewQueue = createServerFn({ method: "GET" }).handler(async () => {
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

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("face_enrollments")
    .select(
      "id, user_id, card_live_score, profile_live_score, evidence_path, card_image_path, profile_image_path, ocr_name_extracted, ocr_matric_extracted, pending_reason, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return mapReviewRows(admin, data ?? []);
});

// GET: lecturer review queue — pending enrollments routed here specifically
// because OCR couldn't confirm the uploaded card (pending_reason =
// 'ocr_mismatch'), scoped to lecturers who teach a class the student is
// enrolled in. Face-score-borderline pendings stay admin-only — see
// notifyStudentClassLecturers' comment for why there's no single "owning"
// lecturer to scope a narrower query to.
export const getLecturerFaceReviewQueue = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: myClasses } = await db(supabase)
    .from("classes")
    .select("id")
    .eq("lecturer_id", user.id);
  const classIds = (myClasses ?? []).map((c: any) => c.id);
  if (classIds.length === 0) return [];

  const { data: enrollments } = await db(supabase)
    .from("class_enrollments")
    .select("student_id")
    .in("class_id", classIds);
  const studentIds = [...new Set((enrollments ?? []).map((e: any) => e.student_id))];
  if (studentIds.length === 0) return [];

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("face_enrollments")
    .select(
      "id, user_id, card_live_score, profile_live_score, evidence_path, card_image_path, profile_image_path, ocr_name_extracted, ocr_matric_extracted, pending_reason, created_at",
    )
    .eq("status", "pending")
    .eq("pending_reason", "ocr_mismatch")
    .in("user_id", studentIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return mapReviewRows(admin, data ?? []);
});

async function mapReviewRows(admin: any, rows: any[]) {
  // Manual join, not a PostgREST embed: face_enrollments.user_id references
  // auth.users(id), not profiles(id), so `profiles!user_id(...)` cannot be
  // resolved by PostgREST's relationship inference (unlike e.g. audit_log,
  // whose actor_id has a direct FK to profiles). Confirmed against the real
  // dev schema — the embedded-select form throws "Could not find a
  // relationship between 'face_enrollments' and 'profiles'".
  const userIds = [...new Set(rows.map((r: any) => r.user_id))];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, name, matric_no").in("id", userIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return rows.map((r: any) => {
    const p = profileById.get(r.user_id);
    return {
      id: r.id,
      studentName: p?.name ?? "Unknown",
      matricNo: p?.matric_no ?? "",
      similarity: r.profile_live_score ?? r.card_live_score,
      cardProfileScore: r.card_live_score,
      cardImagePath: r.card_image_path ?? r.evidence_path,
      profileImagePath: r.profile_image_path,
      ocrName: r.ocr_name_extracted,
      ocrMatric: r.ocr_matric_extracted,
      pendingReason: r.pending_reason ?? "face_score",
      createdAt: r.created_at,
    };
  });
}

// POST: admin OR (for ocr_mismatch rows only) the student's class lecturer
// approve/reject — evidence deleted on EITHER outcome.
export const faceReview = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { enrollmentId: string; decision: "approve" | "reject"; reason?: string }) => data,
  )
  .handler(async ({ data }) => {
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

    const admin = createAdminClient();
    const { data: enrollment } = await (admin as any)
      .from("face_enrollments")
      .select(
        "id, user_id, evidence_path, card_image_path, profile_image_path, ocr_matric_extracted, pending_reason, status",
      )
      .eq("id", data.enrollmentId)
      .single();
    if (!enrollment || enrollment.status !== "pending")
      throw new Error("This enrollment is not awaiting review");

    const isAdmin = profile?.role === "admin";
    if (!isAdmin) {
      // Non-admin callers must be a lecturer, reviewing an ocr_mismatch row,
      // for a student enrolled in one of their classes.
      if (profile?.role !== "lecturer" || enrollment.pending_reason !== "ocr_mismatch")
        throw new Error("Forbidden");
      const { data: myClasses } = await db(supabase)
        .from("classes")
        .select("id")
        .eq("lecturer_id", user.id);
      const classIds = (myClasses ?? []).map((c: any) => c.id);
      const { data: scoped } = classIds.length
        ? await (admin as any)
            .from("class_enrollments")
            .select("student_id")
            .in("class_id", classIds)
            .eq("student_id", enrollment.user_id)
            .maybeSingle()
        : { data: null };
      if (!scoped)
        throw new Error("Forbidden — this student is not enrolled in any of your classes");
    }

    const newStatus = data.decision === "approve" ? "active" : "rejected";
    if (newStatus === "active") {
      await (admin as any)
        .from("face_enrollments")
        .update({ status: "superseded" })
        .eq("user_id", enrollment.user_id)
        .eq("status", "active");
    }
    await (admin as any)
      .from("face_enrollments")
      .update({
        status: newStatus,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        reject_reason: data.reason ?? null,
        evidence_path: null,
        card_image_path: null,
        profile_image_path: null,
      })
      .eq("id", data.enrollmentId);

    // Approval here is the same "band-routing landed on active" event
    // faceEnroll itself handles inline — matric_no wasn't persisted yet
    // because this row went to pending instead of active at enrollment time.
    if (newStatus === "active" && enrollment.ocr_matric_extracted) {
      await (admin as any)
        .from("profiles")
        .update({ matric_no: enrollment.ocr_matric_extracted })
        .eq("id", enrollment.user_id);
    }

    const pathsToDelete = [
      enrollment.evidence_path,
      enrollment.card_image_path,
      enrollment.profile_image_path,
    ].filter(Boolean);
    if (pathsToDelete.length > 0) {
      await (admin as any).storage.from("identity-evidence").remove(pathsToDelete);
    }

    await pushNotification(supabase, {
      userId: enrollment.user_id,
      type: "identity_reviewed",
      title: newStatus === "active" ? "Identity verified" : "Identity verification rejected",
      body:
        newStatus === "active"
          ? "Your Face Match enrollment was approved."
          : (data.reason ?? "Please contact your lecturer for supervised verification."),
    });
    await writeAudit(user.id, {
      action: `${newStatus === "active" ? "Approved" : "Rejected"} face enrollment`,
      target: enrollment.user_id,
      category: "identity",
    });

    return { success: true as const };
  });

// GET: short-TTL signed URL for one evidence file — authorization-checked.
export const getFaceEvidenceUrl = createServerFn({ method: "GET" })
  .inputValidator((path: string) => path)
  .handler(async ({ data: path }) => {
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
    const ownerId = path.split("/")[0];
    const isOwner = ownerId === user.id;
    const isAdmin = profile?.role === "admin";
    let isScopedLecturer = false;
    if (!isOwner && !isAdmin && profile?.role === "lecturer") {
      const { data: myClasses } = await db(supabase)
        .from("classes")
        .select("id")
        .eq("lecturer_id", user.id);
      const classIds = (myClasses ?? []).map((c: any) => c.id);
      if (classIds.length > 0) {
        const { data: scoped } = await db(supabase)
          .from("class_enrollments")
          .select("student_id")
          .in("class_id", classIds)
          .eq("student_id", ownerId)
          .maybeSingle();
        isScopedLecturer = !!scoped;
      }
    }
    if (!isOwner && !isAdmin && !isScopedLecturer) throw new Error("Forbidden");

    const admin = createAdminClient();
    const { data: signed, error } = await (admin as any).storage
      .from("identity-evidence")
      .createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl as string };
  });

// POST: nightly retention sweep — deletes storage objects for evidence whose
// evidence_path was already nulled by Task 1's pg_cron SQL job (that job
// only nulls the DB column; this function does the actual storage delete,
// since SQL cannot call the Storage API). Also usable on-demand if pg_cron is
// disabled on this Supabase plan, mirroring the syncExamStatuses fallback
// pattern already used for exam lifecycle.
//
// Sweeps BOTH tables that hold identity-evidence storage paths:
//  - face_enrollments: Task 1's pg_cron job never touches this table at all
//    (it only UPDATEs face_verifications), so pending/rejected enrollment
//    evidence — including the co-presence card+face shot — would otherwise
//    never be deleted from storage. This is the gap this task closes.
//  - face_verifications: Task 1's pg_cron job nulls evidence_path here
//    nightly but, being plain SQL, cannot call the Storage API — so the
//    JPEG objects themselves are left orphaned in the bucket forever unless
//    something does the actual `storage.remove()`. Nothing else in the
//    codebase does that, so this function does it directly here (matching
//    on created_at + retention window, since the DB column may already be
//    null by the time this runs).
export const facePurge = createServerFn({ method: "POST" }).handler(async () => {
  // The brief's given code has no auth check at all, which would leave this
  // reachable by anyone unauthenticated. Admin-only (same pattern as
  // getFaceReviewQueue/faceReview above), not merely any-authenticated-user
  // like syncExamStatuses — that precedent doesn't transfer here because
  // syncExamStatuses is a non-destructive status recompute, while this
  // function permanently deletes evidence photos from storage. Defense in
  // depth for a privileged, irreversible operation.
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

  const admin = createAdminClient();
  const settings = await getFaceSettings();
  const cutoff = new Date(Date.now() - settings.evidenceRetentionDays * 86_400_000).toISOString();

  const { data: staleEnrollments } = await (admin as any)
    .from("face_enrollments")
    .select("id, evidence_path, card_image_path, profile_image_path")
    .or("evidence_path.not.is.null,card_image_path.not.is.null,profile_image_path.not.is.null")
    .lt("created_at", cutoff);

  const enrollmentPaths = (staleEnrollments ?? [])
    .flatMap((r: any) => [r.evidence_path, r.card_image_path, r.profile_image_path])
    .filter(Boolean);
  if (enrollmentPaths.length > 0) {
    await (admin as any).storage.from("identity-evidence").remove(enrollmentPaths);
    await (admin as any)
      .from("face_enrollments")
      .update({ evidence_path: null, card_image_path: null, profile_image_path: null })
      .in(
        "id",
        (staleEnrollments ?? []).map((r: any) => r.id),
      );
  }

  const { data: staleVerifications } = await (admin as any)
    .from("face_verifications")
    .select("id, evidence_path")
    .not("evidence_path", "is", null)
    .lt("created_at", cutoff);

  const verificationPaths = (staleVerifications ?? [])
    .map((r: any) => r.evidence_path)
    .filter(Boolean);
  if (verificationPaths.length > 0) {
    await (admin as any).storage.from("identity-evidence").remove(verificationPaths);
    await (admin as any)
      .from("face_verifications")
      .update({ evidence_path: null })
      .in(
        "id",
        (staleVerifications ?? []).map((r: any) => r.id),
      );
  }

  return { purged: enrollmentPaths.length + verificationPaths.length };
});

type VerifyInput = {
  context: "lobby" | "in_exam" | "submit";
  examId: string;
  submissionId?: string;
  embeddings: number[][];
  antispoofScore: number;
  livenessScore: number;
  evidenceJpegBase64?: string;
};

// Shared by both faceVerify exit paths that need to tell the student AND
// their lecturer that identity could not be confirmed — Finding 4 (fix round
// 1): the "no active enrollment" early return used to skip this entirely,
// making IdentityGate's "your lecturer has been notified" message false for
// that path. Never throws — a notification failure must not block the caller.
async function notifyIdentityUnverified(
  supabase: ReturnType<typeof createClient>,
  admin: any,
  userId: string,
  examId: string,
) {
  try {
    const { data: examRow } = await admin
      .from("exams")
      .select("title, classes(lecturer_id)")
      .eq("id", examId)
      .single();
    await pushNotification(supabase, {
      userId,
      type: "identity_unverified",
      title: "Identity could not be confirmed",
      body: `We couldn't confirm your identity for "${examRow?.title}". You may still continue — your lecturer has been notified.`,
    }).catch(() => {});
    if (examRow?.classes?.lecturer_id) {
      await pushNotification(supabase, {
        userId: examRow.classes.lecturer_id,
        type: "identity_unverified",
        title: "Student identity unverified",
        body: `A student's identity could not be confirmed for "${examRow.title}".`,
        link: `/lecturer/exams/${examId}/monitor`,
      }).catch(() => {});
    }
  } catch {
    // Best-effort — never block the caller's fail-soft path on a notification error.
  }
}

export const faceVerify = createServerFn({ method: "POST" })
  .inputValidator((data: VerifyInput) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const settings = await getFaceSettings();
    const admin = createAdminClient();

    const { data: enrollment } = await (admin as any)
      .from("face_enrollments")
      .select("id, embedding_reference, embedding_samples")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!enrollment) {
      await notifyIdentityUnverified(supabase, admin, user.id, data.examId);
      return {
        passed: false,
        similarity: 0,
        attemptsRemaining: 0,
        elevated: true,
        guidance: 'No active enrollment — open "Face Match" from the nav menu to enroll first.',
      };
    }

    const refs = [
      parseVector(enrollment.embedding_reference),
      ...(enrollment.embedding_samples ?? []).map(parseVector),
    ];
    const similarities = data.embeddings.map((e) => bestMatch(e, refs));
    const similarity = Math.max(...similarities);
    const threshold = settings.liveThreshold;
    const passed = similarity >= threshold;

    // Count prior attempts for this context+exam today, for the
    // "3 tries then fail-soft" rule (lobby only — in_exam/submit are single-shot).
    let attemptsRemaining = 2;
    if (data.context === "lobby") {
      const { count } = await (admin as any)
        .from("face_verifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("exam_id", data.examId)
        .eq("context", "lobby");
      attemptsRemaining = Math.max(0, settings.maxAttempts - 1 - (count ?? 0));
    }

    let evidencePath: string | null = null;
    if (!passed && data.evidenceJpegBase64) {
      evidencePath = `${user.id}/${data.context}/${Date.now()}.jpg`;
      const bytes = Uint8Array.from(atob(data.evidenceJpegBase64), (c) => c.charCodeAt(0));
      await (admin as any).storage
        .from("identity-evidence")
        .upload(evidencePath, bytes, { contentType: "image/jpeg" });
    }

    await (admin as any).from("face_verifications").insert({
      user_id: user.id,
      exam_id: data.examId,
      submission_id: data.submissionId ?? null,
      enrollment_id: enrollment.id,
      context: data.context,
      similarity,
      threshold_used: threshold,
      passed,
      model_version: MODEL_VERSION,
      evidence_path: evidencePath,
    });

    // Lobby + attempts exhausted: hard-block instead of fail-soft-passing —
    // hold the student in a supervisor-reviewable queue (identity_checkin_queue)
    // rather than letting them straight into the exam. In-exam/submit
    // contexts never reach this branch (attemptsRemaining stays hardcoded at
    // 2 for them, only ever recomputed for "lobby" above) and keep the
    // existing fail-soft behavior via the notification block below.
    if (!passed && data.context === "lobby" && attemptsRemaining === 0) {
      const { data: existingQueue } = await (admin as any)
        .from("identity_checkin_queue")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("exam_id", data.examId)
        .maybeSingle();

      let queueId = existingQueue?.id;
      if (!existingQueue) {
        const { data: inserted, error: queueErr } = await (admin as any)
          .from("identity_checkin_queue")
          .insert({ user_id: user.id, exam_id: data.examId })
          .select("id")
          .single();
        if (queueErr) throw new Error(queueErr.message);
        queueId = inserted.id;
      } else if (existingQueue.status === "rejected") {
        // Terminal — do not re-queue, do not notify again.
        return {
          passed: false,
          similarity: Math.round(similarity * 1000) / 1000,
          attemptsRemaining: 0,
          elevated: false,
          queued: false,
          rejected: true,
          guidance: "Your identity could not be confirmed. Contact your lecturer.",
        };
      }
      // Re-queuing (existingQueue.status === "waiting"/"cleared"/"auto_admitted")
      // never overwrites queued_at on the DB side — only the initial insert
      // above sets it, so re-triggering this branch can't postpone the
      // auto-admit timeout.

      await notifyIdentityUnverified(supabase, admin, user.id, data.examId);

      return {
        passed: false,
        similarity: Math.round(similarity * 1000) / 1000,
        attemptsRemaining: 0,
        elevated: false,
        queued: true,
        queueId,
        guidance: "You're in the review queue — your lecturer has been notified.",
      };
    }

    const elevated = !passed;
    if (!passed && (data.context !== "lobby" || attemptsRemaining === 0)) {
      // Dedupe: fire the lecturer+student notification at most once per
      // submission per context. Without this, a proctor-triggered in_exam
      // re-check (even with camera-proctor.tsx's cooldown) can still fail
      // repeatedly across a long exam and spam duplicate notifications. The
      // row for THIS attempt was already inserted above, so a count of 1
      // means this is the first failure for this submission+context.
      let alreadyNotified = false;
      if (data.submissionId) {
        const { count: priorFailedCount } = await (admin as any)
          .from("face_verifications")
          .select("id", { count: "exact", head: true })
          .eq("submission_id", data.submissionId)
          .eq("context", data.context)
          .eq("passed", false);
        alreadyNotified = (priorFailedCount ?? 0) > 1;
      }
      if (!alreadyNotified) {
        await notifyIdentityUnverified(supabase, admin, user.id, data.examId);
      }
    }

    return {
      passed,
      similarity: Math.round(similarity * 1000) / 1000,
      attemptsRemaining,
      elevated,
      guidance: passed
        ? undefined
        : "Try more light, remove your cap/sunglasses, and face the camera directly.",
    };
  });

// GET: student-facing poll target for the waiting screen. Also where the
// 5-minute auto-admit timeout is evaluated LAZILY (no cron) — matches this
// codebase's existing client-triggered-fallback convention (syncExamStatuses).
const AUTO_ADMIT_MS = 5 * 60_000;

export const getIdentityCheckinStatus = createServerFn({ method: "GET" })
  .inputValidator((data: { examId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const admin = createAdminClient();
    const { data: row } = await (admin as any)
      .from("identity_checkin_queue")
      .select("id, status, queued_at")
      .eq("user_id", user.id)
      .eq("exam_id", data.examId)
      .maybeSingle();

    if (!row) return { status: null as null };

    if (
      row.status === "waiting" &&
      Date.now() - new Date(row.queued_at).getTime() > AUTO_ADMIT_MS
    ) {
      await (admin as any)
        .from("identity_checkin_queue")
        .update({ status: "auto_admitted", cleared_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "waiting"); // no-op if a supervisor decided concurrently
      return { status: "auto_admitted" as const };
    }

    return { status: row.status as "waiting" | "cleared" | "auto_admitted" | "rejected" };
  });

// GET: lecturer/admin-facing list of students currently waiting. Lecturer
// sees only their own classes' students (same class_enrollments join
// pattern as getLecturerFaceReviewQueue above); admin sees everyone.
export const getIdentityCheckinQueue = createServerFn({ method: "GET" }).handler(async () => {
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

  const admin = createAdminClient();
  let studentIds: string[] | null = null; // null = no scoping (admin)

  if (profile?.role === "lecturer") {
    const { data: myClasses } = await db(supabase)
      .from("classes")
      .select("id")
      .eq("lecturer_id", user.id);
    const classIds = (myClasses ?? []).map((c: any) => c.id);
    if (classIds.length === 0) return [];
    const { data: enrollments } = await db(supabase)
      .from("class_enrollments")
      .select("student_id")
      .in("class_id", classIds);
    studentIds = [...new Set((enrollments ?? []).map((e: any) => e.student_id))];
    if (studentIds.length === 0) return [];
  } else if (profile?.role !== "admin") {
    throw new Error("Forbidden");
  }

  let query = (admin as any)
    .from("identity_checkin_queue")
    .select("id, user_id, queued_at")
    .eq("status", "waiting")
    .order("queued_at", { ascending: true });
  if (studentIds) query = query.in("user_id", studentIds);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const userIds = [...new Set((rows ?? []).map((r: any) => r.user_id))];
  const { data: profiles } = userIds.length
    ? await (admin as any).from("profiles").select("id, name, matric_no").in("id", userIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return (rows ?? []).map((r: any) => {
    const p = profileById.get(r.user_id);
    return {
      id: r.id,
      studentName: p?.name ?? "Unknown",
      matricNo: p?.matric_no ?? "",
      queuedAt: r.queued_at,
    };
  });
});

// POST: lecturer (own students only) or admin (anyone) clears or rejects a
// queued student. WHERE status = 'waiting' on the update guards against two
// supervisors deciding concurrently — the second call becomes a no-op.
export const decideIdentityCheckin = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { queueId: string; decision: "clear" | "reject"; reason?: string }) => data,
  )
  .handler(async ({ data }) => {
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

    const admin = createAdminClient();
    const { data: row } = await (admin as any)
      .from("identity_checkin_queue")
      .select("id, user_id, exam_id, status")
      .eq("id", data.queueId)
      .single();
    if (!row || row.status !== "waiting") throw new Error("This entry is not awaiting review");

    const isAdmin = profile?.role === "admin";
    if (!isAdmin) {
      if (profile?.role !== "lecturer") throw new Error("Forbidden");
      const { data: myClasses } = await db(supabase)
        .from("classes")
        .select("id")
        .eq("lecturer_id", user.id);
      const classIds = (myClasses ?? []).map((c: any) => c.id);
      const { data: scoped } = classIds.length
        ? await (admin as any)
            .from("class_enrollments")
            .select("student_id")
            .in("class_id", classIds)
            .eq("student_id", row.user_id)
            .maybeSingle()
        : { data: null };
      if (!scoped)
        throw new Error("Forbidden — this student is not enrolled in any of your classes");
    }

    const newStatus = data.decision === "clear" ? "cleared" : "rejected";
    const { error } = await (admin as any)
      .from("identity_checkin_queue")
      .update({
        status: newStatus,
        cleared_by: user.id,
        cleared_at: new Date().toISOString(),
        reject_reason: data.decision === "reject" ? (data.reason ?? null) : null,
      })
      .eq("id", data.queueId)
      .eq("status", "waiting");
    if (error) throw new Error(error.message);

    if (data.decision === "reject") {
      await writeAudit(user.id, {
        action: "Rejected exam identity check-in",
        target: row.user_id,
        category: "identity",
      });
    }

    await pushNotification(supabase, {
      userId: row.user_id,
      type: "identity_checkin_decided",
      title: data.decision === "clear" ? "You're cleared to start" : "Identity check-in rejected",
      body:
        data.decision === "clear"
          ? "Your identity was manually confirmed — you may now start the exam."
          : (data.reason ?? "Contact your lecturer."),
    });

    return { success: true as const };
  });

// POST: stamp submission_id onto the lobby verification row right after
// startExam creates the submission (the lobby check runs BEFORE a submission
// exists, so it can't be tagged at capture time).
export const faceBindSession = createServerFn({ method: "POST" })
  .inputValidator((data: { submissionId: string; examId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const admin = createAdminClient();
    const { data: lobbyRow } = await (admin as any)
      .from("face_verifications")
      .select("id, passed")
      .eq("user_id", user.id)
      .eq("exam_id", data.examId)
      .eq("context", "lobby")
      .is("submission_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lobbyRow) {
      await (admin as any)
        .from("face_verifications")
        .update({ submission_id: data.submissionId })
        .eq("id", lobbyRow.id);
    }
    return { elevated: lobbyRow ? !lobbyRow.passed : false };
  });

// ── Supervised enrollment sessions (Task 7 — lecturer windows / VIVA fallback) ──

// POST: lecturer opens a time-boxed window during which students in scope
// (a whole class, or one specific student) can enroll without a card, under
// physical supervision. Insert goes through the SSR client (not admin) —
// Task 1's fes_lecturer_all RLS policy (`opened_by = auth.uid()`) permits
// this directly, so there's no need to bypass RLS here.
export const openEnrollmentSession = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { classId?: string; targetUserId?: string; durationMinutes?: number }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    if (!data.classId && !data.targetUserId) throw new Error("classId or targetUserId is required");

    if (data.classId) {
      const { data: cls } = await db(supabase)
        .from("classes")
        .select("lecturer_id")
        .eq("id", data.classId)
        .single();
      if (cls?.lecturer_id !== user.id) throw new Error("Forbidden — you do not own this class");
    }

    // Ownership check for the single-student targeting path too — without
    // this, any lecturer could open a card-skipping supervised window for an
    // arbitrary user by calling this function directly with only
    // targetUserId (unreachable through the shipped identity-sessions.tsx
    // UI, which only ever sends classId, but the server function's interface
    // documents targetUserId as a first-class standalone option, and
    // faceEnroll's own re-validation just honors whatever target_user ends
    // up stored here — nothing downstream catches this). Mirrors the classId
    // branch's intent: the target student must be enrolled in at least one
    // class this lecturer teaches. Two-step query (not a nested embed
    // filter) to match this codebase's existing manual-join style — see
    // getFaceReviewQueue's comment on why embedded-select filters aren't
    // relied on here.
    if (data.targetUserId) {
      const { data: targetEnrollments } = await db(supabase)
        .from("class_enrollments")
        .select("class_id")
        .eq("student_id", data.targetUserId);
      const classIds = (targetEnrollments ?? []).map((e: any) => e.class_id);
      let ownsAny = false;
      if (classIds.length > 0) {
        const { data: ownedClasses } = await db(supabase)
          .from("classes")
          .select("id")
          .in("id", classIds)
          .eq("lecturer_id", user.id);
        ownsAny = (ownedClasses ?? []).length > 0;
      }
      if (!ownsAny)
        throw new Error("Forbidden — this student is not enrolled in any of your classes");
    }

    const expiresAt = new Date(Date.now() + (data.durationMinutes ?? 30) * 60_000).toISOString();
    const { data: session, error } = await db(supabase)
      .from("face_enrollment_sessions")
      .insert({
        class_id: data.classId ?? null,
        target_user: data.targetUserId ?? null,
        opened_by: user.id,
        expires_at: expiresAt,
      })
      .select("id, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return { sessionId: session.id as string, expiresAt: session.expires_at as string };
  });

// POST: lecturer closes their own open window early. Scoped to opened_by so
// a lecturer cannot close another lecturer's session even by guessing an id.
export const closeEnrollmentSession = createServerFn({ method: "POST" })
  .inputValidator((sessionId: string) => sessionId)
  .handler(async ({ data: sessionId }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    await db(supabase)
      .from("face_enrollment_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("opened_by", user.id);
    return { success: true as const };
  });

// GET: roster for the lecturer's "open window" screen — every student
// enrolled in the class, and whether they currently have an active face
// enrollment. Uses the admin client for the face_enrollments lookup since
// that table has no client SELECT policy at all (Task 1).
export const getEnrollmentSessionRoster = createServerFn({ method: "GET" })
  .inputValidator((classId: string) => classId)
  .handler(async ({ data: classId }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: enrollments } = await db(supabase)
      .from("class_enrollments")
      .select("student_id, profiles!student_id(name)")
      .eq("class_id", classId);

    const admin = createAdminClient();
    const { data: active } = await (admin as any)
      .from("face_enrollments")
      .select("user_id")
      .eq("status", "active");
    const enrolledIds = new Set((active ?? []).map((r: any) => r.user_id));

    return (enrollments ?? []).map((e: any) => ({
      studentId: e.student_id,
      name: e.profiles?.name ?? "Unknown",
      enrolled: enrolledIds.has(e.student_id),
    }));
  });

// GET: lightweight check the student wizard runs on mount — is there an open
// supervised window that applies to me right now? Deliberately uses the SSR
// client (not admin): Task 1's fes_student_select RLS policy already scopes
// visibility to `target_user = auth.uid() OR class_id IN (my enrolled
// classes)`, so a plain RLS-scoped SELECT does the "scoped to me" filtering
// for free — no need to duplicate that logic here or reach for the admin
// client. Also returns the student's current matric_no so the wizard knows
// whether it can skip straight to live-capture or must still collect it.
export const getOpenSessionForMe = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const nowIso = new Date().toISOString();
  const { data: session } = await db(supabase)
    .from("face_enrollment_sessions")
    .select("id, expires_at")
    .is("closed_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: profile } = await db(supabase)
    .from("profiles")
    .select("matric_no")
    .eq("id", user.id)
    .maybeSingle();

  return {
    sessionId: session?.id ?? null,
    expiresAt: session?.expires_at ?? null,
    matricNo: profile?.matric_no ?? null,
  };
});

async function recordAttempt(
  admin: any,
  userId: string,
  reason: string,
  settings: any,
  priorRejectedCount: number,
) {
  await admin.from("face_enrollments").insert({
    user_id: userId,
    embedding_reference: `[${new Array(1024).fill(0).join(",")}]`, // placeholder zero-vector for a rejected-before-scoring attempt
    model_version: MODEL_VERSION,
    status: "rejected",
    reject_reason: reason,
    consent_at: new Date().toISOString(),
    consent_version: "v1",
  });
  return {
    status: "rejected" as const,
    attemptsRemaining: computeAttemptsRemaining(settings.maxAttempts, priorRejectedCount),
  };
}
