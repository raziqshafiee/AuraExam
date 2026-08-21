// src/components/brand/identity-gate.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman } from "@/lib/face/human-loader";
import { extractDescriptor } from "@/lib/face/descriptor";
import { passesQualityGate } from "@/lib/face/quality";
import { faceVerify, getIdentityCheckinStatus } from "@/lib/supabase/face";
import { withTimeout } from "@/lib/face/with-timeout";

// Client-side cap on quality-gate/error failures that never reach faceVerify
// (bad camera, permanently poor lighting, thrown exceptions, permission
// denial, etc.) — independent of and in addition to the server-authoritative
// attempt count faceVerify itself tracks (which only ever sees attempts that
// DID produce a usable frame). Without this, a student whose camera never
// yields a passing frame has no path to attemptsRemaining === 0 server-side
// and would be stuck retrying forever — a Global Constraint #8 violation
// (fail-soft, everywhere). Mirrors the server's default maxAttempts (3);
// hardcoded because settings aren't available client-side to a student.
const MAX_CLIENT_RETRIES = 3;

export function IdentityGate({
  examId,
  onPassed,
}: {
  examId: string;
  onPassed: (elevated: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<
    "idle" | "checking" | "passed" | "retry" | "failsoft" | "queued" | "rejected"
  >("idle");
  const [guidance, setGuidance] = useState<string | null>(null);
  const clientFailCount = useRef(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Which cause tripped fail-soft, so the UI can show an honest message.
  // "server": faceVerify itself returned attemptsRemaining: 0 (or the
  //   no-active-enrollment case) — a face_verifications row was written and
  //   the lecturer WAS actually notified server-side (see notifyIdentityUnverified
  //   in src/lib/supabase/face.ts).
  // "client": the MAX_CLIENT_RETRIES cap tripped without ever reaching
  //   faceVerify (bad camera, no face ever detected, thrown errors) — no
  //   verification attempt was ever logged and no one was notified, so the
  //   copy must not claim otherwise.
  const [failsoftReason, setFailsoftReason] = useState<"server" | "client" | null>(null);

  // Any failure that never produced a server-side faceVerify attempt (quality
  // gate rejection, camera error, thrown exception) routes through here so it
  // counts toward MAX_CLIENT_RETRIES and is guaranteed to terminate in
  // fail-soft, exactly like a server-exhausted attempt count does.
  function handleClientFailure(reason: string) {
    clientFailCount.current += 1;
    if (clientFailCount.current >= MAX_CLIENT_RETRIES) {
      setFailsoftReason("client");
      setState("failsoft");
      onPassed(true);
    } else {
      setGuidance(reason);
      setState("retry");
    }
  }

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch(() => {
        handleClientFailure(
          "Camera access is required — check your browser permissions and try again.",
        );
      });
    loadHuman();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling() {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await getIdentityCheckinStatus({ data: { examId } });
        if (res.status === "cleared" || res.status === "auto_admitted") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setState("passed");
          onPassed(false);
        } else if (res.status === "rejected") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setState("rejected");
        }
      } catch {
        // Transient poll failure — try again on the next tick, don't surface an error.
      }
    }, 10_000);
  }

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  async function runCheck() {
    setState("checking");
    try {
      // Every step is timeout-bounded (Global Constraint #8: fail-soft,
      // everywhere) — mirrors the pattern in exams.$examId.take.tsx's
      // handleIdentityTrigger/fireSubmitIdentityCheck. withTimeout never
      // rejects; it resolves to null on a hang, thrown error, or rejection,
      // so a null here is treated exactly like a !human/!gate.ok failure and
      // routed through the same bounded handleClientFailure retry cap —
      // otherwise a genuine hang would leave `state` stuck at "checking"
      // forever and the lobby's Start button would never re-enable.
      const human = await withTimeout(loadHuman(), 15_000);
      if (!human || !videoRef.current) {
        handleClientFailure("Camera isn't ready yet — try again.");
        return;
      }
      const r = await withTimeout(extractDescriptor(human, videoRef.current), 10_000);
      const gate = passesQualityGate(r);
      if (!gate.ok || !r) {
        handleClientFailure(gate.reason ?? "Try again");
        return;
      }

      const res = await withTimeout(
        faceVerify({
          data: {
            context: "lobby",
            examId,
            embeddings: [r.descriptor],
            antispoofScore: r.antispoofScore,
            livenessScore: r.livenessScore,
          },
        }),
        10_000,
      );
      if (!res) {
        handleClientFailure("Something went wrong — check your camera connection and try again.");
        return;
      }
      if (res.passed) {
        setState("passed");
        onPassed(false);
      } else if (res.attemptsRemaining > 0) {
        setGuidance(res.guidance ?? null);
        setState("retry");
      } else if ((res as any).rejected) {
        setState("rejected");
      } else if ((res as any).queued) {
        setState("queued");
        startPolling();
      } else {
        // Non-lobby context (or the no-active-enrollment case) still
        // fail-softs exactly as before: faceVerify already wrote a
        // face_verifications row and notified the lecturer (see
        // notifyIdentityUnverified in src/lib/supabase/face.ts) — safe to
        // claim that in the UI.
        setFailsoftReason("server");
        setState("failsoft");
        onPassed(true);
      }
    } catch {
      // Camera glitch, transient network failure, or a server error — never
      // leave state stuck at "checking". Route through the same bounded
      // client-side retry cap as a quality-gate failure.
      handleClientFailure("Something went wrong — check your camera connection and try again.");
    }
  }

  return (
    <div className="space-y-3">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full aspect-video rounded-2xl border-2 border-ink object-cover"
      />
      {state === "idle" && (
        <WakeoutButton className="w-full" onClick={runCheck}>
          Check identity
        </WakeoutButton>
      )}
      {state === "checking" && (
        <p className="flex items-center gap-2 justify-center text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking…
        </p>
      )}
      {state === "passed" && (
        <p className="flex items-center gap-2 justify-center text-green-700 font-semibold">
          <CheckCircle className="w-4 h-4" /> Identity confirmed check
        </p>
      )}
      {state === "retry" && (
        <div className="space-y-2">
          <p className="text-sm text-amber-600 flex items-center gap-1.5">
            <XCircle className="w-4 h-4" /> {guidance}
          </p>
          <WakeoutButton className="w-full" onClick={runCheck}>
            Try again
          </WakeoutButton>
        </div>
      )}
      {state === "failsoft" && failsoftReason === "client" && (
        <p className="text-sm text-pink">
          We couldn't get a clear view of your face after several tries — you may still begin. This
          attempt may be reviewed by your lecturer.
        </p>
      )}
      {state === "failsoft" && failsoftReason !== "client" && (
        <p className="text-sm text-pink">
          We couldn't confirm your identity — your lecturer has been notified. You may still begin.
        </p>
      )}
      {state === "queued" && (
        <p className="text-sm text-sky flex items-center gap-1.5">
          <Loader2 className="w-4 h-4 animate-spin" /> Waiting for your lecturer to confirm your
          identity — you'll be let in automatically within 5 minutes even if nobody responds sooner.
        </p>
      )}
      {state === "rejected" && (
        <p className="text-sm text-pink">
          Your identity could not be confirmed for this exam. Contact your lecturer.
        </p>
      )}
    </div>
  );
}
