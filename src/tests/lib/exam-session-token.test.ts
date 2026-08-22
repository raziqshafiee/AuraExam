import { describe, it, expect } from "vitest";
import { signExamToken, verifyExamToken } from "@/lib/supabase/exam-session-token";

// @vitest-environment node

const SECRET = "test-secret-at-least-32-bytes-long!!";
const payload = { sub: "user-1", examId: "exam-1", submissionId: "sub-1" };

describe("exam session token", () => {
  it("round-trips: a freshly signed token verifies against the same claims", async () => {
    const token = await signExamToken(payload, new Date(Date.now() + 60_000), SECRET);
    const ok = await verifyExamToken(token, payload, SECRET);
    expect(ok).toBe(true);
  });

  it("rejects a token whose examId doesn't match the expected claim", async () => {
    const token = await signExamToken(payload, new Date(Date.now() + 60_000), SECRET);
    const ok = await verifyExamToken(token, { ...payload, examId: "other-exam" }, SECRET);
    expect(ok).toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await signExamToken(payload, new Date(Date.now() - 1_000), SECRET);
    const ok = await verifyExamToken(token, payload, SECRET);
    expect(ok).toBe(false);
  });

  it("rejects a token verified with the wrong secret (tampered signature)", async () => {
    const token = await signExamToken(payload, new Date(Date.now() + 60_000), SECRET);
    const ok = await verifyExamToken(token, payload, "a-completely-different-secret!!!");
    expect(ok).toBe(false);
  });

  it("rejects a malformed token string", async () => {
    const ok = await verifyExamToken("not-a-jwt", payload, SECRET);
    expect(ok).toBe(false);
  });

  // An unset EXAM_SESSION_SECRET resolves to "" and used to reach jose, which
  // threw an opaque DataError. It must fail fast with a diagnosable message —
  // and a short secret must never be allowed to sign an exam-entry token.
  it.each([
    ["an empty secret", ""],
    ["a too-short secret", "short-secret"],
  ])("refuses to sign with %s", async (_label, badSecret) => {
    await expect(signExamToken(payload, new Date(Date.now() + 60_000), badSecret)).rejects.toThrow(
      /EXAM_SESSION_SECRET/,
    );
  });

  it("throws (rather than silently returning false) when verifying with an empty secret", async () => {
    const token = await signExamToken(payload, new Date(Date.now() + 60_000), SECRET);
    await expect(verifyExamToken(token, payload, "")).rejects.toThrow(/EXAM_SESSION_SECRET/);
  });
});
