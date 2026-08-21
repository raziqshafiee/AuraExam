// src/routes/_authenticated/student/verify-identity.tsx
"use client";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { Progress } from "@/components/ui/progress";
import { PhotoUpload } from "@/components/brand/photo-upload";
import { FaceCapture } from "@/components/brand/face-capture";
import { LivenessChallenge } from "@/components/brand/liveness-challenge";
import { faceChallenge, faceEnroll, getOpenSessionForMe } from "@/lib/supabase/face";
import { useAuthUser } from "@/lib/auth";
import type { DescriptorResult } from "@/lib/face/descriptor";
import type { ChallengeStep } from "@/lib/face/liveness";

export const Route = createFileRoute("/_authenticated/student/verify-identity")({
  head: () => ({ meta: [{ title: "Face Match — Aura" }] }),
  component: VerifyIdentity,
});

type Step =
  | "consent"
  | "matric" // supervised-only: no card to OCR under lecturer supervision
  | "upload-card"
  | "upload-profile"
  | "liveness"
  | "live-capture"
  | "processing"
  | "done"
  | "pending"
  | "rejected";

const LIVE_SAMPLE_COUNT = 5;

type EnrollResult = {
  status: "active" | "pending" | "rejected";
  pendingReason: "face_score" | "ocr_mismatch" | null;
  ocrName: string | null;
  ocrMatric: string | null;
  attemptsRemaining: number;
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

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

function extractYawDeg(matrixData: Float32Array): number {
  return (Math.atan2(-matrixData[8], matrixData[10]) * 180) / Math.PI;
}

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

  let minX = 1,
    maxX = 0,
    minY = 1,
    maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  ctx.strokeStyle = "#c4f542";
  ctx.lineWidth = 3;
  ctx.strokeRect(minX * w, minY * h, (maxX - minX) * w, (maxY - minY) * h);
}

// Fake but honest progress: there's no incremental signal from the server
// (OCR + face comparisons happen in one round trip), so this just animates
// toward 90% and lets the actual response completion jump it to 100.
function useFauxProgress(active: boolean) {
  const [value, setValue] = useState(8);
  useEffect(() => {
    if (!active) {
      setValue(8);
      return;
    }
    const interval = setInterval(() => {
      setValue((v) => (v >= 90 ? 90 : v + (90 - v) * 0.15));
    }, 300);
    return () => clearInterval(interval);
  }, [active]);
  return value;
}

