"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import {
  Camera,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { recordProctorEvent } from "@/lib/supabase/proctor";

type PermState = "idle" | "requesting" | "granted" | "denied";
type FaceState = "idle" | "loading" | "ok" | "missing";

// Grace periods: face-missing uses 3s; multiple-faces uses 8s to avoid
// false-positives from someone briefly walking past in the background.
const FACE_GRACE_MS = 3_000;
const MULTIPLE_FACE_GRACE_MS = 8_000;
const GAZE_GRACE_MS = 5_000;

// Report cooldowns per event type.
const FACE_COOLDOWN_MS = 30_000;
const MULTIPLE_FACE_COOLDOWN_MS = 60_000;
const GAZE_COOLDOWN_MS = 30_000;

interface Props {
  /** setup = lobby camera check (manual start, large preview)
   *  monitor = during exam (auto-start, small floating overlay) */
  mode: "setup" | "monitor";
  /** Called whenever the combined ready state changes.
   *  true = camera granted AND face detected */
  onReady?: (ready: boolean) => void;
  /** Submission being proctored. When provided in monitor mode, the proctor
   *  reports advisory face/gaze events. */
  submissionId?: string;
  /** Called when a hard-flag-worthy camera event fires (multiple faces). The
   *  parent is responsible for calling recordFlag so auto-submit logic lives
   *  in one place. Only fires in monitor mode with a submissionId. */
  onHardFlag?: (type: string, label: string) => void;
}

// Module-level promise so preload is shared across instances and only fires once
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

// Extract yaw (left-right head rotation) and pitch (up-down) from the 4x4
// facial transformation matrix returned by FaceLandmarker (column-major).
function extractHeadAngles(matrixData: Float32Array): { yawDeg: number; pitchDeg: number } {
  // Column 2 (indices 8,9,10) is the face forward/gaze vector in camera space.
  const yawDeg = (Math.atan2(-matrixData[8], matrixData[10]) * 180) / Math.PI;
  const pitchDeg = (Math.asin(Math.max(-1, Math.min(1, matrixData[9]))) * 180) / Math.PI;
  return { yawDeg, pitchDeg };
}

