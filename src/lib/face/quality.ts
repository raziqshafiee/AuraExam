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

// Stricter framing bound for the profile-photo upload step specifically —
// this photo becomes the primary biometric reference (see verify-identity.tsx),
// so "too small/zoomed-out" and "too large/cropped" both matter here in a way
// they don't for the card photo (whose printed face is naturally tiny within
// the frame) or live-capture (already gated by MIN_BOX_AREA/MIN_DETECTOR_SCORE
// via the base gate above).
const PROFILE_MIN_BOX_AREA = 0.5;
const PROFILE_MAX_BOX_AREA = 0.7;

export function passesProfilePhotoQualityGate(r: DescriptorResult | null): { ok: boolean; reason?: string } {
  if (!r) return { ok: false, reason: "No frame captured" };
  if (r.faceCount === 0) return { ok: false, reason: "No face detected — center yourself in the frame" };
  if (r.faceCount > 1) return { ok: false, reason: "More than one face detected" };
  if (r.detectorScore < MIN_DETECTOR_SCORE)
    return { ok: false, reason: "Image unclear — check lighting and hold still" };
  if (r.boxArea < PROFILE_MIN_BOX_AREA)
    return { ok: false, reason: "Move closer or zoom in — your face is too small in the frame" };
  if (r.boxArea > PROFILE_MAX_BOX_AREA)
    return { ok: false, reason: "Move back slightly — your face is too close/cropped in the frame" };
  return { ok: true };
}
