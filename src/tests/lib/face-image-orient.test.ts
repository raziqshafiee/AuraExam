// src/tests/lib/face-image-orient.test.ts
import { describe, it, expect } from "vitest";
import { readExifOrientation } from "@/lib/face/image-orient";

// Builds a minimal, valid-enough JPEG buffer: SOI, an APP1 segment carrying
// a real TIFF header with a single Orientation (0x0112) IFD entry, then EOI.
// Byte-order is little-endian ("II") to match the common phone-camera case.
function buildJpegWithOrientation(orientation: number): ArrayBuffer {
  const entries = 1;
  const ifdSize = 2 + entries * 12 + 4; // count + entries + next-IFD-offset
  const tiffSize = 8 + ifdSize; // header + IFD
  const app1PayloadSize = 6 + tiffSize; // "Exif\0\0" + TIFF
  const app1Size = 2 + app1PayloadSize; // length field itself + payload

  const buf = new ArrayBuffer(2 + 2 + app1Size + 2);
  const view = new DataView(buf);
  let o = 0;
  view.setUint16(o, 0xffd8);
  o += 2; // SOI
  view.setUint16(o, 0xffe1);
  o += 2; // APP1 marker
  view.setUint16(o, app1Size);
  o += 2; // segment length (includes itself)

  // "Exif\0\0"
  view.setUint8(o++, 0x45);
  view.setUint8(o++, 0x78);
  view.setUint8(o++, 0x69);
  view.setUint8(o++, 0x66);
  view.setUint8(o++, 0x00);
  view.setUint8(o++, 0x00);

  const tiffStart = o;
  view.setUint16(o, 0x4949, true);
  o += 2; // "II" little-endian
  view.setUint16(o, 42, true);
  o += 2; // TIFF magic
  view.setUint32(o, 8, true);
  o += 4; // first IFD offset (right after header)

  // IFD
  view.setUint16(o, entries, true);
  o += 2;
  view.setUint16(o, 0x0112, true);
  o += 2; // tag: Orientation
  view.setUint16(o, 3, true);
  o += 2; // type: SHORT
  view.setUint32(o, 1, true);
  o += 4; // count: 1
  view.setUint16(o, orientation, true);
  o += 2; // value
  view.setUint16(o, 0, true);
  o += 2; // padding to fill the 4-byte value slot
  view.setUint32(o, 0, true);
  o += 4; // next IFD offset: none

  view.setUint16(o, 0xffd9);
  o += 2; // EOI
  void tiffStart;
  return buf;
}

describe("readExifOrientation", () => {
  it("reads a real Orientation tag out of a well-formed EXIF segment", () => {
    expect(readExifOrientation(buildJpegWithOrientation(6))).toBe(6);
    expect(readExifOrientation(buildJpegWithOrientation(3))).toBe(3);
    expect(readExifOrientation(buildJpegWithOrientation(1))).toBe(1);
  });

  it("defaults to 1 for a non-JPEG buffer (e.g. a PNG)", () => {
    const png = new ArrayBuffer(8);
    new DataView(png).setUint32(0, 0x89504e47);
    expect(readExifOrientation(png)).toBe(1);
  });

  it("defaults to 1 for a JPEG with no EXIF segment at all", () => {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint16(0, 0xffd8);
    view.setUint16(2, 0xffd9);
    expect(readExifOrientation(buf)).toBe(1);
  });

  it("defaults to 1 for a truncated/malformed buffer without throwing", () => {
    expect(() => readExifOrientation(new ArrayBuffer(2))).not.toThrow();
  });
});
