// src/tests/lib/face-calibration.test.ts
//
// Known-answer correctness checks for the calibration analysis script's pure
// math (scripts/face-calibration-analyze.ts). Unlike a random-noise synthetic
// run (which only proves the script doesn't crash), these construct genuine
// pairs with cosine similarity exactly 1.0 (identical vectors) and impostor
// pairs with cosine similarity exactly 0.0 (orthogonal vectors) — a case
// where the correct FAR/FRR/EER values can be worked out by hand and checked
// exactly, not just "looks plausible".
import { describe, it, expect } from "vitest";
import { computeScores, sweep } from "../../../scripts/face-calibration-analyze";

describe("computeScores", () => {
  it("scores identical same-person vectors as genuine similarity 1.0 and orthogonal cross-person vectors as impostor similarity 0.0", () => {
    // Person A: two identical captures -> 1 genuine pair, similarity 1.0.
    // Person B: two identical captures -> 1 genuine pair, similarity 1.0.
    // A vs B: every capture in A is orthogonal to every capture in B ->
    // 2x2 = 4 impostor pairs, similarity 0.0.
    const byPerson = new Map<string, number[][]>([
      [
        "A",
        [
          [1, 0, 0],
          [1, 0, 0],
        ],
      ],
      [
        "B",
        [
          [0, 1, 0],
          [0, 1, 0],
        ],
      ],
    ]);

    const { genuine, impostor } = computeScores(byPerson);

    expect(genuine).toHaveLength(2);
    for (const s of genuine) expect(s).toBeCloseTo(1.0, 10);

    expect(impostor).toHaveLength(4);
    for (const s of impostor) expect(s).toBeCloseTo(0.0, 10);
  });
});

describe("sweep (known-answer EER)", () => {
  // genuine = [1, 1] (2 identical-vector pairs), impostor = [0, 0, 0, 0]
  // (4 orthogonal-vector pairs) — the output of the computeScores case above.
  //
  // Worked out by hand:
  //   FAR(t) = fraction of impostor scores >= t. All impostor scores are 0,
  //     so FAR(t) = 1 for t = 0.00, and FAR(t) = 0 for every t >= 0.01.
  //   FRR(t) = fraction of genuine scores < t. All genuine scores are 1,
  //     so FRR(t) = 0 for every t <= 1.00 (the sweep never reaches t > 1).
  //
  // So |FAR - FRR| = 1 at t = 0.00, and = 0 for every t from 0.01 to 1.00.
  // The EER search keeps the *first* row that strictly improves on the
  // running best, so it locks onto the first threshold where the gap drops
  // to 0: t = 0.01, FAR = 0, FRR = 0. (The "true" EER for a perfectly
  // separated distribution is any value in (0, 1]; 0.01 is the finest this
  // 0.01-step sweep can resolve, which is exactly what should happen.)
  const genuine = [1, 1];
  const impostor = [0, 0, 0, 0];

  it("computes FAR/FRR = 1/0 at threshold 0 (everything accepted)", () => {
    const { rows } = sweep(genuine, impostor);
    const row0 = rows.find((r) => r.threshold === 0);
    expect(row0).toBeDefined();
    expect(row0!.far).toBeCloseTo(1, 10);
    expect(row0!.frr).toBeCloseTo(0, 10);
  });

  it("computes FAR/FRR = 0/0 for every threshold from 0.01 to 1.00", () => {
    const { rows } = sweep(genuine, impostor);
    for (const r of rows) {
      if (r.threshold === 0) continue;
      expect(r.far).toBeCloseTo(0, 10);
      expect(r.frr).toBeCloseTo(0, 10);
    }
  });

  it("lands the EER at threshold 0.01 with FAR = FRR = 0", () => {
    const { eer } = sweep(genuine, impostor);
    expect(eer.threshold).toBeCloseTo(0.01, 10);
    expect(eer.far).toBeCloseTo(0, 10);
    expect(eer.frr).toBeCloseTo(0, 10);
  });
});
