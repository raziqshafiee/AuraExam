// src/components/brand/liveness-challenge.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { WakeoutButton } from "./wakeout-button";
import type { ChallengeStep } from "@/lib/face/liveness";
import { verifyLivenessStep } from "@/lib/face/liveness";

const STEP_LABELS: Record<ChallengeStep, string> = {
  blink_once: "Blink once",
  blink_twice: "Blink twice",
  turn_left: "Turn your head left",
  turn_right: "Turn your head right",
};

// How often we poll getSignal() for the live "detected" indicator. This is
// purely visual feedback — it never advances a step itself, only checkNow()
// (triggered by the user clicking "Check") does that.
const LIVE_POLL_MS = 250;

export function LivenessChallenge({
  steps,
  getSignal,
  onComplete,
}: {
  steps: ChallengeStep[];
  /** Pulls the latest blendshapes/yaw sample from whatever detector is running. */
  getSignal: () => { blendshapes: Record<string, number> | null; yawDeg: number | null };
  onComplete: (completed: string[]) => void;
}) {
  const [doneSteps, setDoneSteps] = useState<string[]>([]);
  const [liveDetected, setLiveDetected] = useState(false);
  const current = steps[doneSteps.length];

  // Ref so the polling interval doesn't need to restart every render just
  // because the parent passes a fresh getSignal closure identity.
  const getSignalRef = useRef(getSignal);
  getSignalRef.current = getSignal;

  // Live "is the current step passing right now" indicator — polled
  // independently of the manual Check button, purely additive visual
  // feedback. Resets/restarts whenever the active step changes.
  useEffect(() => {
    if (!current) {
      setLiveDetected(false);
      return;
    }
    setLiveDetected(false);
    const interval = setInterval(() => {
      const { blendshapes, yawDeg } = getSignalRef.current();
      setLiveDetected(verifyLivenessStep(current, blendshapes, yawDeg));
    }, LIVE_POLL_MS);
    return () => clearInterval(interval);
  }, [current]);

  function checkNow() {
    if (!current) return;
    const { blendshapes, yawDeg } = getSignal();
    if (verifyLivenessStep(current, blendshapes, yawDeg)) {
      const next = [...doneSteps, current];
      setDoneSteps(next);
      setLiveDetected(false);
      if (next.length === steps.length) onComplete(next);
    }
  }

  return (
    <div className="space-y-3 text-center">
      <p className="font-display font-bold text-lg">{current ? STEP_LABELS[current as ChallengeStep] : "All steps complete"}</p>
      <p className="text-xs font-mono text-muted-foreground">{doneSteps.length} / {steps.length} steps</p>
      {current && (
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border-2 border-ink text-xs font-mono transition-colors ${
            liveDetected ? "bg-lime text-ink" : "bg-secondary text-muted-foreground"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${liveDetected ? "bg-ink animate-pulse" : "bg-muted-foreground"}`} />
          {liveDetected ? "Detected — click Check" : "Waiting for movement…"}
        </div>
      )}
      {current && <WakeoutButton size="sm" onClick={checkNow}>Check</WakeoutButton>}
    </div>
  );
}
