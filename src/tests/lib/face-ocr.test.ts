// src/tests/lib/face-ocr.test.ts
import { describe, it, expect } from "vitest";
import { parseCardText } from "@/lib/face/ocr";

describe("parseCardText", () => {
  it("extracts a wrapped name and the matric number from real card layout OCR text", () => {
    const raw = [
      "RHB",
      "KEMENTERIAN PENDIDIKAN TINGGI",
      "UTeM",
      "MySISWA",
      "Nama : MUHAMMAD RAZIQ HADIF BIN",
      "M SHAFIEE",
      "No. Matrik: B032420097",
      "Kursus : BITS",
      "Fakulti : FTMK",
      "ISLAMIC",
    ].join("\n");

    const result = parseCardText(raw);
    expect(result.name).toBe("MUHAMMAD RAZIQ HADIF BIN M SHAFIEE");
    expect(result.matricNo).toBe("B032420097");
  });

  it("handles a single-line name with no wrap", () => {
    const raw = "Nama : AHMAD BIN ALI\nNo. Matrik: A012345678\nKursus : BCS";
    const result = parseCardText(raw);
    expect(result.name).toBe("AHMAD BIN ALI");
    expect(result.matricNo).toBe("A012345678");
  });

  it("returns nulls when the labels aren't found at all", () => {
    const result = parseCardText("some unrelated OCR garbage\nwith no labels");
    expect(result.name).toBeNull();
    expect(result.matricNo).toBeNull();
  });

  it("is tolerant of a missing period after No", () => {
    const raw = "Nama : SITI NURHALIZA\nNo Matrik: C987654321";
    const result = parseCardText(raw);
    expect(result.matricNo).toBe("C987654321");
  });
});
