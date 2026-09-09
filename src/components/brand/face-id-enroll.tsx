"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman, extractEmbedding } from "@/lib/face-id/embedding";
import { runLivenessCheck } from "@/lib/face-id/liveness";
import { checkFaceFraming } from "@/lib/face-id/quality";
import { enrollFace } from "@/lib/supabase/face-id";
import { toast } from "sonner";

interface Props {
  onDone: () => void;
}

export function FaceIdEnroll({ onDone }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "blink" | "turn" | "checking" | "retry">("idle");
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
    setState("blink");
    setMessage(null);
    try {
      const human = await loadHuman();
      const liveness = await runLivenessCheck(human, video, (phase) => {
        if (phase === "blink") setState("blink");
        else if (phase === "turn") setState("turn");
        else setState("checking");
      });

      if (!liveness.blinkDetected) {
        setState("retry");
        setMessage("We didn't catch a blink — look at the camera and try again.");
        return;
      }
      if (!liveness.headTurnDetected) {
        setState("retry");
        setMessage("We didn't catch a head turn — look at the camera and try again.");
        return;
      }

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

      const snapshotImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = snapshotBase64;
      });
      const framing = await checkFaceFraming(human, snapshotImage);

      const result = await enrollFace({
        data: {
          embedding: face.embedding,
          livenessPassed: liveness.passed,
          qualityPassed: framing.ok,
          snapshotBase64,
        },
      });

      if (result.status === "VERIFIED") {
        toast.success("Face ID registered!");
        onDone();
        return;
      }

      setState("retry");
      setMessage(result.reason);
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
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          {message}
        </div>
      )}
      <WakeoutButton
        variant="primary"
        size="default"
        disabled={state === "blink" || state === "turn" || state === "checking" || !!cameraError}
        onClick={runCheck}
        className="w-full"
      >
        {state === "blink" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Blink your eyes…
          </>
        ) : state === "turn" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Turn your head left or right…
          </>
        ) : state === "checking" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
          </>
        ) : (
          "Start live verification"
        )}
      </WakeoutButton>
    </div>
  );
}
