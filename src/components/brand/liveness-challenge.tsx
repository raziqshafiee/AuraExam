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

// How often we poll getSignal() for the live "detected" indicator. A real
// blink only lasts ~100-400ms, so a manual click can easily miss the window
// entirely — the poll below LATCHES a positive observation and auto-advances
// the step the instant it sees one, instead of only driving the visual pill
// and waiting for a fresh instantaneous sample at click time.
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

  // Live "is the current step passing right now" indicator. For turn_left/
  // turn_right, yawDeg reflects a head pose that can be HELD — a fresh sample
  // at an arbitrary later instant (e.g. the manual Check click) is still
  // valid, so no latching is needed there. For blink_once/blink_twice, the
  // eyes-closed blendshape score is only true for the ~100-400ms the eyes are
  // actually shut — sampling fresh at click time means the student would have
  // to click during that exact blind window, which is effectively
  // unpassable. So: the instant a poll observes the step as satisfied, latch
  // it and auto-advance immediately, instead of only updating the visual
  // pill and waiting for a separate click to re-sample. This fixes both step
  // types uniformly (turns still pass immediately once held; blinks are
  // finally catchable at all) and removes the need for perfectly-timed
  // manual clicks. `latched` is a local flag (not state) so a single
  // interval tick can never double-advance before cleanup runs.
  useEffect(() => {
    if (!current) {
      setLiveDetected(false);
      return;
    }
    setLiveDetected(false);
    let latched = false;
    const interval = setInterval(() => {
      if (latched) return;
      const { blendshapes, yawDeg } = getSignalRef.current();
      const ok = verifyLivenessStep(current, blendshapes, yawDeg);
      setLiveDetected(ok);
      if (ok) {
        latched = true;
        clearInterval(interval);
        setDoneSteps((prev) => {
          if (prev[prev.length - 1] === current) return prev; // already advanced (race with checkNow)
          const next = [...prev, current];
          if (next.length === steps.length) onComplete(next);
          return next;
        });
      }
    }, LIVE_POLL_MS);
    return () => clearInterval(interval);
  }, [current]);

  // Manual fallback — kept for turn_left/turn_right (a held pose is easy to
  // re-sample on demand) and as a backstop if the poll's auto-advance is
  // ever slow to land. Harmless no-op if the step already auto-advanced:
  // `current` will have moved on by the time this re-renders with a stale
  // closure, or the functional setDoneSteps update above already covers the
  // double-push case.
  function checkNow() {
    if (!current) return;
    const { blendshapes, yawDeg } = getSignal();
    if (verifyLivenessStep(current, blendshapes, yawDeg)) {
      setDoneSteps((prev) => {
        if (prev[prev.length - 1] === current) return prev;
        const next = [...prev, current];
        setLiveDetected(false);
        if (next.length === steps.length) onComplete(next);
        return next;
      });
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
          {liveDetected ? "Detected!" : "Waiting for movement…"}
        </div>
      )}
      {current && (
        <WakeoutButton size="sm" onClick={checkNow}>
          Check now
        </WakeoutButton>
      )}
      {current && (
        <p className="text-[11px] text-muted-foreground">
          The step advances automatically as soon as it's detected — "Check now" is just a manual nudge if it's slow to register.
        </p>
      )}
    </div>
  );
}
