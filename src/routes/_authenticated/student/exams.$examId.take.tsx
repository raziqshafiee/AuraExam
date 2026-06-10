"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { CameraProctor } from "@/components/brand/camera-proctor";
import { getExamForTaking, recordFlag } from "@/lib/supabase/exams";
import { recordHeartbeat } from "@/lib/supabase/proctor";
import { Flag, Camera, ChevronLeft, ChevronRight, AlertTriangle, Maximize } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/student/exams/$examId/take"
)({
  head: () => ({ meta: [{ title: "Taking exam — Aura" }] }),
  loader: ({ params }) => getExamForTaking({ data: params.examId }),
  component: TakeExam,
});

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function TakeExam() {
  const { exam, submission, questions, remainingSeconds, deadline } =
    Route.useLoaderData();
  const navigate = useNavigate();

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

  // Answers, flagged questions, and the current index are persisted to
  // sessionStorage so navigating to the confirm page and back (or a hard
  // refresh) restores exactly where the student was. The key is scoped to the
  // submissionId so a retake always starts fresh.
  const storageKey = `aura-exam-${submission?.id ?? exam.id}`;

  const [idx, setIdx] = useState(() => {
    try { return Number(sessionStorage.getItem(`${storageKey}-idx`) ?? 0); } catch { return 0; }
  });
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      const s = sessionStorage.getItem(storageKey);
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  });
  const [flagged, setFlagged] = useState<Set<string>>(() => {
    try {
      const s = sessionStorage.getItem(`${storageKey}-flagged`);
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch { return new Set(); }
  });
  // Seed from the deadline ISO string so we account for the SSR→client
  // hydration delay rather than using the pre-computed server integer directly.
  const [timeLeft, setTimeLeft] = useState(() => {
    if (deadline) {
      return Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
    }
    return remainingSeconds;
  });
  const [integrityFlags, setIntegrityFlags] = useState(0);
  const [lastFlagType, setLastFlagType] = useState<string | null>(null);

  // Stable refs so async event handlers always see current values without
  // requiring re-registration of event listeners on every render.
  const submissionIdRef = useRef(submission?.id ?? "");
  const examIdRef = useRef(exam.id);
  const storageKeyRef = useRef(storageKey);
  const questionCountRef = useRef(questions.length);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // Set to true once the student navigates to submit/result — prevents stray
  // flags from firing during the navigation animation.
  const submittingRef = useRef(false);
  // Initialized to a no-op so it is never null. React Strict Mode double-fires
  // effects (cleanup then re-run), which would null the ref between the two
  // runs if we used null as the initial value, causing CameraProctor's
  // onHardFlag to silently drop flags during the remount window.
  const sendFlagRef = useRef<(type: string, label: string) => void>(() => {});

  // Persist ephemeral exam state so navigating to confirm + back restores it.
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(answers)); } catch {} }, [answers]);
  useEffect(() => { try { sessionStorage.setItem(`${storageKey}-flagged`, JSON.stringify([...flagged])); } catch {} }, [flagged]);
  useEffect(() => { try { sessionStorage.setItem(`${storageKey}-idx`, String(idx)); } catch {} }, [idx]);

  // Timer countdown.
  // Uses refs instead of calling handleReviewSubmit() to avoid the stale
  // closure problem — handleReviewSubmit captures submission/answers/flagged
  // from the initial render, but the timer effect deps array is [] (intentional:
  // we never want to restart the interval). Reading from sessionStorage gives
  // us the current answer counts without needing React state in scope.
  useEffect(() => {
    function triggerTimerSubmit() {
      if (!submissionIdRef.current || submittingRef.current) return;
      submittingRef.current = true;
      let answered = 0;
      let flaggedSize = 0;
      try {
        const stored = sessionStorage.getItem(storageKeyRef.current);
        if (stored) answered = Object.keys(JSON.parse(stored)).length;
        const storedFlagged = sessionStorage.getItem(`${storageKeyRef.current}-flagged`);
        if (storedFlagged) flaggedSize = JSON.parse(storedFlagged).length;
      } catch {}
      navigateRef.current({
        to: "/student/exams/$examId/submit-confirm",
        params: { examId: examIdRef.current },
        search: {
          submissionId: submissionIdRef.current,
          answered,
          flagged: flaggedSize,
          skipped: questionCountRef.current - answered,
        },
      });
    }

    if (timeLeft <= 0) {
      triggerTimerSubmit();
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          triggerTimerSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Server heartbeat — proves the exam tab is still open. A lecturer sees a
  // stale "last seen" when a student closes the tab or disconnects. Bypassable
  // like all client signals, so it's advisory monitoring, not enforcement.
  useEffect(() => {
    if (!submissionIdRef.current) return;
    recordHeartbeat({ data: submissionIdRef.current }).catch(() => {});
    const hb = setInterval(() => {
      if (submissionIdRef.current)
        recordHeartbeat({ data: submissionIdRef.current }).catch(() => {});
    }, 20_000);
    return () => clearInterval(hb);
  }, []);

  // Integrity lockdown — tab switch, copy, paste, right-click, fullscreen
  useEffect(() => {
    if (!submissionIdRef.current) return;

    let busy = false;

    async function sendFlag(type: string, label: string) {
      if (busy || !submissionIdRef.current || submittingRef.current) return;
      busy = true;
      try {
        const result = await recordFlag({ data: { submissionId: submissionIdRef.current, type, label } });
        setIntegrityFlags(result.flags);
        setLastFlagType(type);
        if (result.autoSubmitted) {
          submittingRef.current = true;
          // Clear session storage — the exam is over, stale answers must not
          // pre-fill a future retake that reuses the same submission id.
          try {
            sessionStorage.removeItem(storageKeyRef.current);
            sessionStorage.removeItem(`${storageKeyRef.current}-flagged`);
            sessionStorage.removeItem(`${storageKeyRef.current}-idx`);
          } catch {}
          navigateRef.current({
            to: "/student/exams/$examId/result",
            params: { examId: examIdRef.current },
          });
        }
      } catch { /* ignore transient errors */ }
      finally { busy = false; }
    }

    // Wire sendFlag into the ref so CameraProctor's onHardFlag can call it.
    sendFlagRef.current = sendFlag;

    // Re-request fullscreen if the lobby's fullscreen didn't survive navigation.
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    // Grace period on mount: some browsers fire a delayed fullscreenchange exit
    // event during same-origin navigation (lobby → take). If the page is already
    // confirmed fullscreen at mount time, that stale exit fires AFTER the listener
    // is registered and triggers a false flag. Suppress exits for 1 second;
    // re-request fullscreen silently if one fires during that window.
    let fullscreenConfirmed = !!document.fullscreenElement;
    let entryGrace = true;
    const graceTimer = setTimeout(() => { entryGrace = false; }, 1000);

    const onFullscreenChange = () => {
      if (document.fullscreenElement) {
        fullscreenConfirmed = true;
        entryGrace = false;
      } else if (entryGrace) {
        // Spurious exit during grace — silently re-enter, do not flag.
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (fullscreenConfirmed) {
        fullscreenConfirmed = false;
        sendFlag("fullscreen-exit", "Exited fullscreen during exam");
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendFlag("tab-switch", "Left exam tab");
    };
    const onCopy = () => sendFlag("copy", "Copy attempt detected");
    const onPaste = () => sendFlag("paste", "Paste attempt detected");
    // Right-click is advisory — it blocks the context menu but does NOT count
    // toward the 3-strike limit (accessibility use-cases like spellcheck).
    const onCtxMenu = (e: MouseEvent) => { e.preventDefault(); };

    // Wipe whatever a PrintScreen capture just placed on the clipboard. The
    // browser can't stop the OS capture, but overwriting the clipboard
    // neutralises the common "PrtScn -> paste into chat" workflow.
    const clearClipboard = () => {
      try { navigator.clipboard?.writeText(""); } catch { /* clipboard may be blocked */ }
    };

    // PrintScreen fires both keydown and keyup — dedupe so one capture = one flag.
    let lastScreenshotAt = 0;
    const flagScreenshot = (label: string) => {
      const now = Date.now();
      if (now - lastScreenshotAt < 1000) return;
      lastScreenshotAt = now;
      sendFlag("screenshot", label);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // Print / Save-page shortcuts can be cancelled outright
      if (mod && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        flagScreenshot("Print shortcut blocked");
        return;
      }
      if (mod && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        flagScreenshot("Save-page shortcut blocked");
        return;
      }
      // macOS screen-capture: Cmd+Shift+3/4/5 (OS handles capture; we can only flag)
      if (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key)) {
        flagScreenshot("Screen-capture shortcut detected");
        return;
      }
      // Windows Snipping Tool: Win+Shift+S (metaKey = Win key)
      if (e.metaKey && e.shiftKey && (e.key === "s" || e.key === "S")) {
        flagScreenshot("Snipping-tool shortcut detected");
        return;
      }
      if (e.key === "PrintScreen") {
        clearClipboard();
        flagScreenshot("PrintScreen detected");
      }
    };

    // keyup is the reliable delivery for PrintScreen on Windows
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        clearClipboard();
        flagScreenshot("PrintScreen detected");
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onCtxMenu);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      clearTimeout(graceTimer);
      sendFlagRef.current = () => {};
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onCtxMenu);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const q = questions[idx];

  function setAns(v: string) {
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: v }));
  }

  function toggleFlag() {
    if (!q) return;
    setFlagged((prev) => {
      const s = new Set(prev);
      s.has(q.id) ? s.delete(q.id) : s.add(q.id);
      return s;
    });
  }

  const answeredCount = Object.keys(answers).length;
  const skippedCount = questions.length - answeredCount;

  function handleReviewSubmit() {
    if (!submission) return;
    submittingRef.current = true;
    navigate({
      to: "/student/exams/$examId/submit-confirm",
      params: { examId: exam.id },
      search: {
        submissionId: submission.id,
        answered: answeredCount,
        flagged: flagged.size,
        skipped: skippedCount,
      },
    });
  }

  if (!q) {
    return (
      <div className="p-8 text-center text-ink/50">
        No questions available for this exam.
      </div>
    );
  }

  const mcqOptions: string[] =
    q.type === "MCQ"
      ? (q.meta as any)?.options ?? ["Option A", "Option B", "Option C", "Option D"]
      : [];

  const isLast = idx === questions.length - 1;

  return (
    <div className="min-h-screen bg-secondary">
      {/* Lockdown bar */}
      <div className="bg-ink text-background px-6 py-2 flex items-center gap-4 text-xs font-mono">
        <span className="text-lime">● LOCKDOWN ACTIVE</span>
        <span className="opacity-70">
          {exam.classCode} · {exam.title}
        </span>
        {integrityFlags > 0 && (
          <span className="flex items-center gap-1 text-amber font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            {integrityFlags}/3 flags
          </span>
        )}
        <span className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-1 opacity-60">
            <Maximize className="w-3.5 h-3.5" /> fullscreen
          </span>
          {exam.require_camera ? (
            <><Camera className="w-3.5 h-3.5 text-lime" /> proctoring on</>
          ) : (
            <span className="opacity-50">no proctoring</span>
          )}
        </span>
        <span className={`font-bold text-base ${timeLeft < 300 ? "text-pink" : "text-amber"}`}>
          ⏱ {formatTime(timeLeft)}
        </span>
      </div>

      {/* Warning banner after first/second flag */}
      {integrityFlags > 0 && integrityFlags < 3 && (
        <div className="bg-amber/20 border-b-2 border-amber px-6 py-2 flex items-center gap-2 text-xs font-mono text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Flag {integrityFlags}/3:{" "}
            {lastFlagType === "multiple-faces" && "Another face was detected on camera — please ensure you are alone."}
            {lastFlagType === "fullscreen-exit" && "You exited fullscreen — stay in fullscreen for the duration of the exam."}
            {lastFlagType === "tab-switch" && "You left the exam tab — keep this tab focused at all times."}
            {lastFlagType === "copy" && "Copy attempt detected."}
            {lastFlagType === "paste" && "Paste attempt detected."}
            {lastFlagType === "right-click" && "Right-click is disabled during the exam."}
            {lastFlagType === "screenshot" && "Screenshot attempt detected."}
            {!lastFlagType && "Integrity violation recorded."}
            {" "}3 flags will auto-submit your exam with score locked at 0.
          </span>
        </div>
      )}

      {exam.require_camera && (
        <CameraProctor
          mode="monitor"
          submissionId={submission?.id}
          onHardFlag={(type, label) => sendFlagRef.current(type, label)}
        />
      )}
      <div className="grid lg:grid-cols-[1fr_280px] gap-6 p-4 md:p-8">
        <div className="rounded-3xl border-2 border-ink bg-card shadow-brut p-6 md:p-8">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-muted-foreground">
              QUESTION {idx + 1} OF {questions.length}
            </div>
            <button
              onClick={toggleFlag}
              className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full border-2 border-ink ${
                flagged.has(q.id) ? "bg-amber" : "bg-card"
              }`}
            >
              <Flag className="w-3.5 h-3.5" />{" "}
              {flagged.has(q.id) ? "Flagged" : "Flag"}
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs font-mono uppercase px-2 py-0.5 rounded-full border border-ink/30 text-ink/50">
              {q.type}
            </span>
            <span className="text-xs font-mono text-ink/40">{q.points} pt</span>
          </div>

          <h2 className="mt-4 font-display font-extrabold text-2xl md:text-3xl">
            {q.text}
          </h2>

          {q.type === "MCQ" && (
            <ul className="mt-6 space-y-2">
              {["A", "B", "C", "D"].map((letter, i) => (
                <li key={letter}>
                  <button
                    onClick={() => setAns(letter)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-ink font-medium text-left ${
                      answers[q.id] === letter ? "bg-lime shadow-brut-sm" : "bg-card"
                    }`}
                  >
                    <span className="font-mono text-xs shrink-0 w-5">{letter}</span>
                    <span>{mcqOptions[i] ?? `Option ${letter}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {q.type === "TF" && (
            <div className="mt-6 grid grid-cols-2 gap-2">
              {["True", "False"].map((k) => (
                <button
                  key={k}
                  onClick={() => setAns(k)}
                  className={`px-4 py-4 rounded-xl border-2 border-ink font-bold ${
                    answers[q.id] === k ? "bg-pink shadow-brut-sm" : "bg-card"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          )}

          {q.type === "ESSAY" && (
            <textarea
              rows={10}
              maxLength={5000}
              value={answers[q.id] ?? ""}
              onChange={(ev) => setAns(ev.target.value)}
              placeholder="Type your answer..."
              className="mt-6 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none"
            />
          )}

          <div className="mt-8 flex items-center justify-between">
            <WakeoutButton
              variant="secondary"
              size="sm"
              onClick={() => setIdx(Math.max(0, idx - 1))}
              disabled={idx === 0}
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </WakeoutButton>
            {!isLast ? (
              <WakeoutButton size="sm" onClick={() => setIdx(idx + 1)}>
                Next <ChevronRight className="w-4 h-4" />
              </WakeoutButton>
            ) : (
              <button
                type="button"
                onClick={handleReviewSubmit}
                className="border-2 border-ink rounded-2xl px-4 py-2 font-bold bg-pink text-white hover:shadow-brut transition-all text-sm"
              >
                Review & submit
              </button>
            )}
          </div>
        </div>

        <aside className="rounded-3xl border-2 border-ink bg-card shadow-brut p-5 h-fit">
          <div className="font-display font-bold mb-3">Questions</div>
          <div className="grid grid-cols-5 gap-1.5">
            {questions.map((qq, i) => {
              const ans = answers[qq.id];
              const fl = flagged.has(qq.id);
              return (
                <button
                  key={qq.id}
                  onClick={() => setIdx(i)}
                  className={`aspect-square rounded-lg border-2 border-ink text-xs font-mono font-bold ${
                    i === idx ? "ring-2 ring-pink ring-offset-2 ring-offset-card" : ""
                  } ${fl ? "bg-amber" : ans ? "bg-lime" : "bg-background"}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded border-2 border-ink bg-lime" /> Answered ({answeredCount})
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded border-2 border-ink bg-amber" /> Flagged ({flagged.size})
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded border-2 border-ink bg-background" /> Skipped ({skippedCount})
            </div>
          </div>
          <button
            type="button"
            onClick={handleReviewSubmit}
            className="mt-4 w-full border-2 border-ink rounded-xl px-3 py-2 text-xs font-bold bg-pink text-white hover:shadow-brut transition-all"
          >
            Review & submit
          </button>
        </aside>
      </div>
    </div>
  );
}
