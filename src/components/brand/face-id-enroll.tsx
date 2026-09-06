"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman, extractEmbedding } from "@/lib/face-id/embedding";
import { runLivenessCheck } from "@/lib/face-id/liveness";
import { verifyEnrolment } from "@/lib/supabase/face-id";
import { toast } from "sonner";

interface Props {
  passportEmbedding: number[];
  onDone: (status: "VERIFIED" | "PENDING_REVIEW") => void;
}

export function FaceIdEnroll({ passportEmbedding, onDone }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "checking" | "retry" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

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

  async function runCheck() {
    const video = videoRef.current;
    if (!video) return;
    setState("checking");
    setMessage(null);
    try {
      const human = await loadHuman();
      const liveness = await runLivenessCheck(human, video);
      const face = await extractEmbedding(human, video);
      if (!face) {
        setState("retry");
        setMessage("No face detected — position yourself in front of the camera.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const snapshotBase64 = canvas.toDataURL("image/jpeg", 0.6);

      const result = await verifyEnrolment({
        data: {
          passportEmbedding,
          liveEmbedding: face.embedding,
          livenessPassed: liveness.passed,
          liveSnapshotBase64: snapshotBase64,
        },
      });

      if (result.status === "VERIFIED") {
        toast.success("Face ID registered!");
        onDone("VERIFIED");
      } else if (result.status === "PENDING_REVIEW") {
        setState("failed");
        setMessage(
          "We couldn't confirm a match after 3 attempts. Sent to your lecturer for review.",
        );
        onDone("PENDING_REVIEW");
      } else {
        setState("retry");
        setMessage(`Face didn't match. ${result.attemptsRemaining} attempt(s) left.`);
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
          <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-pink" />
          {cameraError}
        </div>
      )}
      {message && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber/10 border-2 border-amber text-sm">
          {state === "failed" ? (
            <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-pink" />
          ) : (
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          )}
          {message}
        </div>
      )}
      {state !== "failed" && (
        <WakeoutButton
          variant="primary"
          size="default"
          disabled={state === "checking" || !!cameraError}
          onClick={runCheck}
          className="w-full"
        >
          {state === "checking" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
            </>
          ) : (
            "Start live verification"
          )}
        </WakeoutButton>
      )}
    </div>
  );
}
