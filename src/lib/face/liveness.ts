// src/lib/face/liveness.ts
//
// Verifies a liveness challenge step against signals already produced by the
// EXISTING MediaPipe FaceLandmarker in camera-proctor.tsx (blendshapes +
// facial transformation matrix) — no extra model, zero additional cost, per
// spec §4.5.

export type ChallengeStep = "blink_once" | "blink_twice" | "turn_left" | "turn_right";

const BLINK_THRESHOLD = 0.5; // eyeBlinkLeft/Right blendshape score above this = eye closed
const TURN_THRESHOLD_DEG = 20;

export function verifyLivenessStep(
  step: ChallengeStep,
  blendshapes: Record<string, number> | null,
  yawDeg: number | null,
): boolean {
  if (step === "blink_once" || step === "blink_twice") {
    if (!blendshapes) return false;
    const left = blendshapes.eyeBlinkLeft ?? 0;
    const right = blendshapes.eyeBlinkRight ?? 0;
    return left > BLINK_THRESHOLD && right > BLINK_THRESHOLD;
  }
  if (step === "turn_left") return yawDeg !== null && yawDeg < -TURN_THRESHOLD_DEG;
  if (step === "turn_right") return yawDeg !== null && yawDeg > TURN_THRESHOLD_DEG;
  return false;
}
