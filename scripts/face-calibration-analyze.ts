// scripts/face-calibration-analyze.ts
//
// Input: a CSV of raw 1024-dim descriptors, one row per capture, each row
// "person_id,d0,d1,...,d1023" — build this from whatever the calibration
// capture flow (docs/face-match/calibration-protocol.md) produces.
//
// This is offline analysis tooling for the threshold-calibration experiment.
// It is NOT run against production data and does not touch the DB/network.
// `loadDescriptors`, `computeScores`, and `sweep` are exported so they can be
// unit-tested independently with synthetic data (see
// src/tests/lib/face-calibration.test.ts) — the CLI entry point below only
// runs when this file is executed directly (`tsx scripts/face-calibration-analyze.ts ...`),
// not when its functions are imported for tests.
import { readFileSync, writeFileSync } from "fs";
import { pathToFileURL } from "url";
import { l2normalize, cosine } from "../src/lib/face/similarity";

export function loadDescriptors(path: string): Map<string, number[][]> {
  const byPerson = new Map<string, number[][]>();
  const lines = readFileSync(path, "utf8").trim().split("\n");
  for (const line of lines) {
    const [personId, ...vec] = line.split(",");
    const arr = vec.map(Number);
    if (!byPerson.has(personId)) byPerson.set(personId, []);
    byPerson.get(personId)!.push(arr);
  }
  return byPerson;
}

export function computeScores(byPerson: Map<string, number[][]>) {
  const genuine: number[] = [];
  const impostor: number[] = [];
  const people = [...byPerson.keys()];
  for (const person of people) {
    const captures = byPerson.get(person)!.map(l2normalize);
    for (let i = 0; i < captures.length; i++) {
      for (let j = i + 1; j < captures.length; j++) genuine.push(cosine(captures[i], captures[j]));
    }
  }
  for (let a = 0; a < people.length; a++) {
    for (let b = a + 1; b < people.length; b++) {
      const capsA = byPerson.get(people[a])!.map(l2normalize);
      const capsB = byPerson.get(people[b])!.map(l2normalize);
      for (const ca of capsA) for (const cb of capsB) impostor.push(cosine(ca, cb));
    }
  }
  return { genuine, impostor };
}

export function sweep(genuine: number[], impostor: number[]) {
  const rows: { threshold: number; far: number; frr: number }[] = [];
  for (let t = 0; t <= 1; t += 0.01) {
    const far = impostor.filter((s) => s >= t).length / impostor.length;
    const frr = genuine.filter((s) => s < t).length / genuine.length;
    rows.push({ threshold: Math.round(t * 100) / 100, far, frr });
  }
  let eer = rows[0];
  for (const r of rows) if (Math.abs(r.far - r.frr) < Math.abs(eer.far - eer.frr)) eer = r;
  return { rows, eer };
}

function main() {
  const [, , inputPath] = process.argv;
  if (!inputPath) {
    console.error("Usage: tsx scripts/face-calibration-analyze.ts <descriptors.csv>");
    process.exit(1);
  }

  const byPerson = loadDescriptors(inputPath);
  const { genuine, impostor } = computeScores(byPerson);
  const { rows, eer } = sweep(genuine, impostor);

  writeFileSync("genuine_scores.csv", genuine.join("\n"));
  writeFileSync("impostor_scores.csv", impostor.join("\n"));
  writeFileSync(
    "far_frr_sweep.csv",
    "threshold,far,frr\n" + rows.map((r) => `${r.threshold},${r.far},${r.frr}`).join("\n"),
  );

  console.log(`genuine pairs: ${genuine.length}, impostor pairs: ${impostor.length}`);
  console.log(
    `EER around threshold ${eer.threshold} (FAR ${eer.far.toFixed(3)}, FRR ${eer.frr.toFixed(3)})`,
  );
  console.log(
    `Recommended face_live_threshold (EER minus a small margin, favoring false-accept over false-reject): ${(eer.threshold - 0.03).toFixed(2)}`,
  );
  console.log("Wrote genuine_scores.csv, impostor_scores.csv, far_frr_sweep.csv");
}

// Only run the CLI when this file is executed directly, not when imported (e.g. by tests).
const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) main();
