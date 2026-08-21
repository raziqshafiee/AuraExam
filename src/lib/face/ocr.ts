// src/lib/face/ocr.ts
//
// Server-only: reads printed text off an uploaded matric card photo via
// Tesseract.js. Imported only from src/lib/supabase/face.ts's createServerFn
// handlers, so this (and its ~10MB+ language data) never reaches the client
// bundle — TanStack Start strips server-function handler imports from client
// output the same way it already does for nodemailer in mailer.ts.
//
// SCOPE: only ever called on the FRONT of the card. The matric card in this
// deployment doubles as a bank debit card (MySISWA co-brand) — its back has
// a full card number, expiry, and CVV. Nothing in this module, or anywhere
// in the enrollment flow, requests or processes a back-of-card image.
import { createWorker } from "tesseract.js";

export type CardOcrResult = {
  name: string | null;
  matricNo: string | null;
  rawText: string;
};

const NEXT_LABEL_RE = /^(no\.?\s*matri?k|kursus|fakulti)\b/i;
const NAME_LABEL_RE = /nama\s*[:.]?\s*(.*)/i;
const MATRIC_LABEL_RE = /no\.?\s*matri?k\s*[:.]?\s*([A-Za-z0-9]{4,12})/i;

/**
 * Pure text parsing, split out from the Tesseract call so it's cheaply
 * unit-testable against real OCR output samples without needing an image or
 * the ~10MB language data. Anchors on the "Nama"/"No. Matrik" labels
 * (present on this institution's card layout) rather than fixed coordinates,
 * since uploaded photos vary in crop/rotation/skew.
 */
export function parseCardText(rawText: string): CardOcrResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let name: string | null = null;
  let matricNo: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const nameMatch = lines[i].match(NAME_LABEL_RE);
    if (nameMatch) {
      let value = nameMatch[1].trim();
      // "Nama" often wraps to the next line(s) on this card layout — keep
      // absorbing lines until the next known field label appears.
      let j = i + 1;
      while (j < lines.length && !NEXT_LABEL_RE.test(lines[j])) {
        value += " " + lines[j];
        j++;
      }
      const cleaned = value.replace(/\s+/g, " ").trim();
      if (cleaned) name = cleaned;
    }

    const matricMatch = lines[i].match(MATRIC_LABEL_RE);
    if (matricMatch) matricNo = matricMatch[1].toUpperCase();
  }

  return { name, matricNo, rawText };
}

export async function ocrMatricCard(imageBuffer: Buffer): Promise<CardOcrResult> {
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(imageBuffer);
    return parseCardText(text);
  } finally {
    await worker.terminate();
  }
}
