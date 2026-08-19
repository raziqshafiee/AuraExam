// src/tests/lib/face-similarity.test.ts
import { describe, it, expect } from "vitest";
import { l2normalize, cosine, bestMatch, parseVector } from "@/lib/face/similarity";

describe("l2normalize", () => {
  it("produces a unit vector", () => {
    const v = l2normalize([3, 4]);
    const norm = Math.sqrt(v[0] ** 2 + v[1] ** 2);
    expect(norm).toBeCloseTo(1, 6);
  });

  it("handles an all-zero vector without dividing by zero", () => {
    expect(l2normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("cosine", () => {
  it("returns 1 for identical normalized vectors", () => {
    const v = l2normalize([1, 2, 3]);
    expect(cosine(v, v)).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosine([1, 2], [1, 2, 3])).toThrow(/dimension mismatch/);
  });
});

describe("bestMatch", () => {
  it("returns the highest similarity among multiple references", () => {
    const probe = [1, 0, 0];
    const refs = [[0, 1, 0], [1, 0, 0], [0, 0, 1]];
    expect(bestMatch(probe, refs)).toBeCloseTo(1, 6);
  });

  it("returns -1 when there are no references", () => {
    expect(bestMatch([1, 0], [])).toBe(-1);
  });
});

describe("parseVector", () => {
  it("passes arrays through unchanged", () => {
    expect(parseVector([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("parses a pgvector text literal", () => {
    expect(parseVector("[0.1,0.2,0.3]")).toEqual([0.1, 0.2, 0.3]);
  });
});
