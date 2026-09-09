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
  // TEMPORARY, evidence-based only for genuine-match side so far: a real
  // same-person check-in on this embedding model (1024-dim, unnormalized,
  // magnitude ~11 — see compare.ts) scored 0.57 under faceSimilarity, well
  // below this constant's previous value of 0.6, which had been guessed from
  // the library's generic docs rather than this app's actual embedding
  // distribution. 0.45 gives margin under that observed genuine score. Still
  // missing: a real different-person score under this metric to confirm 0.45
  // actually rejects an impostor — re-tune the moment that data exists rather
  // than trusting this number long-term. Used by checkInExam (exam check-in)
  // and checkIdentityContinuity (in-exam re-check) — enrollment no longer
  // does a threshold match since there's no passport photo to match against.
  MATCH_THRESHOLD: 0.45,
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