function VerifyIdentity() {
  const { user } = useAuthUser();
  const [step, setStep] = useState<Step>("consent");
  const [cardResult, setCardResult] = useState<DescriptorResult | null>(null);
  const [cardJpeg, setCardJpeg] = useState<string>("");
  const [profileResult, setProfileResult] = useState<DescriptorResult | null>(null);
  const [profileJpeg, setProfileJpeg] = useState<string>("");
  const [matricNo, setMatricNo] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; steps: string[] } | null>(null);
  const [enrollResult, setEnrollResult] = useState<EnrollResult | null>(null);

  const progress = useFauxProgress(step === "processing");

  // ── Supervised window detection ───────────────────────────────────────
  const [sessionInfo, setSessionInfo] = useState<{
    sessionId: string;
    matricNo: string | null;
  } | null>(null);
  // Locked at the moment the student clicks past consent — submitEnrollment
  // reads THIS, never the live `sessionInfo` state, so a supervised window
  // that opens mid-flow can't silently redirect a student who already
  // started the normal card-upload path into the supervised branch (which
  // would discard their uploaded card/profile photos without them knowing).
  const supervisedAtStartRef = useRef<{ sessionId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOpenSessionForMe()
      .then((res) => {
        if (cancelled || !res.sessionId) return;
        setSessionInfo({ sessionId: res.sessionId, matricNo: res.matricNo });
        if (res.matricNo) setMatricNo(res.matricNo);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Liveness-step camera + FaceLandmarker ──────────────────────────────
  const livenessVideoRef = useRef<HTMLVideoElement>(null);
  const livenessCanvasRef = useRef<HTMLCanvasElement>(null);
  const livenessStreamRef = useRef<MediaStream | null>(null);
  const livenessDetectorRef = useRef<any>(null);
  const livenessIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const livenessSignalRef = useRef<{
    blendshapes: Record<string, number> | null;
    yawDeg: number | null;
  }>({
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
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
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
            const matrix: Float32Array | null =
              result.facialTransformationMatrixes?.[0]?.data ?? null;
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
        // camera/detector failed to start — getSignal keeps returning nulls
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
    setStep("processing");
    const supervised = supervisedAtStartRef.current;

    if (supervised) {
      try {
        const res = await faceEnroll({
          data: {
            embeddingCard: null,
            embeddingProfile: null,
            embeddingSamples: liveResults.map((r) => r.descriptor),
            cardImageBase64: "",
            profileImageBase64: "",
            matricNo,
            challengeId: "",
            challengeStepsCompleted: [],
            antispoofScore: average(liveResults.map((r) => r.antispoofScore)),
            livenessScore: average(liveResults.map((r) => r.livenessScore)),
            sessionId: supervised.sessionId,
          },
        });
        setEnrollResult(res as EnrollResult);
        if (res.status === "active") {
          setStep("done");
          toast.success("Identity verified");
        } else {
          toast.error(
            "Supervised enrollment did not complete — please ask your lecturer to try again.",
          );
          setStep("live-capture");
        }
      } catch (err: any) {
        toast.error(err.message ?? "Enrollment failed");
        setStep("live-capture");
      }
      return;
    }

    if (!cardResult || !profileResult || !challenge) {
      // Shouldn't happen through the normal UI flow — defensive fallback.
      setStep("upload-card");
      return;
    }
    try {
      const res = await faceEnroll({
        data: {
          embeddingCard: cardResult.descriptor,
          embeddingProfile: profileResult.descriptor,
          embeddingSamples: liveResults.map((r) => r.descriptor),
          cardImageBase64: cardJpeg,
          profileImageBase64: profileJpeg,
          matricNo: "",
          challengeId: challenge.challengeId,
          challengeStepsCompleted: challenge.steps,
          antispoofScore: average(liveResults.map((r) => r.antispoofScore)),
          livenessScore: average(liveResults.map((r) => r.livenessScore)),
        },
      });
      const typed = res as EnrollResult;
      setEnrollResult(typed);
      if (typed.status === "active") {
        setStep("done");
        toast.success("Identity verified");
      } else if (typed.status === "pending") {
        setStep("pending");
      } else {
        if (typed.attemptsRemaining > 0) {
          toast.error("That didn't clear our checks — you can try again.");
          setStep("upload-card");
        } else {
          setStep("rejected");
        }
      }
    } catch (err: any) {
      toast.error(err.message ?? "Enrollment failed");
      setStep("live-capture");
    }
  }

  return (
    <>
      <PageHeader
        badge="Face Match"
        title="Verify your identity"
        subtitle="Required once before your first identity-checked exam."
      />
      <Card className="max-w-xl mx-auto space-y-6">
        {step === "consent" && (
          <div className="space-y-4">
            <p className="text-sm">
              We store a numeric representation of your face — not a photograph — for as long as
              your enrollment is active. Your uploaded matric card and profile photo are also kept,
              but only for a limited retention period, then automatically deleted. Only the FRONT of
              your card is ever requested — never the back. You may decline and ask your lecturer to
              verify you in person instead.
            </p>
            <WakeoutButton
              className="w-full"
              onClick={() => {
                supervisedAtStartRef.current = sessionInfo
                  ? { sessionId: sessionInfo.sessionId }
                  : null;
                if (sessionInfo) setStep(sessionInfo.matricNo ? "live-capture" : "matric");
                else setStep("upload-card");
              }}
            >
              I understand, continue
            </WakeoutButton>
          </div>
        )}

        {step === "matric" && (
          <div className="space-y-3">
            <label className="text-xs font-mono uppercase">Matric number</label>
            <input
              value={matricNo}
              onChange={(e) => setMatricNo(e.target.value)}
              className="w-full border-2 border-ink rounded-xl px-3 py-2"
            />
            <WakeoutButton
              className="w-full"
              onClick={() => setStep("live-capture")}
              disabled={!matricNo}
            >
              Continue
            </WakeoutButton>
          </div>
        )}

        {step === "upload-card" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload a clear photo of the <strong>front</strong> of your matric card — never the
              back.
            </p>
            <PhotoUpload
              guide="Front of your matric card"
              onCapture={(result, jpeg) => {
                setCardJpeg(jpeg);
                if (result) {
                  setCardResult(result);
                  setStep("upload-profile");
                }
              }}
            />
          </div>
        )}

        {step === "upload-profile" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Now upload a clear, front-facing profile photo — this is what future identity checks
              compare against, so a well-lit, unobstructed shot matters for accuracy.
            </p>
            <PhotoUpload
              guide="Your profile photo"
              strictFraming
              onCapture={(result, jpeg) => {
                setProfileJpeg(jpeg);
                if (result) {
                  setProfileResult(result);
                  startLiveness();
                }
              }}
            />
          </div>
        )}

        {step === "liveness" && challenge && (
          <div className="space-y-3">
            <div className="aspect-video rounded-2xl border-2 border-ink bg-secondary overflow-hidden relative">
              <video
                ref={livenessVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <canvas
                ref={livenessCanvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />
            </div>
            {!livenessCamReady && (
              <p className="text-xs text-center font-mono text-muted-foreground">
                Starting camera…
              </p>
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

        {step === "processing" && (
          <div className="space-y-4 py-6 text-center">
            <p className="font-display font-bold text-lg">Checking your identity…</p>
            <Progress value={progress} />
            <p className="text-xs font-mono text-muted-foreground">
              Reading your card, comparing photos, and verifying liveness — this takes a few
              seconds.
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <CheckCircle className="w-12 h-12 text-lime mx-auto" />
            <p className="font-display font-bold text-lg">You're all set.</p>
            <div className="text-left text-sm bg-secondary border-2 border-ink rounded-xl p-4 space-y-1">
              <p>
                <span className="text-muted-foreground">Name on file:</span> {user?.name ?? "—"}
              </p>
              {enrollResult?.ocrMatric && (
                <p>
                  <span className="text-muted-foreground">Matric number saved:</span>{" "}
                  {enrollResult.ocrMatric}
                </p>
              )}
              <p className="text-xs text-muted-foreground pt-1">
                This will be compared against your live camera before and during identity-checked
                exams.
              </p>
            </div>
          </div>
        )}

        {step === "pending" && (
          <div className="space-y-4 text-center">
            <Clock className="w-12 h-12 text-sky mx-auto" />
            <p className="font-display font-bold text-lg">
              {enrollResult?.pendingReason === "ocr_mismatch"
                ? "Sent to your lecturer for review"
                : "Sent for review"}
            </p>
            <div className="text-left text-sm bg-secondary border-2 border-ink rounded-xl p-4 space-y-1">
              {enrollResult?.pendingReason === "ocr_mismatch" ? (
                <>
                  <p className="text-muted-foreground">
                    We couldn't clearly read your card — a lecturer teaching one of your classes
                    will check it manually.
                  </p>
                  {enrollResult?.ocrName && (
                    <p>
                      <span className="text-muted-foreground">We read:</span> {enrollResult.ocrName}
                    </p>
                  )}
                  {enrollResult?.ocrMatric && (
                    <p>
                      <span className="text-muted-foreground">Matric read:</span>{" "}
                      {enrollResult.ocrMatric}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  Your enrollment needs a quick human check before it's approved. You'll be notified
                  once it's reviewed.
                </p>
              )}
            </div>
          </div>
        )}

        {step === "rejected" && (
          <div className="space-y-4 text-center">
            <XCircle className="w-12 h-12 text-pink mx-auto" />
            <p className="text-pink">
              Automated verification didn't succeed. Ask your lecturer to verify you in person.
            </p>
          </div>
        )}
      </Card>
    </>
  );
}
