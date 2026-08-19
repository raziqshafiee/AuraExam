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

export async function extractDescriptor(
  human: Human,
  video: HTMLVideoElement,
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

  const [x, y, w, h] = face.box ?? [0, 0, 0, 0];
  const boxArea = (w * h) / (video.videoWidth * video.videoHeight || 1);

  return {
    descriptor,
    antispoofScore: face.real ?? 0,
    livenessScore: face.live ?? 0,
    faceCount: 1,
    boxArea,
    detectorScore: face.score ?? 0,
  };
}
