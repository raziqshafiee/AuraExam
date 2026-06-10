import { describe, it, expect } from "vitest";
import { fmtMY, myLocalInputToISO, isoToMyLocalInput, MY_TZ } from "@/lib/datetime";

describe("MY_TZ constant", () => {
  it("is Asia/Kuala_Lumpur", () => {
    expect(MY_TZ).toBe("Asia/Kuala_Lumpur");
  });
});

describe("fmtMY", () => {
  it("formats a UTC ISO string in MYT (UTC+8)", () => {
    // 2026-05-30T06:00:00Z = 14:00 MYT
    const result = fmtMY("2026-05-30T06:00:00Z", { timeStyle: "short", hour12: false });
    expect(result).toContain("14");
    expect(result).not.toContain("06");
  });

  it("returns '—' for null", () => {
    expect(fmtMY(null)).toBe("—");
  });

  it("returns '—' for undefined", () => {
    expect(fmtMY(undefined)).toBe("—");
  });

  it("returns '—' for an invalid date string", () => {
    expect(fmtMY("not-a-date")).toBe("—");
  });

  it("returns '—' for an empty string", () => {
    expect(fmtMY("")).toBe("—");
  });

  it("accepts a Date object", () => {
    const d = new Date("2026-05-30T06:00:00Z");
    const result = fmtMY(d, { timeStyle: "short", hour12: false });
    expect(result).toContain("14");
  });

  it("applies date formatting options and returns a non-empty string", () => {
    const result = fmtMY("2026-01-15T00:00:00Z", { dateStyle: "short" });
    expect(result).not.toBe("—");
    expect(result.length).toBeGreaterThan(3);
  });
});

describe("myLocalInputToISO", () => {
  it("converts 14:00 MYT to 06:00 UTC", () => {
    const result = myLocalInputToISO("2026-05-30T14:00");
    const d = new Date(result);
    expect(d.getUTCHours()).toBe(6);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4); // May is index 4
    expect(d.getUTCDate()).toBe(30);
  });

  it("midnight MYT (00:00) maps to 16:00 UTC the previous day", () => {
    const result = myLocalInputToISO("2026-05-30T00:00");
    const d = new Date(result);
    expect(d.getUTCHours()).toBe(16);
    expect(d.getUTCDate()).toBe(29);
  });

  it("returns empty string for empty input", () => {
    expect(myLocalInputToISO("")).toBe("");
  });

  it("handles seconds-included format", () => {
    const result = myLocalInputToISO("2026-05-30T14:00:00");
    const d = new Date(result);
    expect(d.getUTCHours()).toBe(6);
    expect(d.getUTCSeconds()).toBe(0);
  });

  it("produces a valid ISO 8601 UTC string", () => {
    const result = myLocalInputToISO("2026-06-01T10:30");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("round-trips with isoToMyLocalInput", () => {
    const input = "2026-05-30T14:00";
    expect(isoToMyLocalInput(myLocalInputToISO(input))).toBe(input);
  });

  it("handles end-of-day 23:59 MYT", () => {
    const result = myLocalInputToISO("2026-05-30T23:59");
    const d = new Date(result);
    expect(d.getUTCHours()).toBe(15);
    expect(d.getUTCMinutes()).toBe(59);
  });
});

describe("isoToMyLocalInput", () => {
  it("converts 06:00 UTC to 14:00 MYT", () => {
    const result = isoToMyLocalInput("2026-05-30T06:00:00.000Z");
    expect(result).toBe("2026-05-30T14:00");
  });

  it("returns empty string for null", () => {
    expect(isoToMyLocalInput(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(isoToMyLocalInput(undefined)).toBe("");
  });

  it("returns empty string for an invalid date string", () => {
    expect(isoToMyLocalInput("not-a-date")).toBe("");
  });

  it("crosses midnight correctly (previous-day UTC → next-day MYT)", () => {
    // 2026-05-29T17:00:00Z = 2026-05-30T01:00 MYT
    const result = isoToMyLocalInput("2026-05-29T17:00:00.000Z");
    expect(result).toBe("2026-05-30T01:00");
  });

  it("zero-pads single-digit months and days", () => {
    // 2026-01-05T00:00:00Z = 2026-01-05T08:00 MYT
    const result = isoToMyLocalInput("2026-01-05T00:00:00.000Z");
    expect(result).toBe("2026-01-05T08:00");
  });

  it("output format is always yyyy-MM-ddTHH:mm (16 chars)", () => {
    const result = isoToMyLocalInput("2026-09-15T10:30:00.000Z");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(result.length).toBe(16);
  });
});
