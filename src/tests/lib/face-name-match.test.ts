// src/tests/lib/face-name-match.test.ts
import { describe, it, expect } from "vitest";
import { nameSimilarity, isPlausibleMatric } from "@/lib/face/name-match";

describe("nameSimilarity", () => {
  it("returns 1 for identical names", () => {
    expect(
      nameSimilarity("MUHAMMAD RAZIQ HADIF BIN M SHAFIEE", "MUHAMMAD RAZIQ HADIF BIN M SHAFIEE"),
    ).toBe(1);
  });

  it("is case-insensitive and punctuation-tolerant", () => {
    expect(nameSimilarity("muhammad raziq, hadif.", "MUHAMMAD RAZIQ HADIF")).toBe(1);
  });

  it("tolerates one OCR-dropped token", () => {
    const sim = nameSimilarity(
      "MUHAMMAD RAZIQ HADIF BIN M SHAFIEE",
      "MUHAMMAD RAZIQ HADIF BIN SHAFIEE",
    );
    expect(sim).toBeGreaterThanOrEqual(0.6);
  });

  it("returns 0 for completely different names", () => {
    expect(nameSimilarity("AHMAD BIN ALI", "SITI NURHALIZA")).toBe(0);
  });

  it("returns 0 when either input is empty", () => {
    expect(nameSimilarity("", "SOMETHING")).toBe(0);
    expect(nameSimilarity("SOMETHING", "")).toBe(0);
  });
});

describe("isPlausibleMatric", () => {
  it("accepts a real matric number shape", () => {
    expect(isPlausibleMatric("B032420097")).toBe(true);
  });

  it("accepts noisy OCR punctuation around a valid matric", () => {
    expect(isPlausibleMatric("B03 242 0097")).toBe(true);
  });

  it("rejects empty or letter-only OCR noise", () => {
    expect(isPlausibleMatric("")).toBe(false);
    expect(isPlausibleMatric("ABCDEF")).toBe(false);
  });

  it("rejects strings that are too short or too long", () => {
    expect(isPlausibleMatric("B1")).toBe(false);
    expect(isPlausibleMatric("B0324200971234")).toBe(false);
  });
});
