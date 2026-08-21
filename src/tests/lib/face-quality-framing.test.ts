// src/tests/lib/face-quality-framing.test.ts
import { describe, it, expect } from "vitest";
import { passesProfilePhotoQualityGate } from "@/lib/face/quality";
import type { DescriptorResult } from "@/lib/face/descriptor";

function makeResult(overrides: Partial<DescriptorResult>): DescriptorResult {
  return {
    descriptor: [1, 2, 3],
    antispoofScore: 0.9,
    livenessScore: 0.9,
    faceCount: 1,
    boxArea: 0.3,
    detectorScore: 0.9,
    ...overrides,
  };
}

describe("passesProfilePhotoQualityGate", () => {
  it("passes a well-framed face (boxArea within 0.50-0.70)", () => {
    expect(passesProfilePhotoQualityGate(makeResult({ boxArea: 0.6 })).ok).toBe(true);
  });

  it("rejects a face that's too small in frame (below 0.50)", () => {
    const r = passesProfilePhotoQualityGate(makeResult({ boxArea: 0.2 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/closer|zoom/i);
  });

  it("rejects a face that's too large/cropped in frame (above 0.70)", () => {
    const r = passesProfilePhotoQualityGate(makeResult({ boxArea: 0.85 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/back|far/i);
  });

  it("still rejects zero or multiple faces the same way the base gate does", () => {
    expect(passesProfilePhotoQualityGate(makeResult({ faceCount: 0, boxArea: 0.6 })).ok).toBe(false);
    expect(passesProfilePhotoQualityGate(makeResult({ faceCount: 2, boxArea: 0.6 })).ok).toBe(false);
  });

  it("still rejects a low detector-confidence frame the same way the base gate does", () => {
    expect(passesProfilePhotoQualityGate(makeResult({ boxArea: 0.6, detectorScore: 0.5 })).ok).toBe(false);
  });

  it("rejects a null result", () => {
    expect(passesProfilePhotoQualityGate(null).ok).toBe(false);
  });
});
