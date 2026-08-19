// src/lib/face/quality.ts
import type { DescriptorResult } from "./descriptor";

const MIN_BOX_AREA = 0.08; // face fills at least ~8% of the frame
const MIN_DETECTOR_SCORE = 0.7;

export function passesQualityGate(r: DescriptorResult | null): { ok: boolean; reason?: string } {
  if (!r) return { ok: false, reason: "No frame captured" };
  if (r.faceCount === 0)
    return { ok: false, reason: "No face detected — center yourself in the frame" };
  if (r.faceCount > 1) return { ok: false, reason: "More than one face detected" };
  if (r.boxArea < MIN_BOX_AREA) return { ok: false, reason: "Move closer to the camera" };
  if (r.detectorScore < MIN_DETECTOR_SCORE)
    return { ok: false, reason: "Image unclear — check lighting and hold still" };
  return { ok: true };
}
