// src/routes/_authenticated/student/verify-identity.tsx
"use client";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { FaceCapture } from "@/components/brand/face-capture";
import { LivenessChallenge } from "@/components/brand/liveness-challenge";
import { faceChallenge, faceEnroll, getOpenSessionForMe } from "@/lib/supabase/face";
import type { DescriptorResult } from "@/lib/face/descriptor";
import type { ChallengeStep } from "@/lib/face/liveness";

export const Route = createFileRoute("/_authenticated/student/verify-identity")({
  head: () => ({ meta: [{ title: "Face Match — Aura" }] }),
  component: VerifyIdentity,
});

type Step = "consent" | "card" | "co-presence" | "matric" | "liveness" | "live-capture" | "done" | "rejected";

// Number of independent live descriptors captured in the live-capture step —
// actual pose-diverse samples (see face-capture.tsx's multi-sample capture),
// not one frame duplicated.
const LIVE_SAMPLE_COUNT = 5;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// Module-level promise so the MediaPipe bundle is only fetched once, shared
// with camera-proctor.tsx's own preload if it also ran this session.
let mediaPipePromise: Promise<any> | null = null;
function loadMediaPipe() {
  if (!mediaPipePromise) {
    mediaPipePromise = import(
      /* @vite-ignore */
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
    ).catch(() => null);
  }
  return mediaPipePromise;
}

// Column 2 (indices 8,9,10) of the 4x4 facial transformation matrix is the
// face forward vector in camera space — same extraction as camera-proctor.tsx.
function extractYawDeg(matrixData: Float32Array): number {
  return (Math.atan2(-matrixData[8], matrixData[10]) * 180) / Math.PI;
}

// Display-only bounding-box overlay: derives a rect from the min/max x/y of
// normalized (0-1) face landmarks and strokes it onto a canvas sized to the
// video's rendered pixel dimensions. Never touches the stored descriptor —
// purely a UX nicety, not a precision requirement.
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

