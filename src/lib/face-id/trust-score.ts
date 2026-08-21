import { TRUST_SCORE_WEIGHTS } from "@/lib/constants";

export function computeTrustScore(flags: { type: string }[]): number {
  let score = 100;
  for (const f of flags) {
    score -= TRUST_SCORE_WEIGHTS[f.type] ?? 0;
  }
  return Math.max(0, Math.min(100, score));
}
