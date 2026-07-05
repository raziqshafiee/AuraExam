// src/features/study-autopsy/server.ts
//
// Read-only server functions for the "Why Was I Wrong?" study module
// (ADD-ON feature). These never write to any existing table — they only
// read `submissions`, `essay_answers` (joined `questions`), `exams`, and
// `classes`, all under the caller's own RLS context via the existing
// src/lib/supabase/server.ts client. The only table this feature writes to
// (`answer_explanations`) is written exclusively by the study-explain edge
// function, not from here.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@/lib/supabase/server";
import type { AutopsyAttempt, AutopsyListItem, WrongQuestion } from "./types";

const LETTERS = ["A", "B", "C", "D"];

function correctAnswerText(type: string, meta: any): string {
  if (type === "MCQ") {
    const options: string[] = Array.isArray(meta?.options) ? meta.options : [];
    const idx = typeof meta?.correct === "number" ? meta.correct : -1;
    const letter = LETTERS[idx] ?? "?";
    return options[idx] ? `${letter}. ${options[idx]}` : letter;
  }
  if (type === "TF") {
    return meta?.correct === true ? "True" : "False";
  }
  return "";
}

// GET: list the caller's own graded/submitted attempts that contain at
// least one wrong MCQ/TF answer — feeds the /study index page.
export const getAutopsyList = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: subs, error: subErr } = await (supabase as any)
    .from("submissions")
    .select("id, exam_id, status, submitted_at, exams(title, classes(code))")
    .eq("student_id", user.id)
    .in("status", ["submitted", "graded"]);

  if (subErr) throw new Error(subErr.message);
  if (!subs || subs.length === 0) return [] as AutopsyListItem[];

  const subIds = subs.map((s: any) => s.id);

  const { data: wrongRows, error: wrongErr } = await (supabase as any)
    .from("essay_answers")
    .select("submission_id, score, questions(type)")
    .in("submission_id", subIds)
    .eq("score", 0);

  if (wrongErr) throw new Error(wrongErr.message);

  const wrongCountBySub: Record<string, number> = {};
  for (const row of wrongRows ?? []) {
    const qType = (row as any).questions?.type;
    if (qType !== "MCQ" && qType !== "TF") continue;
    const subId = (row as any).submission_id;
    wrongCountBySub[subId] = (wrongCountBySub[subId] ?? 0) + 1;
  }

  return (subs as any[])
    .map((s) => ({
      attemptId: s.id as string,
      examId: s.exam_id as string,
      examTitle: s.exams?.title ?? "Untitled exam",
      classCode: s.exams?.classes?.code ?? "",
      submittedAt: s.submitted_at ?? null,
      wrongCount: wrongCountBySub[s.id] ?? 0,
    }))
    .filter((item) => item.wrongCount > 0) as AutopsyListItem[];
});

// GET: full detail for one attempt — the wrong MCQ/TF answers, the exam
// metadata, and any already-cached explanations. Read-only; ownership is
// enforced both by the .eq("student_id", user.id) filter below AND by the
// existing `submissions: student own` RLS policy.
export const getAttemptAutopsy = createServerFn({ method: "GET" })
  .inputValidator((attemptId: string) => attemptId)
  .handler(async ({ data: attemptId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: sub, error: subErr } = await (supabase as any)
      .from("submissions")
      .select("id, status, score, total, submitted_at, exam_id, exams(id, title, classes(code))")
      .eq("id", attemptId)
      .eq("student_id", user.id)
      .maybeSingle();

    if (subErr) throw new Error(subErr.message);
    if (!sub) throw new Error("Attempt not found");
    if (sub.status !== "submitted" && sub.status !== "graded") {
      throw new Error("This attempt has not been graded yet");
    }

    const [{ data: answerRows, error: answerErr }, { data: cachedRows, error: cacheErr }] = await Promise.all([
      (supabase as any)
        .from("essay_answers")
        .select("question_id, answer, score, questions(id, type, text, points, meta, tags)")
        .eq("submission_id", attemptId)
        .eq("score", 0),
      (supabase as any)
        .from("answer_explanations")
        .select("question_id, correct_answer, explanation, concept_tag")
        .eq("attempt_id", attemptId)
        .eq("user_id", user.id),
    ]);

    if (answerErr) throw new Error(answerErr.message);
    if (cacheErr) throw new Error(cacheErr.message);

    const cacheByQuestion: Record<string, { explanation: string; conceptTag: string | null }> = {};
    for (const row of cachedRows ?? []) {
      cacheByQuestion[(row as any).question_id] = {
        explanation: (row as any).explanation,
        conceptTag: (row as any).concept_tag ?? null,
      };
    }

    const wrongQuestions: WrongQuestion[] = (answerRows ?? [])
      .filter((row: any) => row.questions?.type === "MCQ" || row.questions?.type === "TF")
      .map((row: any) => {
        const q = row.questions;
        const meta = q.meta ?? {};
        const cached = cacheByQuestion[q.id] ?? null;
        return {
          questionId: q.id as string,
          type: q.type as "MCQ" | "TF",
          text: q.text as string,
          points: q.points as number,
          options: Array.isArray(meta.options) ? meta.options : [],
          optionImages: Array.isArray(meta.option_images) ? meta.option_images : [null, null, null, null],
          imageUrl: meta.image_url ?? null,
          studentAnswer: row.answer ?? "",
          correctAnswer: correctAnswerText(q.type, meta),
          fallbackTag: Array.isArray(q.tags) && q.tags.length > 0 ? q.tags[0] : "Uncategorized",
          explanation: cached?.explanation ?? null,
          conceptTag: cached?.conceptTag ?? null,
        };
      });

    return {
      exam: {
        id: sub.exams?.id ?? sub.exam_id,
        title: sub.exams?.title ?? "Untitled exam",
        classCode: sub.exams?.classes?.code ?? "",
      },
      attempt: {
        id: sub.id,
        status: sub.status,
        submittedAt: sub.submitted_at ?? null,
        score: sub.score ?? 0,
        total: sub.total ?? 0,
      },
      wrongQuestions,
    } as AutopsyAttempt;
  });
