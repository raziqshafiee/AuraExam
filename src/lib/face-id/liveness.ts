"use client";

export type LivenessPhase = "blink" | "turn" | "done";

export interface LivenessResult {
  passed: boolean;
  livenessScore: number;
  antispoofScore: number;
  blinkDetected: boolean;
  headTurnDetected: boolean;
}

const LIVENESS_THRESHOLD = 0.5;
const ANTISPOOF_THRESHOLD = 0.5;
const PHASE_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 200;

function isBlinkGesture(gesture: string): boolean {
  return gesture.startsWith("blink ");
}

function isTurnGesture(gesture: string): boolean {
  return gesture === "facing left" || gesture === "facing right";
}

// Polls the video every POLL_INTERVAL_MS until a gesture matching `matches`
// appears in human's per-frame gesture list, or PHASE_TIMEOUT_MS elapses.
// Every sampled frame's live/antispoof scores are pushed onto the shared
// liveScores/realScores accumulators regardless of outcome, so the antispoof
// check covers the whole challenge, not just the frame that triggered the
// gesture.
async function pollForGesture(
  human: any,
  video: HTMLVideoElement,
  matches: (gesture: string) => boolean,
  liveScores: number[],
  realScores: number[],
): Promise<boolean> {
  const deadline = Date.now() + PHASE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await human.detect(video);
    const face = result.face?.[0];
    if (face) {
      if (typeof face.live === "number") liveScores.push(face.live);
      if (typeof face.real === "number") realScores.push(face.real);
    }
    const gestures: string[] = (result.gesture ?? [])
      .filter((g: any) => "face" in g)
      .map((g: any) => g.gesture as string);
    if (gestures.some(matches)) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

// Two-phase active challenge — waits for a blink, then a head turn — calling
// onPhaseChange as each phase starts so the caller can update on-screen
// instructions. Antispoof/liveness scores are sampled across the whole
// challenge (see pollForGesture) and averaged the same way the old
// passive-only check did; the gesture requirements are additive on top of
// that score threshold, not a replacement for it.
export async function runLivenessCheck(
  human: any,
  video: HTMLVideoElement,
  onPhaseChange?: (phase: LivenessPhase) => void,
): Promise<LivenessResult> {
  const liveScores: number[] = [];
  const realScores: number[] = [];

  onPhaseChange?.("blink");
  const blinkDetected = await pollForGesture(human, video, isBlinkGesture, liveScores, realScores);

  onPhaseChange?.("turn");
  const headTurnDetected = await pollForGesture(human, video, isTurnGesture, liveScores, realScores);

  onPhaseChange?.("done");

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const livenessScore = avg(liveScores);
  const antispoofScore = avg(realScores);

  return {
    passed:
      blinkDetected &&
      headTurnDetected &&
      livenessScore >= LIVENESS_THRESHOLD &&
      antispoofScore >= ANTISPOOF_THRESHOLD,
    livenessScore,
    antispoofScore,
    blinkDetected,
    headTurnDetected,
  };
}
