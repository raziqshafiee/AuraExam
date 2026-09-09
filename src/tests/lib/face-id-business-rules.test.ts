import { describe, it, expect } from "vitest";
import { canRequestPhotoChange } from "@/lib/face-id/business-rules";

describe("canRequestPhotoChange", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date("2026-06-01T00:00:00Z");

  it("allows a change when there is no prior photo", () => {
    expect(canRequestPhotoChange(null, [], now, 90, 48)).toEqual({ allowed: true });
  });

  it("denies a change before the cooldown elapses", () => {
    const lastUpdate = new Date(now.getTime() - 10 * DAY_MS);
    const result = canRequestPhotoChange(lastUpdate, [], now, 90, 48);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/day/i);
  });

  it("allows a change exactly at the cooldown boundary", () => {
    const lastUpdate = new Date(now.getTime() - 90 * DAY_MS);
    expect(canRequestPhotoChange(lastUpdate, [], now, 90, 48).allowed).toBe(true);
  });

  it("denies a change within the freeze window of an upcoming exam", () => {
    const lastUpdate = new Date(now.getTime() - 100 * DAY_MS);
    const examStart = new Date(now.getTime() + 10 * 60 * 60 * 1000); // 10h away
    const result = canRequestPhotoChange(lastUpdate, [examStart], now, 90, 48);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/48 hours/i);
  });

  it("allows a change when the only upcoming exam is outside the freeze window", () => {
    const lastUpdate = new Date(now.getTime() - 100 * DAY_MS);
    const examStart = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72h away
    expect(canRequestPhotoChange(lastUpdate, [examStart], now, 90, 48).allowed).toBe(true);
  });

  it("ignores exams that already started", () => {
    const lastUpdate = new Date(now.getTime() - 100 * DAY_MS);
    const pastExam = new Date(now.getTime() - 60 * 60 * 1000);
    expect(canRequestPhotoChange(lastUpdate, [pastExam], now, 90, 48).allowed).toBe(true);
  });
});
