export const INTEGRITY = {
  FLAG_THRESHOLD: 3,
  SUBMIT_GRACE_MS: 30_000,
} as const;

export const APPEAL = {
  WINDOW_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

export const ESSAY = {
  MAX_CHARS: 5000,
} as const;

export const AUTOSAVE = {
  DEBOUNCE_MS: 2_000,
  INTERVAL_MS: 20_000,
} as const;

export const FACE_ID = {
  // Reset after switching the underlying metric from plain cosine similarity
  // to faceSimilarity (compare.ts) — human.js's own Euclidean-distance-based
  // formula, whose documented match boundary is 0.5. The 0.85/0.80/0.70
  // values this constant carried previously were calibrated for cosine
  // similarity and don't carry over; 0.6 gives some margin above the bare
  // "match" line for a security-sensitive check. Tune based on observed
  // production scores now that the metric itself is meaningful. Used by
  // checkInExam (exam check-in) and checkIdentityContinuity (in-exam
  // re-check) — enrollment no longer does a threshold match since there's no
  // passport photo to match against.
  MATCH_THRESHOLD: 0.6,
  MAX_CHECKIN_ATTEMPTS: 3,
  COOLDOWN_DAYS: 90,
  FREEZE_HOURS: 48,
  CONTINUITY_CHECK_INTERVAL_MS: 5 * 60_000,
  TOKEN_BUFFER_MS: 5 * 60_000,
} as const;

export const TRUST_SCORE_WEIGHTS: Record<string, number> = {
  "identity-mismatch": 20,
  "multiple-faces": 15,
  "face-missing": 5,
  "camera-lost": 5,
  "gaze-away": 3,
  "head-turned": 3,
};
