// src/tests/lib/trust-score.test.ts
import { describe, it, expect } from "vitest";
import { computeTrustScore } from "@/lib/proctor/trust-score";

describe("computeTrustScore", () => {
  it("returns 100 for no flags at all", () => {
    expect(computeTrustScore([])).toBe(100);
  });

  it("subtracts 15 per hard flag (tab-switch, copy-paste, fullscreen-exit, multiple-faces)", () => {
    expect(computeTrustScore([{ type: "tab-switch" }])).toBe(85);
    expect(computeTrustScore([{ type: "copy-paste" }, { type: "fullscreen-exit" }])).toBe(70);
  });

  it("subtracts 5 per advisory flag (face-missing, camera-lost, gaze-away, head-turned)", () => {
    expect(computeTrustScore([{ type: "gaze-away" }])).toBe(95);
    expect(
      computeTrustScore([{ type: "face-missing" }, { type: "camera-lost" }, { type: "head-turned" }]),
    ).toBe(85);
  });

  it("subtracts 10 for a time-window (late submission) flag", () => {
    expect(computeTrustScore([{ type: "time-window" }])).toBe(90);
  });

  it("subtracts 5 for an unrecognized flag type (safe default, never crashes)", () => {
    expect(computeTrustScore([{ type: "some-future-flag-type" }])).toBe(95);
  });

  it("clamps at 0 rather than going negative", () => {
    const many = Array.from({ length: 10 }, () => ({ type: "tab-switch" }));
    expect(computeTrustScore(many)).toBe(0);
  });

  it("mixes flag types correctly", () => {
    expect(
      computeTrustScore([{ type: "tab-switch" }, { type: "gaze-away" }, { type: "time-window" }]),
    ).toBe(100 - 15 - 5 - 10);
  });
});
