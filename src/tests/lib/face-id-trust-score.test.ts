import { describe, it, expect } from "vitest";
import { computeTrustScore } from "@/lib/face-id/trust-score";

describe("computeTrustScore", () => {
  it("returns 100 with no flags", () => {
    expect(computeTrustScore([])).toBe(100);
  });

  it("deducts the identity-mismatch weight", () => {
    expect(computeTrustScore([{ type: "identity-mismatch" }])).toBe(80);
  });

  it("deducts multiple weighted flags", () => {
    expect(
      computeTrustScore([{ type: "face-missing" }, { type: "gaze-away" }, { type: "multiple-faces" }]),
    ).toBe(100 - 5 - 3 - 15);
  });

  it("ignores unknown flag types (0 weight)", () => {
    expect(computeTrustScore([{ type: "time-window" }])).toBe(100);
  });

  it("floors at 0 rather than going negative", () => {
    const manyFlags = Array.from({ length: 10 }, () => ({ type: "identity-mismatch" }));
    expect(computeTrustScore(manyFlags)).toBe(0);
  });

  it("caps at 100 (defensive — score never starts above 100)", () => {
    expect(computeTrustScore([])).toBeLessThanOrEqual(100);
  });
});
