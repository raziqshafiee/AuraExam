// src/lib/proctor/trust-score.ts
//
// Pure, client-computable trust score for lecturer/admin review screens —
// additive to (not a replacement of) the existing flags/flag_reasons
// 3-strike mechanic. No I/O: the monitor/results pages already load
// per-submission flagReasons, so this is computed from data already in
// memory, no new server function or schema needed.

const HARD_FLAG_TYPES = new Set(["tab-switch", "copy-paste", "fullscreen-exit", "multiple-faces"]);
const ADVISORY_FLAG_TYPES = new Set(["face-missing", "camera-lost", "gaze-away", "head-turned"]);

const HARD_WEIGHT = 15;
const ADVISORY_WEIGHT = 5;
const TIME_WINDOW_WEIGHT = 10;
const DEFAULT_WEIGHT = 5; // unrecognized future flag types — never crash, never ignore

function weightFor(type: string): number {
  if (HARD_FLAG_TYPES.has(type)) return HARD_WEIGHT;
  if (ADVISORY_FLAG_TYPES.has(type)) return ADVISORY_WEIGHT;
  if (type === "time-window") return TIME_WINDOW_WEIGHT;
  return DEFAULT_WEIGHT;
}

export function computeTrustScore(flagReasons: { type: string }[]): number {
  const penalty = flagReasons.reduce((sum, f) => sum + weightFor(f.type), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}
