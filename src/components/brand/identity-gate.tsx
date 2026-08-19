// src/components/brand/identity-gate.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman } from "@/lib/face/human-loader";
import { extractDescriptor } from "@/lib/face/descriptor";
import { passesQualityGate } from "@/lib/face/quality";
import { faceVerify } from "@/lib/supabase/face";

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
  const [state, setState] = useState<"idle" | "checking" | "passed" | "retry" | "failsoft">("idle");
  const [guidance, setGuidance] = useState<string | null>(null);
  const clientFailCount = useRef(0);
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
        handleClientFailure("Camera access is required — check your browser permissions and try again.");
      });
    loadHuman();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCheck() {
    setState("checking");
    try {
      const human = await loadHuman();
      if (!human || !videoRef.current) {
        handleClientFailure("Camera isn't ready yet — try again.");
        return;
      }
      const r = await extractDescriptor(human, videoRef.current);
      const gate = passesQualityGate(r);
      if (!gate.ok || !r) {
        handleClientFailure(gate.reason ?? "Try again");
        return;
      }

      const res = await faceVerify({
        data: { context: "lobby", examId, embeddings: [r.descriptor], antispoofScore: r.antispoofScore, livenessScore: r.livenessScore },
      });
      if (res.passed) {
        setState("passed");
        onPassed(false);
      } else if (res.attemptsRemaining > 0) {
        setGuidance(res.guidance ?? null);
        setState("retry");
      } else {
        // Server-authoritative fail-soft: faceVerify already wrote a
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
      <video ref={videoRef} autoPlay muted playsInline className="w-full aspect-video rounded-2xl border-2 border-ink object-cover" />
      {state === "idle" && <WakeoutButton className="w-full" onClick={runCheck}>Check identity</WakeoutButton>}
      {state === "checking" && <p className="flex items-center gap-2 justify-center text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Checking…</p>}
      {state === "passed" && <p className="flex items-center gap-2 justify-center text-green-700 font-semibold"><CheckCircle className="w-4 h-4" /> Identity confirmed check</p>}
      {state === "retry" && (
        <div className="space-y-2">
          <p className="text-sm text-amber-600 flex items-center gap-1.5"><XCircle className="w-4 h-4" /> {guidance}</p>
          <WakeoutButton className="w-full" onClick={runCheck}>Try again</WakeoutButton>
        </div>
      )}
      {state === "failsoft" && failsoftReason === "client" && (
        <p className="text-sm text-pink">We couldn't get a clear view of your face after several tries — you may still begin. This attempt may be reviewed by your lecturer.</p>
      )}
      {state === "failsoft" && failsoftReason !== "client" && (
        <p className="text-sm text-pink">We couldn't confirm your identity — your lecturer has been notified. You may still begin.</p>
      )}
    </div>
  );
}
