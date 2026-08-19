// src/components/brand/face-capture.tsx
"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, CheckCircle } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman } from "@/lib/face/human-loader";
import { extractDescriptor, type DescriptorResult } from "@/lib/face/descriptor";
import { passesQualityGate } from "@/lib/face/quality";

// Module-level promise so the MediaPipe bundle is only fetched once, shared
// across FaceCapture instances (same preload pattern as camera-proctor.tsx).
// This powers a SEPARATE, lightweight, continuous detector used only to draw
// a display-only bounding-box overlay while the camera preview is live.
// Human itself stays strictly on-demand — capture() below still calls
// loadHuman()/extractDescriptor() exactly once, unchanged, on click.
let preloadPromise: Promise<any> | null = null;
function preloadMediaPipe() {
  if (!preloadPromise) {
    preloadPromise = import(
      /* @vite-ignore */
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
    ).catch(() => null);
  }
  return preloadPromise;
}

// Derives a rect from the min/max x/y of normalized (0-1) face landmarks and
// strokes it onto a canvas sized to the video's rendered pixel dimensions.
// Display-only — not a precision requirement.
function drawFaceBox(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  landmarks: Array<{ x: number; y: number }> | undefined,
) {
  if (!canvas || !video) return;
  const w = video.clientWidth || video.videoWidth;
  const h = video.clientHeight || video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks || landmarks.length === 0) return;

  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  ctx.strokeStyle = "#c4f542"; // lime accent, matches design tokens
  ctx.lineWidth = 3;
  ctx.strokeRect(minX * w, minY * h, (maxX - minX) * w, (maxY - minY) * h);
}

export function FaceCapture({
  guide,
  onCapture,
}: {
  guide: string;
  onCapture: (result: DescriptorResult, jpegBase64: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerDetectorRef = useRef<any>(null);
  const trackerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      await loadHuman();
      setStatus("ready");
    } catch {
      setStatus("error");
      setError("Camera access denied — enable it in your browser settings.");
    }
  }, []);

  // Lightweight continuous FaceLandmarker loop, started once the camera
  // preview is ready — purely to drive the bounding-box overlay. Does NOT
  // run Human per-frame (Human stays click-triggered only, inside capture()).
  // Mirrors camera-proctor.tsx's interval/cleanup discipline: stop the
  // interval and close the detector on unmount.
  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;

    (async () => {
      try {
        const mod = await preloadMediaPipe();
        if (cancelled || !mod) return;
        const { FaceLandmarker, FilesetResolver } = mod;
        const resolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const detector = await FaceLandmarker.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (cancelled) {
          detector.close?.();
          return;
        }
        trackerDetectorRef.current = detector;

        trackerIntervalRef.current = setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !trackerDetectorRef.current) return;
          try {
            const result = trackerDetectorRef.current.detectForVideo(video, performance.now());
            drawFaceBox(overlayCanvasRef.current, video, result.faceLandmarks?.[0]);
          } catch {
            // ignore per-frame errors
          }
        }, 500);
      } catch {
        // Tracking overlay failed to start — non-fatal, capture() is unaffected.
      }
    })();

    return () => {
      cancelled = true;
      if (trackerIntervalRef.current) clearInterval(trackerIntervalRef.current);
      trackerIntervalRef.current = null;
      trackerDetectorRef.current?.close?.();
      trackerDetectorRef.current = null;
      const canvas = overlayCanvasRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [status]);

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    // Face detection can throw/reject (model glitch, WebGL context loss, etc).
    // This must never crash the enrollment flow with an unhandled rejection —
    // catch it here and surface it through the existing error state.
    let result: DescriptorResult | null = null;
    try {
      const human = await loadHuman();
      if (!human) {
        setError("Face detector failed to load — please refresh and try again.");
        return;
      }
      result = await extractDescriptor(human, video);
    } catch {
      setError("Face detection failed — please try again.");
      return;
    }
    const gate = passesQualityGate(result);
    if (!gate.ok || !result) {
      setError(gate.reason ?? "Capture failed");
      return;
    }
    setError(null);

    const canvas = canvasRef.current!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const jpegBase64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

    onCapture(result, jpegBase64);
  }

  return (
    <div className="space-y-3">
      <div className="aspect-video rounded-2xl border-2 border-ink bg-secondary overflow-hidden relative flex items-center justify-center">
        <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-cover ${status === "ready" ? "" : "hidden"}`} />
        <canvas ref={canvasRef} className="hidden" />
        {status === "ready" && <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />}
        {status !== "ready" && <Camera className="w-12 h-12 text-muted-foreground" />}
        {status === "ready" && <p className="absolute bottom-2 left-2 px-2 py-1 rounded-full text-[11px] font-mono border-2 border-ink bg-card">{guide}</p>}
      </div>
      {status === "idle" && (
        <WakeoutButton variant="sky" size="sm" onClick={start} className="w-full"><Camera className="w-4 h-4" /> Start camera</WakeoutButton>
      )}
      {status === "ready" && (
        <WakeoutButton variant="primary" size="sm" onClick={capture} className="w-full"><CheckCircle className="w-4 h-4" /> Capture</WakeoutButton>
      )}
      {error && <p className="text-sm text-pink">{error}</p>}
    </div>
  );
}
