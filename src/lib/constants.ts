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
