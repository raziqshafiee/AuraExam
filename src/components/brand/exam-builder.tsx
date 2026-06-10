"use client";

import { useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { createExam, updateExam, unpublishExam, type ExamDetail } from "@/lib/supabase/exams";
import type { Question } from "@/lib/supabase/questions";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { ConfirmModal } from "@/components/brand/confirm-modal";
import { isoToMyLocalInput, myLocalInputToISO, fmtMY } from "@/lib/datetime";

type ClassOption = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  mode: "new" | "edit";
  classes: ClassOption[];
  questions: Question[];
  exam?: ExamDetail;
};

const TYPE_COLORS: Record<string, string> = {
  MCQ: "bg-violet-100 text-violet-800",
  TF: "bg-amber-100 text-amber-800",
  ESSAY: "bg-pink-100 text-pink-800",
};

export function ExamBuilder({ mode, classes, questions, exam }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const isPublished = exam?.status === "upcoming";

  const [title, setTitle] = useState(exam?.title ?? "");
  const [classId, setClassId] = useState(
    exam?.class_id ?? classes[0]?.id ?? ""
  );
  // datetime-local inputs hold Malaysia wall-clock; convert the stored UTC
  // instant back to MYT for editing (not the browser's local zone).
  const [startTime, setStartTime] = useState(isoToMyLocalInput(exam?.start_time));
  const [endTime, setEndTime] = useState(isoToMyLocalInput(exam?.end_time));
  const [duration, setDuration] = useState(exam?.duration ?? 90);
  const [requireCamera, setRequireCamera] = useState(exam?.require_camera ?? false);
  const [pickedIds, setPickedIds] = useState<string[]>(
    exam?.questions?.map((q) => q.id) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [poolSearch, setPoolSearch] = useState("");
  const [unpublishOpen, setUnpublishOpen] = useState(false);

  // Derived
  const pool = questions.filter(
    (q) => q.class_id === classId && !pickedIds.includes(q.id)
  );
  const filteredPool = pool.filter(
    (q) =>
      poolSearch === "" ||
      q.text.toLowerCase().includes(poolSearch.toLowerCase())
  );
  const pickedQs = pickedIds
    .map((id) => questions.find((q) => q.id === id))
    .filter(Boolean) as Question[];
  const totalPts = pickedQs.reduce((sum, q) => sum + (q.points ?? 0), 0);

  function addQuestion(id: string) {
    setPickedIds((prev) => [...prev, id]);
  }

  function removeQuestion(id: string) {
    setPickedIds((prev) => prev.filter((pid) => pid !== id));
  }

  async function handleSave(action: "draft" | "publish") {
    if (!title.trim()) {
      toast.error("Please enter an exam title");
      return;
    }
    if (!classId) {
      toast.error("Please select a class");
      return;
    }
    if (!startTime) {
      toast.error("Please set a start date");
      return;
    }
    if (!endTime) {
      toast.error("Please set an end date");
      return;
    }
    if (new Date(endTime) <= new Date(startTime)) {
      toast.error("End date must be after start date");
      return;
    }

    if (action === "publish") {
      if (pickedIds.length === 0) {
        toast.error("Add at least one question before publishing");
        return;
      }
      if (new Date(myLocalInputToISO(startTime)) < new Date()) {
        toast.error("Start time must be in the future");
        return;
      }
      const windowMs = new Date(myLocalInputToISO(endTime)).getTime() - new Date(myLocalInputToISO(startTime)).getTime();
      if (windowMs < duration * 60_000) {
        toast.error("The exam window is shorter than the timer duration");
        return;
      }
    }

    setSaving(true);
    const newStatus = action === "publish" ? "upcoming" : "draft";

    try {
      if (mode === "new") {
        await createExam({
          data: {
            title,
            class_id: classId,
            start_time: myLocalInputToISO(startTime),
            end_time: myLocalInputToISO(endTime),
            duration,
            require_camera: requireCamera,
            status: newStatus,
            question_ids: pickedIds,
          },
        });
        toast.success(
          action === "publish" ? "Exam published!" : "Draft saved!"
        );
      } else if (exam) {
        await updateExam({
          data: {
            id: exam.id,
            title,
            class_id: classId,
            start_time: myLocalInputToISO(startTime),
            end_time: myLocalInputToISO(endTime),
            duration,
            require_camera: requireCamera,
            status: newStatus,
            question_ids: pickedIds,
          },
        });
        toast.success("Exam updated!");
      }
      // Mark all cached loader data as stale, then await the navigation so we
      // block until the destination loader finishes and renders fresh data.
      // (The old pattern awaited router.invalidate() which re-ran the CURRENT
      // route's loaders — wrong ones — while leaving navigate un-awaited so the
      // exams list rendered from its in-memory cache before the loader settled.)
      router.invalidate();
      await navigate({ to: "/lecturer/exams" });
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnpublish() {
    if (!exam?.id) return;
    setSaving(true);
    try {
      await unpublishExam({ data: exam.id });
      toast.success("Exam moved back to draft");
      router.invalidate();
      await navigate({ to: "/lecturer/exams" });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to unpublish exam");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <ConfirmModal
      open={unpublishOpen}
      title="Unpublish exam?"
      message="Students will no longer see this exam. It will return to draft status and can be republished."
      confirmLabel="Unpublish"
      loading={saving}
      onConfirm={() => { setUnpublishOpen(false); handleUnpublish(); }}
      onClose={() => setUnpublishOpen(false)}
    />
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      {/* Left column */}
      <div className="space-y-6">
        {/* Basic info card */}
        <div className="rounded-3xl border-2 border-ink bg-card p-6 shadow-brut">
          <input
            className="w-full font-display font-bold text-xl border-b-2 border-ink bg-transparent pb-3 mb-5 focus:outline-none placeholder:text-ink/30"
            placeholder="Exam title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {isPublished && (
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl border-2 border-amber bg-amber/10 px-4 py-3 text-sm text-amber-900">
              <span className="shrink-0 mt-0.5">🔒</span>
              <span>
                <strong>Schedule, class, duration, and questions are locked</strong> — students have already been notified of this exam. You can still update the title and camera setting.
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-widest text-ink/60">
                Class
              </label>
              <select
                disabled={isPublished}
                className="border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setPickedIds([]);
                }}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-widest text-ink/60">
                Start date
              </label>
              <input
                type="datetime-local"
                disabled={isPublished}
                className="border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-widest text-ink/60">
                End date
              </label>
              <input
                type="datetime-local"
                disabled={isPublished}
                className="border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-widest text-ink/60">
                Timer (min)
              </label>
              <input
                type="number"
                min={1}
                max={300}
                disabled={isPublished}
                className="border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
          </div>
          {/* Camera toggle */}
          <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-colors ${requireCamera ? "border-violet bg-violet/10" : "border-ink/20 bg-background"}`}>
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-ink/60">Require camera</p>
              <p className="text-sm font-semibold mt-0.5">{requireCamera ? "Proctoring on" : "No camera needed"}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={requireCamera}
              onClick={() => setRequireCamera((v) => !v)}
              className={`relative w-12 h-6 rounded-full border-2 border-ink transition-colors ${requireCamera ? "bg-violet" : "bg-muted"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white border border-ink/30 transition-all ${requireCamera ? "left-6" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        {/* Picked questions card */}
        <div className={`rounded-3xl border-2 border-ink bg-card p-6 shadow-brut ${isPublished ? "opacity-60 pointer-events-none select-none" : ""}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg">Questions picked</h2>
            <span className="px-2.5 py-1 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest bg-violet-100">
              {pickedQs.length}
            </span>
          </div>
          {pickedQs.length === 0 ? (
            <p className="text-ink/50 text-sm text-center py-8">
              No questions added yet. Pick from the bank below.
            </p>
          ) : (
            <ul className="space-y-2">
              {pickedQs.map((q, idx) => (
                <li
                  key={q.id}
                  className="flex items-center gap-3 rounded-2xl border-2 border-ink/20 bg-background px-4 py-3"
                >
                  <span className="text-xs font-mono text-ink/40 w-5">
                    {idx + 1}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest ${TYPE_COLORS[q.type] ?? ""}`}
                  >
                    {q.type}
                  </span>
                  <span className="flex-1 text-sm line-clamp-1">{q.text}</span>
                  <span className="text-xs font-mono text-ink/60">
                    {q.points}pt
                  </span>
                  <button
                    type="button"
                    onClick={() => removeQuestion(q.id)}
                    className="text-ink/40 hover:text-red-500 transition-colors text-lg leading-none"
                    aria-label="Remove question"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Question bank card */}
        <div className="rounded-3xl border-2 border-ink bg-card p-6 shadow-brut">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg">Question bank</h2>
            <span className="px-2.5 py-1 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest">
              {filteredPool.length}
            </span>
          </div>
          <input
            type="search"
            placeholder="Search questions…"
            className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none mb-4 text-sm"
            value={poolSearch}
            onChange={(e) => setPoolSearch(e.target.value)}
          />
          {filteredPool.length === 0 ? (
            <p className="text-ink/50 text-sm text-center py-8">
              {pool.length === 0
                ? "No questions available for this class."
                : "No questions match your search."}
            </p>
          ) : (
            <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {filteredPool.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => addQuestion(q.id)}
                    className="w-full text-left flex items-start gap-3 rounded-2xl border-2 border-ink/20 bg-background px-4 py-3 hover:border-ink hover:shadow-brut transition-all"
                  >
                    <span
                      className={`shrink-0 mt-0.5 px-2.5 py-1 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest ${TYPE_COLORS[q.type] ?? ""}`}
                    >
                      {q.type}
                    </span>
                    <span className="flex-1 text-sm line-clamp-2">{q.text}</span>
                    <span className="shrink-0 text-xs font-mono text-ink/60">
                      {q.points}pt
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right column */}
      <aside className="space-y-4">
        {/* Summary card */}
        <div className="rounded-3xl border-2 border-ink bg-lime p-6 shadow-brut">
          <p className="text-xs font-mono uppercase tracking-widest text-ink/60 mb-1">
            Total points
          </p>
          <p className="font-display font-black text-5xl">{totalPts}</p>
          <p className="text-sm text-ink/60 mt-1 mb-6">
            {pickedQs.length} question{pickedQs.length !== 1 ? "s" : ""}
          </p>
          <div className="space-y-3">
            {isPublished ? (
              <>
                <WakeoutButton
                  type="button"
                  variant="violet"
                  size="default"
                  disabled={saving}
                  onClick={() => handleSave("publish")}
                  className="w-full rounded-2xl"
                >
                  {saving ? "Saving…" : "Save changes"}
                </WakeoutButton>
                <WakeoutButton
                  type="button"
                  variant="secondary"
                  size="default"
                  disabled={saving}
                  onClick={() => setUnpublishOpen(true)}
                  className="w-full rounded-2xl"
                >
                  Unpublish → draft
                </WakeoutButton>
              </>
            ) : (
              <>
                <WakeoutButton
                  type="button"
                  variant="secondary"
                  size="default"
                  disabled={saving}
                  onClick={() => handleSave("draft")}
                  className="w-full rounded-2xl"
                >
                  Save draft
                </WakeoutButton>
                <WakeoutButton
                  type="button"
                  variant="violet"
                  size="default"
                  disabled={saving}
                  onClick={() => handleSave("publish")}
                  className="w-full rounded-2xl"
                >
                  {saving ? "Saving…" : "Publish"}
                </WakeoutButton>
              </>
            )}
          </div>
        </div>

        {/* Edit mode info card */}
        {mode === "edit" && exam && (
          <div className="rounded-3xl border-2 border-ink bg-card p-5 shadow-brut text-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-ink/50">
                Status
              </span>
              <span
                className={`px-2.5 py-1 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest ${
                  exam.status === "live"
                    ? "bg-pink-200"
                    : exam.status === "upcoming"
                      ? "bg-amber-100"
                      : exam.status === "graded"
                        ? "bg-lime"
                        : "bg-card"
                }`}
              >
                {exam.status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-ink/50">
                Created
              </span>
              <span className="font-mono text-xs">
                {fmtMY(exam.created_at, { dateStyle: "short" })}
              </span>
            </div>
          </div>
        )}
      </aside>
    </div>
    </>
  );
}
