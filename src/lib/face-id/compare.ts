// Face-embedding similarity, ported from @vladmandic/human's own
// distance()/similarity() functions (src/face/match.ts) rather than plain
// cosine similarity. Cosine similarity does not separate different people
// well on this model's embeddings — verified against production data, a
// genuine self-match scored only ~0.90 cosine while a suspected
// different-person match scored ~0.76, an unworkable margin that let an
// impostor's check-in pass. human's own Euclidean-distance-based formula is
// what this embedding model was actually calibrated against, with a
// documented "similarity above 0.5 can be considered a match" boundary.
// Reimplemented standalone (not imported from `human`) so this stays a
// zero-dependency function safe to run in server code without loading the
// full face-detection library.
const ORDER = 2; // Euclidean distance (human's default)
const MULTIPLIER = 25; // human's own default multiplier for `distance()`
const NORM_MIN = 0.2; // human's own default normalization range for `similarity()`
const NORM_MAX = 0.8;

export function faceSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff ** ORDER;
  }
  const dist = Math.round(100 * MULTIPLIER * sum) / 100;
  if (dist === 0) return 1;

  const root = Math.sqrt(dist);
  const norm = (1 - root / 100 - NORM_MIN) / (NORM_MAX - NORM_MIN);
  return Math.round(100 * Math.max(Math.min(norm, 1), 0)) / 100;
}
