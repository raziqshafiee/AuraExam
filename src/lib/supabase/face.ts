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
        return await recordAttempt(admin, user.id, "Liveness/antispoof check failed", settings);
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

    return { status, attemptsRemaining: status === "rejected" ? Math.max(0, settings.maxAttempts - 1) : settings.maxAttempts };
  });

async function recordAttempt(admin: any, userId: string, reason: string, settings: any) {
  await admin.from("face_enrollments").insert({
    user_id: userId,
    embedding_reference: `[${new Array(1024).fill(0).join(",")}]`, // placeholder zero-vector for a rejected-before-scoring attempt
    model_version: MODEL_VERSION,
    status: "rejected",
    reject_reason: reason,
    consent_at: new Date().toISOString(),
    consent_version: "v1",
  });
  return { status: "rejected" as const, attemptsRemaining: Math.max(0, settings.maxAttempts - 1) };
}
