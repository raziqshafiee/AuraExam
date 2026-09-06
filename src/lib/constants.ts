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
  // Lowered to 0.70 by owner decision (was 0.80, and before that a design doc
  // specified 0.85). Shared by both verifyEnrolment (registration) and
  // checkInExam (exam check-in) so this single value governs both.
  MATCH_THRESHOLD: 0.7,
  MAX_ENROLL_ATTEMPTS: 3,
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
