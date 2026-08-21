// src/lib/face/image-orient.ts
//
// Phone cameras commonly store a photo's pixels in landscape sensor
// orientation plus an EXIF Orientation tag saying how to rotate/flip it for
// display. Browsers honor that tag when rendering an <img> in the DOM, but
// canvas-based pipelines (which is what face descriptor extraction and JPEG
// re-encoding both use) do NOT — they draw the raw, untransformed pixels. A
// portrait card/profile photo can therefore look correctly upright in the
// preview while the face detector sees it sideways or upside-down, causing
// spurious "no face" / "move closer" failures. This module reads the tag and
// bakes the correction into the actual pixel data via canvas, once, so every
// downstream consumer (detector, preview, upload, OCR) sees the same
// already-upright image regardless of source orientation.

// Exported for unit testing (pure buffer parsing, no DOM required) — the
// canvas-drawing half of this module needs a real browser and stays
// integration-tested only, same as the rest of FaceCapture/PhotoUpload.
export function readExifOrientation(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  // Not a JPEG (no SOI marker) — PNG/WebP/etc. have no EXIF orientation
  // concept, default to "normal".
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  while (offset < view.byteLength - 1) {
    const marker = view.getUint16(offset);
    offset += 2;
    if (marker === 0xffe1) {
      // APP1 segment — verify it's actually "Exif\0\0" before trusting the
      // TIFF header that follows.
      if (view.getUint32(offset + 2) !== 0x45786966) return 1;
      const tiffOffset = offset + 8;
      const little = view.getUint16(tiffOffset) === 0x4949;
      const firstIfdOffset = view.getUint32(tiffOffset + 4, little);
      const dirStart = tiffOffset + firstIfdOffset;
      const entries = view.getUint16(dirStart, little);
      for (let i = 0; i < entries; i++) {
        const entryOffset = dirStart + 2 + i * 12;
        if (view.getUint16(entryOffset, little) === 0x0112) {
          return view.getUint16(entryOffset + 8, little);
        }
      }
      return 1;
    } else if ((marker & 0xff00) !== 0xff00) {
      break; // not a valid marker — stop scanning
    } else if (marker === 0xffd9 || marker === 0xffda || (marker >= 0xffd0 && marker <= 0xffd7)) {
      // EOI, start-of-scan, or a restart marker — none carry a length field.
      // SOS in particular means the marker-structured header is over; there's
      // nothing more here worth scanning for.
      break;
    } else if (offset + 1 >= view.byteLength) {
      break; // not enough bytes left to read a length field
    } else {
      offset += view.getUint16(offset);
    }
  }
  return 1;
}

// Canvas transform per EXIF orientation value (1-8), applied before drawing
// so the output pixels are upright regardless of input orientation. Swaps
// canvas width/height for the four orientations that involve a 90° turn.
function applyOrientationTransform(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number,
) {
  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, height, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, height, width);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, width);
      break;
    default:
      break; // 1 (or unknown) — no transform needed
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't decode that image."));
    img.src = src;
  });
}

/**
 * Reads a File, corrects for EXIF orientation, and returns a normalized
 * upright JPEG as a data URL — accepts portrait or landscape source photos
 * of any orientation and produces consistent output every consumer
 * (detector, preview, upload, OCR) can rely on. Also incidentally strips
 * EXIF metadata (GPS, etc.) from the re-encoded output.
 */
export async function normalizeImageOrientation(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const orientation = readExifOrientation(buffer);

  const objectUrl = URL.createObjectURL(new Blob([buffer], { type: file.type }));
  try {
    const img = await loadImage(objectUrl);
    const swapDims = orientation >= 5 && orientation <= 8;
    const canvas = document.createElement("canvas");
    canvas.width = swapDims ? img.naturalHeight : img.naturalWidth;
    canvas.height = swapDims ? img.naturalWidth : img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    applyOrientationTransform(ctx, orientation, img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
