import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Card } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { CameraProctor } from "@/components/brand/camera-proctor";
import { getStudentExamLobby, startExam } from "@/lib/supabase/exams";
import { fmtMY } from "@/lib/datetime";
import {
  MonitorPlay,
  ShieldCheck,
  AlertTriangle,
  Clock,
  VideoOff,
  RefreshCw,
  Camera,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_authenticated/student/exams/$examId/lobby"
)({
  head: () => ({ meta: [{ title: "Exam lobby — Aura" }] }),
  loader: ({ params }) => getStudentExamLobby({ data: params.examId }),
  component: Lobby,
});

function fmt(iso: string) {
  return fmtMY(iso, { dateStyle: "medium", timeStyle: "short" });
}

function Lobby() {
  const exam = Route.useLoaderData();
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#fffdf5] p-8 text-center">
        <div className="border-4 border-black rounded-2xl p-8 max-w-sm bg-white shadow-[6px_6px_0px_black]">
          <div className="text-5xl mb-4">🖥️</div>
          <h1 className="text-2xl font-black mb-3">Desktop Only</h1>
          <p className="text-gray-700 font-medium">
            Exams must be taken on a desktop or laptop computer. Please switch to a PC or Mac to continue.
          </p>
        </div>
      </div>
    );
  }

  const existingStatus = exam.existingSubmission?.status;

  // Already submitted/graded — not eligible to retake
  if (
    exam.existingSubmission &&
    existingStatus !== "in-progress" &&
    existingStatus !== "retake-approved"
  ) {
    return (
      <>
        <PageHeader
          badge={exam.classCode}
          badgeColor="bg-sky"
          title={exam.title}
          subtitle="Already submitted"
        />
        <Card className="max-w-lg">
          <p className="text-sm text-muted-foreground mb-4">
            You have already submitted this exam.
          </p>
          <WakeoutButton asChild>
            <Link to="/student/exams/$examId/result" params={{ examId: exam.id }}>
              View result →
            </Link>
          </WakeoutButton>
        </Card>
      </>
    );
  }

  async function handleStart() {
    if (!agreed) {
      toast.error("Please agree to the rules first");
      return;
    }
    setStarting(true);
    try {
      // Await fullscreen before navigating so the take page always mounts with
      // fullscreenElement already set. If we don't await, the take page can mount
      // while fullscreen is still pending — it then issues a second request, the
      // browser cancels the first one, and the fullscreenchange listener fires a
      // false "exited fullscreen" flag before the student has done anything.
      await document.documentElement.requestFullscreen().catch(() => {});
      const { submissionId } = await startExam({ data: exam.id });
      // On a retake the server reuses the same submission row (same id), so
      // sessionStorage still holds the previous attempt's answers. Clear them
      // now so the retake page starts completely blank.
      if (existingStatus === "retake-approved") {
        try {
          const key = `aura-exam-${submissionId}`;
          sessionStorage.removeItem(key);
          sessionStorage.removeItem(`${key}-flagged`);
          sessionStorage.removeItem(`${key}-idx`);
        } catch {}
      }
      navigate({
        to: "/student/exams/$examId/take",
        params: { examId: exam.id },
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to start exam");
      setStarting(false);
    }
  }

  return (
    <>
      <PageHeader
        badge={exam.classCode}
        badgeColor={existingStatus === "retake-approved" ? "bg-amber" : "bg-sky"}
        title={exam.title}
        subtitle={
          existingStatus === "retake-approved"
            ? "Retake approved — fresh attempt"
            : `${exam.questions_count} questions · ${exam.duration} minutes · desktop only`
        }
      />

      {existingStatus === "retake-approved" && (
        <Card className="mb-6 border-amber bg-amber/10">
          <div className="flex items-start gap-3">
            <RefreshCw className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-display font-bold">Retake approved by your lecturer</div>
              <p className="text-sm text-muted-foreground mt-1">
                Your previous attempt has been cleared. This is a fresh attempt — your answers,
                flags, and score have been reset. Complete the checks below and start when ready.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="mb-6 flex flex-wrap gap-8">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-sky shrink-0" />
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Opens
            </div>
            <div className="font-semibold">{fmt(exam.start_time)}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-pink shrink-0" />
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Closes
            </div>
            <div className="font-semibold">{fmt(exam.end_time)}</div>
          </div>
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Duration
          </div>
          <div className="font-semibold">{exam.duration} min</div>
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Questions
          </div>
          <div className="font-semibold">{exam.questions_count}</div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="font-display font-bold text-xl">Camera check</div>
            {exam.require_camera ? (
              <span className="px-2.5 py-1 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest bg-violet text-violet-foreground">
                Required
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full border-2 border-ink/30 text-[10px] font-mono uppercase tracking-widest text-ink/40">
                Not required
              </span>
            )}
          </div>
          {exam.require_camera ? (
            <CameraProctor mode="setup" onReady={setCameraReady} />
          ) : (
            <div className="aspect-video rounded-2xl border-2 border-ink/20 bg-secondary flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <VideoOff className="w-10 h-10" />
              <p className="text-sm">No camera required for this exam.</p>
            </div>
          )}
        </Card>
        <Card>
          <div className="font-display font-bold text-xl mb-3">
            Before you start
          </div>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3">
              <ShieldCheck className="w-5 h-5 text-violet shrink-0" />
              Right-click, copy/paste, and tab-switch will be disabled.
            </li>
            <li className="flex gap-3">
              <MonitorPlay className="w-5 h-5 text-pink shrink-0" />
              The exam opens in fullscreen. Exiting fullscreen or switching tabs counts as a flag.
            </li>
            <li className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber shrink-0" />
              3+ flags = auto-submit. Score is locked at 0 — you may file an
              integrity appeal within 7 days or you receive 0.
            </li>
            <li className="flex gap-3">
              <Clock className="w-5 h-5 text-sky shrink-0" />
              Exam closes at {fmt(exam.end_time)}. Submission is forced at that
              time.
            </li>
            <li className="flex gap-3">
              <Camera className="w-5 h-5 text-violet shrink-0" />
              {exam.require_camera
                ? "Your camera is monitored during the exam — periodic snapshots are saved for your lecturer to review."
                : "On-screen monitoring is recorded for review."}{" "}
              These checks are a deterrent to help keep the exam fair, not a
              guarantee — academic integrity remains your responsibility.
            </li>
          </ul>
          <label className="mt-5 flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 border-2 border-ink"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />{" "}
            I've read the rules and I'm ready.
          </label>
          {exam.require_camera && !cameraReady && (
            <p className="mt-4 flex items-center gap-1.5 text-sm text-amber-600">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Complete the camera check on the left to continue.
            </p>
          )}
          <WakeoutButton
            variant="primary"
            size="default"
            disabled={!agreed || starting || (exam.require_camera && !cameraReady)}
            onClick={handleStart}
            className="mt-4 w-full rounded-2xl"
          >
            {starting ? "Starting…" : "Start exam →"}
          </WakeoutButton>
        </Card>
      </div>
    </>
  );
}
