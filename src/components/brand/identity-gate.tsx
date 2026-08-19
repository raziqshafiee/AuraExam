// src/components/brand/identity-gate.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman } from "@/lib/face/human-loader";
import { extractDescriptor } from "@/lib/face/descriptor";
import { passesQualityGate } from "@/lib/face/quality";
import { faceVerify } from "@/lib/supabase/face";

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

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    });
    loadHuman();
  }, []);

  async function runCheck() {
    setState("checking");
    const human = await loadHuman();
    if (!human || !videoRef.current) return;
    const r = await extractDescriptor(human, videoRef.current);
    const gate = passesQualityGate(r);
    if (!gate.ok || !r) { setGuidance(gate.reason ?? "Try again"); setState("retry"); return; }

    const res = await faceVerify({
      data: { context: "lobby", examId, embeddings: [r.descriptor], antispoofScore: r.antispoofScore, livenessScore: r.livenessScore },
    });
    if (res.passed) { setState("passed"); onPassed(false); }
    else if (res.attemptsRemaining > 0) { setGuidance(res.guidance ?? null); setState("retry"); }
    else { setState("failsoft"); onPassed(true); }
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
      {state === "failsoft" && (
        <p className="text-sm text-pink">We couldn't confirm your identity — your lecturer has been notified. You may still begin.</p>
      )}
    </div>
  );
}
