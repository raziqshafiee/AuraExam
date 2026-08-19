// src/lib/supabase/face.ts
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";
import { pushNotification } from "./notifications";
import { writeAudit } from "./audit";
import { getFaceSettings } from "./settings";
import { cosine, l2normalize, bestMatch, parseVector } from "@/lib/face/similarity";
import { MODEL_VERSION } from "@/lib/face/human-config";

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
  const { data: { user } } = await supabase.auth.getUser();
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
  embeddingCard: number[] | null; // null for supervised enrollments
  embeddingSamples: number[][]; // 5 live descriptors
  matricNo: string;
  challengeId: string;
  challengeStepsCompleted: string[];
  antispoofScore: number;
  livenessScore: number;
  evidenceJpegBase64: string; // co-presence frame (card + face together)
  sessionId?: string; // present only for supervised enrollments (Task 7)
};

export const faceEnroll = createServerFn({ method: "POST" })
  .inputValidator((data: EnrollInput) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
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
    if (!isSupervised) {
      if (!challenge || challenge.user_id !== user.id || challenge.consumed_at) {
        throw new Error("Invalid or already-used challenge");
      }
      if (new Date(challenge.expires_at) < new Date()) {
        throw new Error("Challenge expired — please retry");
      }
      const allStepsDone = (challenge.steps as string[]).every((s) => data.challengeStepsCompleted.includes(s));
      if (!allStepsDone) throw new Error("Liveness challenge was not completed");
      await (admin as any).from("face_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);

      if (data.antispoofScore < settings.antispoofMin || data.livenessScore < settings.livenessMin) {
        return await recordAttempt(admin, user.id, "Liveness/antispoof check failed", settings, priorRejectedCount);
      }
    }

    // 2. Supervised-window validation, if this is a supervised enrollment
    // (Task 7 opens these windows). Physical supervision replaces card provenance.
    if (isSupervised) {
      const { data: session } = await (admin as any)
        .from("face_enrollment_sessions")
        .select("id, class_id, target_user, expires_at, closed_at")
        .eq("id", data.sessionId)
        .maybeSingle();
      const now = new Date();
      const windowOpen = session && !session.closed_at && new Date(session.expires_at) > now;
      const scopedToMe =
        session?.target_user === user.id ||
        (session?.class_id &&
          (await (admin as any)
            .from("class_enrollments")
            .select("student_id")
            .eq("class_id", session.class_id)
            .eq("student_id", user.id)
            .maybeSingle()).data);
      if (!windowOpen || !scopedToMe) throw new Error("No open supervised verification window applies to you");
    }

    // 3. Duplicate scan — this reference embedding vs every OTHER active
    // enrollment, via pgvector <=> (cosine distance = 1 - cosine similarity).
    const meanRef = l2normalize(
      data.embeddingSamples[0].map((_, i) => data.embeddingSamples.reduce((s, v) => s + v[i], 0) / data.embeddingSamples.length)
    );
    const vectorLiteral = `[${meanRef.join(",")}]`;
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
        target: `matric ${data.matricNo}`,
        category: "identity",
      });
      throw new Error("This face is already enrolled under a different account. Contact an administrator.");
    }

    // 4. Score card<->live (skip for supervised — no card was captured)
    let cardLiveScore: number | null = null;
    if (data.embeddingCard) {
      cardLiveScore = cosine(l2normalize(data.embeddingCard), meanRef);
    }

    // 5. Band-route
    let status: "active" | "pending" | "rejected";
    if (isSupervised) {
      status = "active";
    } else if (cardLiveScore! >= settings.autoApproveThreshold) {
      status = "active";
    } else if (cardLiveScore! >= settings.reviewThreshold) {
      status = "pending";
    } else {
      status = "rejected";
    }

    // 6. Evidence upload (co-presence frame) — only kept if status is pending or rejected
    let evidencePath: string | null = null;
    if (status === "pending" || status === "rejected") {
      evidencePath = `${user.id}/enrollment/${Date.now()}.jpg`;
      const bytes = Uint8Array.from(atob(data.evidenceJpegBase64), (c) => c.charCodeAt(0));
      await (admin as any).storage.from("identity-evidence").upload(evidencePath, bytes, { contentType: "image/jpeg" });
    }

    // 7. Supersede any prior active enrollment for this user, then insert.
    if (status === "active") {
      await (admin as any).from("face_enrollments").update({ status: "superseded" }).eq("user_id", user.id).eq("status", "active");
    }

    const { error: insertErr } = await (admin as any).from("face_enrollments").insert({
      user_id: user.id,
      embedding_card: data.embeddingCard,
      embedding_reference: vectorLiteral,
      embedding_samples: data.embeddingSamples.map((s) => `[${s.join(",")}]`),
      model_version: MODEL_VERSION,
      card_live_score: cardLiveScore,
      antispoof_score: data.antispoofScore,
      liveness_score: data.livenessScore,
      status,
      session_id: data.sessionId ?? null,
      supervised_by: isSupervised ? user.id : null,
      consent_at: new Date().toISOString(),
      consent_version: "v1",
      evidence_path: evidencePath,
      evidence_expires_at: evidencePath ? new Date(Date.now() + settings.evidenceRetentionDays * 86_400_000).toISOString() : null,
    });
    if (insertErr) throw new Error(insertErr.message);

    if (data.matricNo) {
      await (admin as any).from("profiles").update({ matric_no: data.matricNo }).eq("id", user.id);
    }

    if (status === "active") {
      await pushNotification(supabase, { userId: user.id, type: "identity_verified", title: "Identity verified", body: "Face Match enrollment complete." });
    }

    return {
      status,
      attemptsRemaining:
        status === "rejected"
          ? computeAttemptsRemaining(settings.maxAttempts, priorRejectedCount)
          : settings.maxAttempts,
    };
  });

