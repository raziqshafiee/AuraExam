"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman, extractEmbedding } from "@/lib/face-id/embedding";
import { checkInExam } from "@/lib/supabase/face-id";

interface Props {
  examId: string;
  onPassed: (token: string) => void;
}

export function FaceIdCheckin({ examId, onPassed }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "checking" | "retry" | "waiting">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Evidence for the invigilator queue when a check-in runs out of attempts.
  // Captured on every attempt — only the frame from the attempt that actually
  // exhausts them is stored server-side, and this keeps the client simple.
  function captureFrame(video: HTMLVideoElement): string | undefined {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (!canvas.width || !canvas.height) return undefined;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.6);
    } catch {
      return undefined;
    }
  }

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
        }
      })
      .catch((err: any) => {
        setCameraError(
          err?.name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera in your browser's address bar, then reload this page."
            : "We couldn't start your camera. Check that no other app is using it, then reload this page.",
        );
      });
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  // Polls check-in status every 10s while waiting on manual invigilator
  // clearance — there is deliberately no client-side timeout here (see spec
  // §4: no auto-admit).
  useEffect(() => {
    if (state !== "waiting") return;
    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        const human = await loadHuman();
        const face = await extractEmbedding(human, video);
        if (!face) return;
        const result = await checkInExam({
          data: {
            examId,
            embedding: face.embedding,
            liveSnapshotBase64: captureFrame(video),
          },
        });
        if (result.outcome === "verified") {
          clearInterval(interval);
          onPassed(result.token);
        }
      } catch {
        // A poll that fails (network blip, exam window closed) must not throw
        // out of the interval — the next tick retries.
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [state, examId, onPassed]);

  async function runCheck() {
    const video = videoRef.current;
    if (!video) return;
    setState("checking");
    setMessage(null);
    try {
      const human = await loadHuman();
      const face = await extractEmbedding(human, video);
      if (!face) {
        setState("retry");
        setMessage("No face detected — position yourself in front of the camera.");
        return;
      }
      const result = await checkInExam({
        data: {
          examId,
          embedding: face.embedding,
          liveSnapshotBase64: captureFrame(video),
        },
      });
      if (result.outcome === "verified") {
        onPassed(result.token);
      } else if (result.outcome === "checkin-pending-review") {
        setState("waiting");
        setMessage(
          "We couldn't confirm a match. Waiting for your lecturer or admin to clear you in.",
        );
      } else {
        setState("retry");
        setMessage(
          `Match too low (${Math.round(result.score * 100)}%). ${result.attemptsRemaining} attempt(s) left.`,
        );
      }
    } catch (err: any) {
      setState("retry");
      setMessage(err?.message ?? "Something went wrong. Try again.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="aspect-video rounded-2xl border-2 border-ink bg-secondary overflow-hidden">
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
      </div>
      {cameraError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-pink/10 border-2 border-pink text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {cameraError}
        </div>
      )}
      {message && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber/10 border-2 border-amber text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {message}
        </div>
      )}
      {state !== "waiting" && (
        <WakeoutButton
          variant="primary"
          size="default"
          disabled={state === "checking" || !!cameraError}
          onClick={runCheck}
          className="w-full"
        >
          {state === "checking" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Checking in…
            </>
          ) : (
            "Start Face ID check-in"
          )}
        </WakeoutButton>
      )}
      {state === "waiting" && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for clearance — this page checks
          automatically.
        </p>
      )}
    </div>
  );
}
