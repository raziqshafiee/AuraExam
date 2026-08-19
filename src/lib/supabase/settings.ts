// src/lib/supabase/settings.ts
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";

const db = (supabase: ReturnType<typeof createClient>) => supabase;

export type FaceSettings = {
  autoApproveThreshold: number;
  reviewThreshold: number;
  liveThreshold: number;
  duplicateThreshold: number;
  antispoofMin: number;
  livenessMin: number;
  maxAttempts: number;
  consecutiveMismatch: number;
  evidenceRetentionDays: number;
};

const KEY_MAP: Record<keyof FaceSettings, string> = {
  autoApproveThreshold: "face_auto_approve_threshold",
  reviewThreshold: "face_review_threshold",
  liveThreshold: "face_live_threshold",
  duplicateThreshold: "face_duplicate_threshold",
  antispoofMin: "face_antispoof_min",
  livenessMin: "face_liveness_min",
  maxAttempts: "face_max_attempts",
  consecutiveMismatch: "face_consecutive_mismatch",
  evidenceRetentionDays: "face_evidence_retention_days",
};

// Settings change rarely (admin-tuned during calibration, not per-request) —
// a short in-memory cache avoids a DB round-trip on every enroll/verify call
// without needing a redeploy to pick up a new threshold.
let cache: { value: FaceSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getFaceSettings(): Promise<FaceSettings> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;

  const admin = createAdminClient();
  const { data, error } = await (admin as any).from("platform_settings").select("key, value");
  if (error) throw new Error(error.message);

  const byKey = new Map((data ?? []).map((r: any) => [r.key, r.value]));
  const value: FaceSettings = Object.fromEntries(
    Object.entries(KEY_MAP).map(([field, key]) => [field, byKey.get(key)])
  ) as FaceSettings;

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

// GET: admin-facing read of current thresholds (values only, no auth secrets
// involved — but still gated to admin so students can't learn the exact
// threshold and try to game it).
export const getAdminFaceSettings = createServerFn({ method: "GET" }).handler(async () => {
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

  return getFaceSettings();
});