function VerifyIdentity() {
  const [step, setStep] = useState<Step>("consent");
  const [cardResult, setCardResult] = useState<DescriptorResult | null>(null);
  const [evidenceJpeg, setEvidenceJpeg] = useState<string | null>(null);
  const [matricNo, setMatricNo] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; steps: string[] } | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);

  // ── Supervised window detection (Task 7) ──────────────────────────────
  // On mount, check whether a lecturer has an open enrollment window that
  // applies to this student (class-wide or targeted at them individually).
  // If so, the card/co-presence/liveness-challenge steps are skipped
  // entirely — physical supervision replaces card provenance and the
  // in-person lecturer replaces the automated liveness challenge. Only the
  // matric-number step is kept, and only if the student doesn't already
  // have one on file.
  const [sessionInfo, setSessionInfo] = useState<{ sessionId: string; matricNo: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOpenSessionForMe()
      .then((res) => {
        if (cancelled || !res.sessionId) return;
        setSessionInfo({ sessionId: res.sessionId, matricNo: res.matricNo });
        if (res.matricNo) setMatricNo(res.matricNo);
      })
      .catch(() => {
        // No open window (or the check failed) — fall through to the
        // normal card-based flow, which is always the safe default.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Liveness-step camera + FaceLandmarker, scoped to this route ──────────
  // LivenessChallenge itself never touches MediaPipe — it only calls
  // getSignal(). This block is the "small follow-up" that supplies real
  // signals: a minimal video + FaceLandmarker instance whose latest
  // blendshapes/yaw sample is kept in a ref for getSignal to read.
  const livenessVideoRef = useRef<HTMLVideoElement>(null);
  const livenessCanvasRef = useRef<HTMLCanvasElement>(null);
  const livenessStreamRef = useRef<MediaStream | null>(null);
  const livenessDetectorRef = useRef<any>(null);
  const livenessIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const livenessSignalRef = useRef<{ blendshapes: Record<string, number> | null; yawDeg: number | null }>({
    blendshapes: null,
    yawDeg: null,
  });
  const [livenessCamReady, setLivenessCamReady] = useState(false);

  useEffect(() => {
    if (step !== "liveness") return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        livenessStreamRef.current = stream;
        if (livenessVideoRef.current) {
          livenessVideoRef.current.srcObject = stream;
          await livenessVideoRef.current.play();
        }

        const mod = await loadMediaPipe();
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
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
        if (cancelled) {
          detector.close?.();
          return;
        }
        livenessDetectorRef.current = detector;
        setLivenessCamReady(true);

        livenessIntervalRef.current = setInterval(() => {
          const video = livenessVideoRef.current;
          if (!video || video.readyState < 2 || !livenessDetectorRef.current) return;
          try {
            const result = livenessDetectorRef.current.detectForVideo(video, performance.now());
            const matrix: Float32Array | null = result.facialTransformationMatrixes?.[0]?.data ?? null;
            const categories: Array<{ categoryName: string; score: number }> | undefined =
              result.faceBlendshapes?.[0]?.categories;
            livenessSignalRef.current = {
              blendshapes: categories
                ? Object.fromEntries(categories.map((c) => [c.categoryName, c.score]))
                : null,
              yawDeg: matrix ? extractYawDeg(matrix) : null,
            };
            drawFaceBox(livenessCanvasRef.current, video, result.faceLandmarks?.[0]);
          } catch {
            // ignore per-frame errors
          }
        }, 300);
      } catch {
        // camera/detector failed to start — getSignal will keep returning
        // nulls, so LivenessChallenge's checkNow() simply never succeeds and
        // the student sees no progress rather than a crash.
      }
    })();

    return () => {
      cancelled = true;
      if (livenessIntervalRef.current) clearInterval(livenessIntervalRef.current);
      livenessIntervalRef.current = null;
      livenessStreamRef.current?.getTracks().forEach((t) => t.stop());
      livenessStreamRef.current = null;
      livenessDetectorRef.current?.close?.();
      livenessDetectorRef.current = null;
      setLivenessCamReady(false);
      const canvas = livenessCanvasRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [step]);

  async function startLiveness() {
    const c = await faceChallenge();
    setChallenge(c);
    setStep("liveness");
  }

  async function onLivenessComplete() {
    setStep("live-capture");
  }

  async function submitEnrollment(liveResults: DescriptorResult[]) {
    // Supervised path (Task 7): no card, no co-presence evidence, no liveness
    // challenge — the lecturer's open window (and their physical presence)
    // stands in for all three. faceEnroll's isSupervised branch skips
    // challenge validation entirely, so challengeId/challengeStepsCompleted
    // are sent empty, and evidenceJpegBase64 empty (it's only ever read when
    // status lands on pending/rejected, which never happens for a supervised
    // enrollment — faceEnroll always bands it straight to "active").
    if (sessionInfo) {
      try {
        const res = await faceEnroll({
          data: {
            embeddingCard: null,
            embeddingSamples: liveResults.map((r) => r.descriptor),
            matricNo,
            challengeId: "",
            challengeStepsCompleted: [],
            antispoofScore: average(liveResults.map((r) => r.antispoofScore)),
            livenessScore: average(liveResults.map((r) => r.livenessScore)),
            evidenceJpegBase64: "",
            sessionId: sessionInfo.sessionId,
          },
        });
        if (res.status === "active") {
          setStep("done");
          toast.success("Identity verified");
        } else {
          toast.error("Supervised enrollment did not complete — please ask your lecturer to try again.");
        }
      } catch (err: any) {
        toast.error(err.message ?? "Enrollment failed");
      }
      return;
    }

    if (!cardResult || !challenge || !evidenceJpeg) return;
    try {
      const res = await faceEnroll({
        data: {
          embeddingCard: cardResult.descriptor,
          // Real independent samples from the live-capture step (up to
          // LIVE_SAMPLE_COUNT; fewer only if some slots exhausted their
          // per-slot retry budget — see face-capture.tsx).
          embeddingSamples: liveResults.map((r) => r.descriptor),
          matricNo,
          challengeId: challenge.challengeId,
          challengeStepsCompleted: challenge.steps,
          // Averaged across however many live samples we actually got —
          // representative of the whole capture, not just one lucky frame.
          antispoofScore: average(liveResults.map((r) => r.antispoofScore)),
          livenessScore: average(liveResults.map((r) => r.livenessScore)),
          // The co-presence (card + face) frame captured right after the
          // card step, NOT a live-capture frame — this is what a reviewer
          // in Task 4 actually needs to compare card-to-face.
          evidenceJpegBase64: evidenceJpeg,
        },
      });
      if (res.status === "active") { setStep("done"); toast.success("Identity verified"); }
      else if (res.status === "pending") { setStep("done"); toast.info("Sent for review — you'll hear back within a day"); }
      else { setAttemptsRemaining(res.attemptsRemaining); setStep(res.attemptsRemaining > 0 ? "card" : "rejected"); }
    } catch (err: any) {
      toast.error(err.message ?? "Enrollment failed");
    }
  }

  return (
    <>
      <PageHeader badge="Face Match" title="Verify your identity" subtitle="Required once before your first identity-checked exam." />
      <Card className="max-w-xl mx-auto space-y-6">
        {step === "consent" && (
          <div className="space-y-4">
            <p className="text-sm">We store a numeric representation of your face, not a photograph. Your ID card image is deleted once verification completes. You may decline and ask your lecturer to verify you in person instead.</p>
            <WakeoutButton
              className="w-full"
              onClick={() => {
                // Supervised window open: skip card/co-presence/matric-if-known
                // and go straight to live capture (or matric first, if the
                // student doesn't have one on file yet).
                if (sessionInfo) setStep(sessionInfo.matricNo ? "live-capture" : "matric");
                else setStep("card");
              }}
            >
              I understand, continue
            </WakeoutButton>
          </div>
        )}
        {step === "card" && (
          <FaceCapture
            guide="Hold your student card so it fills the frame"
            onCapture={(results) => { setCardResult(results[0]); setStep("co-presence"); }}
          />
        )}
        {step === "co-presence" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Now hold your card next to your face so both are visible together — this is the photo a reviewer
              would compare if your enrollment needs a manual check.
            </p>
            <FaceCapture
              guide="Hold your card next to your face"
              mode="evidence"
              onCapture={(_results, jpeg) => { setEvidenceJpeg(jpeg); setStep("matric"); }}
            />
          </div>
        )}
        {step === "matric" && (
          <div className="space-y-3">
            <label className="text-xs font-mono uppercase">Matric number</label>
            <input value={matricNo} onChange={(e) => setMatricNo(e.target.value)} className="w-full border-2 border-ink rounded-xl px-3 py-2" />
            {/* Supervised window: skip the automated liveness challenge too —
                the lecturer is physically present, so go straight to live capture. */}
            <WakeoutButton className="w-full" onClick={sessionInfo ? () => setStep("live-capture") : startLiveness} disabled={!matricNo}>Continue</WakeoutButton>
          </div>
        )}
        {step === "liveness" && challenge && (
          <div className="space-y-3">
            <div className="aspect-video rounded-2xl border-2 border-ink bg-secondary overflow-hidden relative">
              <video ref={livenessVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              <canvas ref={livenessCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            </div>
            {!livenessCamReady && (
              <p className="text-xs text-center font-mono text-muted-foreground">Starting camera…</p>
            )}
            <LivenessChallenge
              steps={challenge.steps as ChallengeStep[]}
              getSignal={() => livenessSignalRef.current}
              onComplete={onLivenessComplete}
            />
          </div>
        )}
        {step === "live-capture" && (
          <FaceCapture
            guide="Hold still — we'll capture a few frames"
            samples={LIVE_SAMPLE_COUNT}
            onCapture={(results) => submitEnrollment(results)}
          />
        )}
        {step === "done" && <p className="text-center font-display font-bold text-lg">You're all set.</p>}
        {step === "rejected" && <p className="text-center text-pink">Automated verification didn't succeed. Ask your lecturer to verify you in person.</p>}
      </Card>
    </>
  );
}