// GET: admin review queue — oldest first
export const getFaceReviewQueue = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await db(supabase).from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Forbidden");

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("face_enrollments")
    .select("id, user_id, card_live_score, evidence_path, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  // Manual join, not a PostgREST embed: face_enrollments.user_id references
  // auth.users(id), not profiles(id), so `profiles!user_id(...)` cannot be
  // resolved by PostgREST's relationship inference (unlike e.g. audit_log,
  // whose actor_id has a direct FK to profiles). Confirmed against the real
  // dev schema — the embedded-select form throws "Could not find a
  // relationship between 'face_enrollments' and 'profiles'".
  const userIds = [...new Set(rows.map((r: any) => r.user_id))];
  const { data: profiles } = userIds.length
    ? await (admin as any).from("profiles").select("id, name, matric_no").in("id", userIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return rows.map((r: any) => {
    const p = profileById.get(r.user_id);
    return {
      id: r.id,
      studentName: p?.name ?? "Unknown",
      matricNo: p?.matric_no ?? "",
      similarity: r.card_live_score,
      evidencePath: r.evidence_path,
      createdAt: r.created_at,
    };
  });
});

// POST: admin approve/reject — evidence deleted on EITHER outcome.
export const faceReview = createServerFn({ method: "POST" })
  .inputValidator((data: { enrollmentId: string; decision: "approve" | "reject"; reason?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await db(supabase).from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") throw new Error("Forbidden");

    const admin = createAdminClient();
    const { data: enrollment } = await (admin as any)
      .from("face_enrollments")
      .select("id, user_id, evidence_path, status")
      .eq("id", data.enrollmentId)
      .single();
    if (!enrollment || enrollment.status !== "pending") throw new Error("This enrollment is not awaiting review");

    const newStatus = data.decision === "approve" ? "active" : "rejected";
    if (newStatus === "active") {
      await (admin as any).from("face_enrollments").update({ status: "superseded" }).eq("user_id", enrollment.user_id).eq("status", "active");
    }
    await (admin as any)
      .from("face_enrollments")
      .update({ status: newStatus, reviewed_by: user.id, reviewed_at: new Date().toISOString(), reject_reason: data.reason ?? null, evidence_path: null })
      .eq("id", data.enrollmentId);

    if (enrollment.evidence_path) {
      await (admin as any).storage.from("identity-evidence").remove([enrollment.evidence_path]);
    }

    await pushNotification(supabase, {
      userId: enrollment.user_id,
      type: "identity_reviewed",
      title: newStatus === "active" ? "Identity verified" : "Identity verification rejected",
      body: newStatus === "active" ? "Your Face Match enrollment was approved." : (data.reason ?? "Please contact your lecturer for supervised verification."),
    });
    await writeAudit(user.id, { action: `${newStatus === "active" ? "Approved" : "Rejected"} face enrollment`, target: enrollment.user_id, category: "identity" });

    return { success: true as const };
  });

// GET: short-TTL signed URL for one evidence file — authorization-checked.
export const getFaceEvidenceUrl = createServerFn({ method: "GET" })
  .inputValidator((path: string) => path)
  .handler(async ({ data: path }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await db(supabase).from("profiles").select("role").eq("id", user.id).single();
    const ownerId = path.split("/")[0];
    const isOwner = ownerId === user.id;
    const isAdmin = profile?.role === "admin";
    if (!isOwner && !isAdmin) throw new Error("Forbidden");

    const admin = createAdminClient();
    const { data: signed, error } = await (admin as any).storage.from("identity-evidence").createSignedUrl(path, 300);
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await db(supabase).from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Forbidden");

  const admin = createAdminClient();
  const settings = await getFaceSettings();
  const cutoff = new Date(Date.now() - settings.evidenceRetentionDays * 86_400_000).toISOString();

  const { data: staleEnrollments } = await (admin as any)
    .from("face_enrollments")
    .select("id, evidence_path")
    .not("evidence_path", "is", null)
    .lt("created_at", cutoff);

  const enrollmentPaths = (staleEnrollments ?? []).map((r: any) => r.evidence_path).filter(Boolean);
  if (enrollmentPaths.length > 0) {
    await (admin as any).storage.from("identity-evidence").remove(enrollmentPaths);
    await (admin as any).from("face_enrollments").update({ evidence_path: null }).in("id", (staleEnrollments ?? []).map((r: any) => r.id));
  }

  const { data: staleVerifications } = await (admin as any)
    .from("face_verifications")
    .select("id, evidence_path")
    .not("evidence_path", "is", null)
    .lt("created_at", cutoff);

  const verificationPaths = (staleVerifications ?? []).map((r: any) => r.evidence_path).filter(Boolean);
  if (verificationPaths.length > 0) {
    await (admin as any).storage.from("identity-evidence").remove(verificationPaths);
    await (admin as any).from("face_verifications").update({ evidence_path: null }).in("id", (staleVerifications ?? []).map((r: any) => r.id));
  }

  return { purged: enrollmentPaths.length + verificationPaths.length };
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
