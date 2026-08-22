"use client";

export interface LivenessResult {
  passed: boolean;
  livenessScore: number;
  antispoofScore: number;
}

const LIVENESS_THRESHOLD = 0.5;
const ANTISPOOF_THRESHOLD = 0.5;
const SAMPLE_COUNT = 5;
const SAMPLE_INTERVAL_MS = 400;

// Samples several frames while the caller prompts the student to blink or
// turn their head naturally, and averages human's own per-frame liveness
// ("live") and antispoof ("real") scores — the same signals the pre-existing
// submit-time identity check in this codebase already relied on, rather than
// a hand-rolled blink/head-turn detector.
export async function runLivenessCheck(
  human: any,
  video: HTMLVideoElement,
): Promise<LivenessResult> {
  const liveScores: number[] = [];
  const realScores: number[] = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const result = await human.detect(video);
    const face = result.face?.[0];
    if (face) {
      if (typeof face.live === "number") liveScores.push(face.live);
      if (typeof face.real === "number") realScores.push(face.real);
    }
    if (i < SAMPLE_COUNT - 1) {
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
    }
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const livenessScore = avg(liveScores);
  const antispoofScore = avg(realScores);

  return {
    passed: livenessScore >= LIVENESS_THRESHOLD && antispoofScore >= ANTISPOOF_THRESHOLD,
    livenessScore,
    antispoofScore,
  };
}
