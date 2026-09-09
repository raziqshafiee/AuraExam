import { describe, it, expect } from "vitest";
import { faceSimilarity } from "@/lib/face-id/compare";

describe("faceSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(faceSimilarity([1, 2, 3], [1, 2, 3])).toBe(1);
  });

  it("returns 1 for a small distance (still within the saturated match range)", () => {
    expect(faceSimilarity([0, 0, 0, 0], [1, 1, 1, 1])).toBe(1);
  });

  it("returns exactly 0.5 at the documented match boundary", () => {
    // sum of squared diffs = 4 * 5^2 = 100; dist = 25*100 = 2500; sqrt = 50;
    // norm = (1 - 0.5 - 0.2) / 0.6 = 0.5
    expect(faceSimilarity([0, 0, 0, 0], [5, 5, 5, 5])).toBe(0.5);
  });

  it("returns 0 once the distance exceeds the normalized range", () => {
    // sum of squared diffs = 4 * 8^2 = 256; dist = 25*256 = 6400; sqrt = 80;
    // norm = (1 - 0.8 - 0.2) / 0.6 = 0
    expect(faceSimilarity([0, 0, 0, 0], [8, 8, 8, 8])).toBe(0);
  });

  it("returns 0 for mismatched-length vectors", () => {
    expect(faceSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });

  it("returns 0 for empty vectors", () => {
    expect(faceSimilarity([], [])).toBe(0);
  });
});