export function CameraProctor({ mode, onReady, submissionId, onHardFlag }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // P-1: track mount state so async continuations don't touch unmounted refs
  const mountedRef = useRef(true);
  const onHardFlagRef = useRef(onHardFlag);
  onHardFlagRef.current = onHardFlag;

  const proctorRef = useRef({
    missingSince: 0,
    multipleSince: 0,
    gazeSince: 0,
    headTurnSince: 0,
    lastMissingReport: 0,
    lastMultipleReport: 0,
    lastGazeReport: 0,
    lastHeadTurnReport: 0,
  });

  const reportingEnabled = mode === "monitor" && !!submissionId;

  const [perm, setPerm] = useState<PermState>("idle");
  const [face, setFace] = useState<FaceState>("idle");

  function report(type: string, label: string) {
    if (!submissionId) return;
    recordProctorEvent({ data: { submissionId, type, label } }).catch(() => {});
  }

  // Called every detection tick (≈500ms). Uses refs so debounce/cooldown state
  // survives re-renders without re-subscribing.
  function handleProctorTick(faceCount: number, matrix: Float32Array | null) {
    const now = Date.now();
    const p = proctorRef.current;

    // ── Face missing (advisory) ──────────────────────────────────────────────
    if (faceCount === 0) {
      if (!p.missingSince) p.missingSince = now;
      if (now - p.missingSince >= FACE_GRACE_MS && now - p.lastMissingReport >= FACE_COOLDOWN_MS) {
        p.lastMissingReport = now;
        report("face-missing", "Face not detected on camera");
      }
    } else {
      p.missingSince = 0;
    }

    // ── Multiple faces → HARD FLAG (8s grace, 60s cooldown) ─────────────────
    if (faceCount > 1) {
      if (!p.multipleSince) p.multipleSince = now;
      if (
        now - p.multipleSince >= MULTIPLE_FACE_GRACE_MS &&
        now - p.lastMultipleReport >= MULTIPLE_FACE_COOLDOWN_MS
      ) {
        p.lastMultipleReport = now;
        onHardFlagRef.current?.("multiple-faces", `${faceCount} faces detected on camera`);
      }
    } else {
      p.multipleSince = 0;
    }

    // ── Gaze tracking (advisory — requires exactly 1 face + transformation matrix)
    if (faceCount === 1 && matrix) {
      const { yawDeg, pitchDeg } = extractHeadAngles(matrix);

      // Head turned strongly left or right (likely reading notes beside the screen)
      if (Math.abs(yawDeg) > 45) {
        if (!p.headTurnSince) p.headTurnSince = now;
        if (
          now - p.headTurnSince >= GAZE_GRACE_MS &&
          now - p.lastHeadTurnReport >= GAZE_COOLDOWN_MS
        ) {
          p.lastHeadTurnReport = now;
          report("head-turned", `Head turned ${yawDeg > 0 ? "right" : "left"} during exam`);
        }
      } else {
        p.headTurnSince = 0;
      }

      // Looking down (likely reading desk notes)
      if (pitchDeg < -30) {
        if (!p.gazeSince) p.gazeSince = now;
        if (
          now - p.gazeSince >= GAZE_GRACE_MS &&
          now - p.lastGazeReport >= GAZE_COOLDOWN_MS
        ) {
          p.lastGazeReport = now;
          report("gaze-away", "Student looking away from screen");
        }
      } else {
        p.gazeSince = 0;
      }
    } else {
      // Reset gaze timers when face count is not exactly 1
      p.headTurnSince = 0;
      p.gazeSince = 0;
    }
  }

  const cleanup = useCallback(() => {
    mountedRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    detectorRef.current?.close?.();
  }, []);

  useEffect(() => {
    preloadMediaPipe();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (mode === "monitor") startCamera();
    return cleanup;
  }, []);

  useEffect(() => {
    onReady?.(perm === "granted" && face === "ok");
  }, [perm, face]);

  async function startCamera() {
    mountedRef.current = true;
    setPerm("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      // P-1: component may have unmounted while getUserMedia was awaiting
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setPerm("granted");
      setFace("loading");
      await loadDetector();
    } catch {
      if (!mountedRef.current) return;
      setPerm("denied");
      if (reportingEnabled) report("camera-lost", "Camera unavailable during exam");
    }
  }

  async function loadDetector() {
    try {
      // @ts-ignore — loaded from CDN at runtime
      const { FaceLandmarker, FilesetResolver } = await preloadMediaPipe();
      if (!mountedRef.current) return;
      const resolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      // FaceLandmarker replaces FaceDetector: gives face count + head-pose matrix
      // for gaze tracking. numFaces: 2 so we detect 1 vs multiple.
      const detector = await FaceLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });
      // P-1: component may have unmounted during the ~26MB model download
      if (!mountedRef.current) {
        detector.close?.();
        return;
      }
      detectorRef.current = detector;

      intervalRef.current = setInterval(() => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || !detectorRef.current) return;
        try {
          const result = detectorRef.current.detectForVideo(video, performance.now());
          const count: number = result.faceLandmarks.length;
          const matrix: Float32Array | null =
            result.facialTransformationMatrixes?.[0]?.data ?? null;
          setFace(count > 0 ? "ok" : "missing");
          if (reportingEnabled) handleProctorTick(count, matrix);
        } catch {
          // ignore per-frame errors
        }
      }, 500);
    } catch {
      if (!mountedRef.current) return;
      setFace("missing");
    }
  }

  // ── Monitor overlay (floating, during exam) ────────────────────
  if (mode === "monitor") {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-44 rounded-2xl border-2 border-ink bg-ink shadow-brut overflow-hidden select-none">
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full aspect-video object-cover"
          />
          {perm === "denied" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/80 gap-1">
              <XCircle className="w-6 h-6 text-pink" />
              <span className="text-[10px] font-mono text-pink">Cam denied</span>
            </div>
          )}
          {perm === "requesting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink/80">
              <Loader2 className="w-6 h-6 text-lime animate-spin" />
            </div>
          )}
        </div>
        <div
          className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono ${
            face === "ok" ? "text-lime" : "text-pink"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full animate-pulse ${
              face === "ok" ? "bg-lime" : "bg-pink"
            }`}
          />
          {face === "ok"
            ? "Face detected"
            : face === "loading"
              ? "Starting…"
              : "No face!"}
        </div>
      </div>
    );
  }

  // ── Setup mode (lobby camera check) ───────────────────────────
  return (
    <div className="space-y-3">
      <div className="aspect-video rounded-2xl border-2 border-ink bg-secondary overflow-hidden relative flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover ${perm === "granted" ? "" : "hidden"}`}
        />
        {perm !== "granted" && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Camera className="w-12 h-12" />
            <span className="text-xs font-mono">Camera inactive</span>
          </div>
        )}

        {perm === "granted" && face !== "idle" && (
          <div
            className={`absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border-2 border-ink ${
              face === "ok"
                ? "bg-lime text-ink"
                : face === "loading"
                  ? "bg-amber text-ink"
                  : "bg-pink text-white"
            }`}
          >
            {face === "ok" && <><CheckCircle className="w-3 h-3" /> Face detected</>}
            {face === "loading" && <><Loader2 className="w-3 h-3 animate-spin" /> Loading detector…</>}
            {face === "missing" && <><XCircle className="w-3 h-3" /> No face detected</>}
          </div>
        )}
      </div>

      {perm === "idle" && (
        <WakeoutButton variant="sky" size="sm" onClick={startCamera} className="w-full">
          <Camera className="w-4 h-4" /> Allow camera access
        </WakeoutButton>
      )}

      {perm === "requesting" && (
        <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-1">
          <Loader2 className="w-4 h-4 animate-spin" /> Waiting for permission…
        </p>
      )}

      {perm === "denied" && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-pink/10 border-2 border-pink text-sm text-pink">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          Camera access denied. Enable it in your browser settings then refresh.
        </div>
      )}

      {perm === "granted" && face === "missing" && (
        <p className="text-sm text-amber-600 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Position your face clearly in front of the camera.
        </p>
      )}

      {perm === "granted" && face === "ok" && (
        <p className="text-sm text-green-700 flex items-center gap-1.5 font-semibold">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Camera and face check passed!
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Face detection runs locally in your browser. Integrity events (face missing,
        multiple faces, gaze away) are recorded for lecturer review during the exam.
      </p>
    </div>
  );
}
