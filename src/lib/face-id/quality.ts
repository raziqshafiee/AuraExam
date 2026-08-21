"use client";

export interface FaceBoundingBox {
  yMin: number;
  yMax: number;
}

export function isFramedCorrectly(
  box: FaceBoundingBox,
  imageHeight: number,
  minRatio = 0.5,
  maxRatio = 0.7,
): boolean {
  if (imageHeight <= 0) return false;
  const faceHeight = box.yMax - box.yMin;
  const ratio = faceHeight / imageHeight;
  return ratio >= minRatio && ratio <= maxRatio;
}

export type PassportPhotoCheck = { ok: true } | { ok: false; reason: string };

export async function checkPassportPhoto(human: any, image: HTMLImageElement): Promise<PassportPhotoCheck> {
  const result = await human.detect(image);
  const faces = result.face ?? [];

  if (faces.length === 0) return { ok: false, reason: "No face detected. Use a clear, well-lit photo." };
  if (faces.length > 1) return { ok: false, reason: "More than one face detected." };

  const face = faces[0];
  const box = face.box ?? face.boxRaw;
  if (!box) return { ok: false, reason: "Could not measure the face in this photo." };

  const [, yMin, , boxHeight] = box;
  const framed = isFramedCorrectly({ yMin, yMax: yMin + boxHeight }, image.naturalHeight);
  if (!framed) {
    return {
      ok: false,
      reason: "Face isn't framed correctly — move closer or further so your face fills 50–70% of the photo.",
    };
  }

  return { ok: true };
}
