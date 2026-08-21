import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";
import { writeAudit } from "./audit";
import { cosineSimilarity } from "@/lib/face-id/compare";
import { nextRegistrationOutcome, canRequestPhotoChange } from "@/lib/face-id/business-rules";
import { FACE_ID } from "@/lib/constants";

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
