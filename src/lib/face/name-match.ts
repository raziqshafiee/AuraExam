// src/lib/face/name-match.ts
//
// Pure text-matching for OCR'd card fields against known-good values. No I/O,
// unit-testable in isolation (same rationale as similarity.ts).

function normalizeNameTokens(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Token-overlap (Jaccard-style) similarity between two names, 0..1.
 * Tolerant of OCR noise (a dropped/misread token) and word-order
 * differences — Malaysian names carry BIN/BINTI patronymics that OCR often
 * clips at a line wrap, so exact string equality would be too strict.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeNameTokens(a));
  const tb = new Set(normalizeNameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

/**
 * There's no typed matric number to compare OCR against anymore — the
 * OCR'd value on the card IS the saved value. This only sanity-checks that
 * OCR actually found something identifier-shaped (not empty, not pure noise)
 * before trusting it — a genuinely unreadable card should fail this, not
 * silently save garbage to profiles.matric_no.
 */
export function isPlausibleMatric(s: string): boolean {
  const cleaned = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length >= 5 && cleaned.length <= 12 && /[0-9]/.test(cleaned);
}
