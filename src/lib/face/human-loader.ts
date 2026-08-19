// src/lib/face/human-loader.ts
import type { Human } from "@vladmandic/human";
import { HUMAN_CONFIG } from "./human-config";

let humanPromise: Promise<Human | null> | null = null;

export function loadHuman(): Promise<Human | null> {
  if (!humanPromise) {
    humanPromise = import("@vladmandic/human")
      .then(async ({ default: HumanCtor }) => {
        const h = new HumanCtor(HUMAN_CONFIG);
        await h.load();
        return h;
      })
      .catch((err) => {
        console.error("[face] Human failed to load", err);
        return null;
      });
  }
  return humanPromise;
}
