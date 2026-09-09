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
  // Calibrated from real paired same-person/different-person test data on
  // this embedding model (1024-dim, unnormalized, magnitude ~11 — see
  // compare.ts), gathered 2026-09-09: genuine self-match scores were
  // 0.52/0.56/0.57; a different person's face scored 0.45/0.46. 0.50 sits
  // between both clusters, correctly separating every attempt observed so
  // far. That margin (~0.06) is narrow on a small sample (5 attempts total)
  // — this is not a wide safety margin, and should be re-tuned as more real
  // check-in data accumulates, not treated as final. Used by checkInExam
  // (exam check-in) and checkIdentityContinuity (in-exam re-check) —
  // enrollment no longer does a threshold match since there's no passport
  // photo to match against.
  MATCH_THRESHOLD: 0.5,
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
