// src/tests/lib/face-attempts.test.ts
import { describe, it, expect } from "vitest";
import { computeAttemptsRemaining } from "@/lib/supabase/face";

describe("computeAttemptsRemaining", () => {
  it("counts down as prior rejected attempts accumulate", () => {
    // maxAttempts=3: 1st attempt (0 prior) -> 2 remaining, 2nd (1 prior) -> 1,
    // 3rd (2 prior) -> 0. This is the "reflects real attempt history" fix for
    // Finding 1 — attemptsRemaining must actually decrease across calls, not
    // return a constant every time.
    expect(computeAttemptsRemaining(3, 0)).toBe(2);
    expect(computeAttemptsRemaining(3, 1)).toBe(1);
    expect(computeAttemptsRemaining(3, 2)).toBe(0);
  });

  it("never goes negative once prior rejections exceed maxAttempts", () => {
    expect(computeAttemptsRemaining(3, 3)).toBe(0);
    expect(computeAttemptsRemaining(3, 10)).toBe(0);
  });

  it("treats maxAttempts=1 as a single shot with no retries", () => {
    expect(computeAttemptsRemaining(1, 0)).toBe(0);
  });
});
