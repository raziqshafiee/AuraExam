import { describe, it, expect } from "vitest";
import { isFramedCorrectly } from "@/lib/face-id/quality";

describe("isFramedCorrectly", () => {
  it("passes a face spanning exactly 50% of image height", () => {
    expect(isFramedCorrectly({ yMin: 0, yMax: 250 }, 500)).toBe(true);
  });

  it("passes a face spanning exactly 70% of image height", () => {
    expect(isFramedCorrectly({ yMin: 0, yMax: 350 }, 500)).toBe(true);
  });

  it("passes a face spanning 60% of image height", () => {
    expect(isFramedCorrectly({ yMin: 50, yMax: 350 }, 500)).toBe(true);
  });

  it("fails a face smaller than 50% of image height", () => {
    expect(isFramedCorrectly({ yMin: 0, yMax: 200 }, 500)).toBe(false);
  });

  it("fails a face larger than 70% of image height", () => {
    expect(isFramedCorrectly({ yMin: 0, yMax: 400 }, 500)).toBe(false);
  });

  it("fails when imageHeight is zero or negative", () => {
    expect(isFramedCorrectly({ yMin: 0, yMax: 100 }, 0)).toBe(false);
  });

  it("respects custom min/max ratios", () => {
    expect(isFramedCorrectly({ yMin: 0, yMax: 100 }, 500, 0.1, 0.3)).toBe(true);
  });
});
