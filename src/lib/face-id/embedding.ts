"use client";

let humanPromise: Promise<any> | null = null;

export async function loadHuman(): Promise<any> {
  if (!humanPromise) {
    humanPromise = import("@vladmandic/human").then(async (mod) => {
      const Human = mod.default;
      const human = new Human({
        modelBasePath: "https://cdn.jsdelivr.net/npm/@vladmandic/human@3/models/",
        face: {
          enabled: true,
          detector: { rotation: true },
          description: { enabled: true },
          antispoof: { enabled: true },
          liveness: { enabled: true },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
      });
      await human.load();
      await human.warmup();
      return human;
    });
  }
  return humanPromise;
}

export interface ExtractedFace {
  embedding: number[];
  faceCount: number;
  antispoofScore?: number;
  livenessScore?: number;
}

export async function extractEmbedding(
  human: any,
  source: HTMLVideoElement | HTMLImageElement,
): Promise<ExtractedFace | null> {
  const result = await human.detect(source);
  const faces = result.face ?? [];
  if (faces.length === 0) return null;
  const face = faces[0];
  return {
    embedding: Array.from(face.embedding ?? []),
    faceCount: faces.length,
    antispoofScore: typeof face.real === "number" ? face.real : undefined,
    livenessScore: typeof face.live === "number" ? face.live : undefined,
  };
}
