// src/lib/face/descriptor.ts
import type { Human } from "@vladmandic/human";

export const EXPECTED_DESCRIPTOR_LENGTH = 1024;

export type DescriptorResult = {
  descriptor: number[];
  antispoofScore: number;
  livenessScore: number;
  faceCount: number;
  boxArea: number; // fraction of frame area, 0..1
  detectorScore: number;
};

let dimensionChecked = false;

/**
 * video accepts a live <video> frame (webcam capture) OR a static <img>
 * (uploaded card/profile photo) — Human's detect() works on either. Only
 * antispoof/liveness scores are meaningless on a static image (there's no
 * motion to analyze); callers extracting from an upload should ignore those
 * two fields rather than gate on them the way live-capture does.
 */
export async function extractDescriptor(
  human: Human,
  video: HTMLVideoElement | HTMLImageElement,
): Promise<DescriptorResult | null> {
  const result = await human.detect(video);
  const faces = result.face ?? [];
  if (faces.length !== 1) {
    return {
      descriptor: [],
      antispoofScore: 0,
      livenessScore: 0,
      faceCount: faces.length,
      boxArea: 0,
      detectorScore: 0,
    };
  }

  const face = faces[0];
  const descriptor: number[] = Array.from(face.embedding ?? []);

  if (!dimensionChecked) {
    dimensionChecked = true;
    if (descriptor.length !== EXPECTED_DESCRIPTOR_LENGTH) {
      throw new Error(
        `[face] Human descriptor length is ${descriptor.length}, expected ${EXPECTED_DESCRIPTOR_LENGTH}. ` +
          `The pinned @vladmandic/human version's faceres output changed — update EXPECTED_DESCRIPTOR_LENGTH ` +
          `AND the vector(1024) columns in scripts/migrate-face-verification.ts before enrolling anyone.`,
      );
    }
  }

  const frameWidth = "videoWidth" in video ? video.videoWidth : video.naturalWidth;
  const frameHeight = "videoHeight" in video ? video.videoHeight : video.naturalHeight;
  const [x, y, w, h] = face.box ?? [0, 0, 0, 0];
  const boxArea = (w * h) / (frameWidth * frameHeight || 1);

  return {
    descriptor,
    antispoofScore: face.real ?? 0,
    livenessScore: face.live ?? 0,
    faceCount: 1,
    boxArea,
    detectorScore: face.score ?? 0,
  };
}
