// src/lib/face/similarity.ts
//
// Pure vector math for facial-identity comparison. No I/O. Kept separate from
// any server function so it stays trivially unit-testable and citable in the
// FYP report's methodology chapter.

export function l2normalize(v: number[]): number[] {
  let sumSquares = 0;
  for (const x of v) sumSquares += x * x;
  const norm = Math.sqrt(sumSquares) || 1;
  return v.map((x) => x / norm);
}

/** Cosine similarity of two already-L2-normalized vectors = their dot product. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`dimension mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Best-of match across all stored reference samples. max-of, NOT mean-of:
 * this is what tolerates a differently-worn hijab, glasses on/off, or a
 * haircut — one good match among several references is enough to pass.
 */
export function bestMatch(probe: number[], refs: number[][]): number {
  if (refs.length === 0) return -1;
  const p = l2normalize(probe);
  return Math.max(...refs.map((r) => cosine(p, l2normalize(r))));
}

/** pgvector returns "[0.1,0.2,...]" as text over PostgREST/pg. */
export function parseVector(s: string | number[]): number[] {
  if (Array.isArray(s)) return s;
  return JSON.parse(s);
}
