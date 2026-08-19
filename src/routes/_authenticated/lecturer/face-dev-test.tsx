// src/routes/_authenticated/lecturer/face-dev-test.tsx
// TEMPORARY — delete once Task 3's verify-identity.tsx supersedes it.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { loadHuman } from "@/lib/face/human-loader";
import { extractDescriptor } from "@/lib/face/descriptor";
import { passesQualityGate } from "@/lib/face/quality";
import { cosine, l2normalize } from "@/lib/face/similarity";

export const Route = createFileRoute("/_authenticated/lecturer/face-dev-test")({
  component: FaceDevTest,
});

function FaceDevTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("loading Human…");
  const [selfSim, setSelfSim] = useState<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      await loadHuman();
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("ready");
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function capture() {
    const human = await loadHuman();
    if (!human || !videoRef.current) return;
    const r = await extractDescriptor(human, videoRef.current);
    const gate = passesQualityGate(r);
    if (!gate.ok || !r) {
      setStatus(`quality gate failed: ${gate.reason}`);
      return;
    }
    const a = l2normalize(r.descriptor);
    setSelfSim(cosine(a, a));
    setStatus(
      `descriptor length ${r.descriptor.length}, antispoof ${r.antispoofScore.toFixed(2)}, liveness ${r.livenessScore.toFixed(2)}`,
    );
  }

  return (
    <div className="p-8 space-y-4">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-96 border-2 border-ink rounded-xl"
      />
      <p className="font-mono text-sm">{status}</p>
      {selfSim !== null && (
        <p className="font-mono text-sm">self-similarity: {selfSim.toFixed(4)} (expect ~1.0)</p>
      )}
      <button onClick={capture} className="px-4 py-2 bg-lime border-2 border-ink rounded-xl">
        Capture
      </button>
    </div>
  );
}
