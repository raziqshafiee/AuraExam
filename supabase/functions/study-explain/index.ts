// supabase/functions/study-explain/index.ts
//
// NEW edge function for the "Why Was I Wrong?" study module. ADD-ON only:
// reads the existing `submissions` / `essay_answers` / `questions` tables
// (read-only — never writes to them) and writes only to the new
// `answer_explanations` cache table created by
// supabase/migrations/0001_study_autopsy.sql.
//
// Auth model: the caller's own JWT (not the service-role key) is forwarded
// into the Supabase client used here, so every query runs under the
// student's own RLS context. This is what makes the `answer_explanations`
// "own insert" RLS policy meaningful — this function cannot write a row for
// anyone other than the caller, even if the input body is tampered with.
//
// Privacy: only question text/options/correct-answer/student's-chosen-answer
// are ever sent to Gemini. No student name, email, or id leaves this
// function.
//
// Deploy:
//   supabase functions deploy study-explain
//   supabase secrets set GEMINI_API_KEY=your-key-here
// See ../../../src/features/study-autopsy/README.md for full setup.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// gemini-2.0-flash was deprecated (March 2026) and its free tier is now 0
// requests — see https://www.howtogeek.com/gemini-slashed-free-api-limits-what-to-use-instead/.
// gemini-2.5-flash-lite currently has the best free-tier quota (15 RPM /
// 1,000 req/day) of the available models.
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const LETTERS = ["A", "B", "C", "D"];

type RequestBody = { attemptId?: unknown; questionId?: unknown };

type GeminiResult = { explanation: string; concept_tag: string };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Best-effort extraction of a {explanation, concept_tag} object from
// whatever text Gemini returned. Strips ```json fences if present, then
// validates the shape — never throws, always returns null on failure so the
// caller can surface a friendly "try again" instead of a crash.
function parseGeminiJson(raw: string): GeminiResult | null {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) text = fenced[1].trim();

  try {
    const parsed = JSON.parse(text);
    const explanation = typeof parsed?.explanation === "string" ? parsed.explanation.trim() : "";
    const conceptTag = typeof parsed?.concept_tag === "string" ? parsed.concept_tag.trim() : "";
    if (!explanation) return null;
    return { explanation, concept_tag: conceptTag || "General" };
  } catch {
    return null;
  }
}

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

function studentAnswerText(type: string, meta: any, rawAnswer: string): string {
  if (type === "MCQ") {
    const options: string[] = Array.isArray(meta?.options) ? meta.options : [];
    const idx = LETTERS.indexOf(rawAnswer);
    return options[idx] ? `${rawAnswer}. ${options[idx]}` : rawAnswer;
  }
  return rawAnswer;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return jsonResponse({ error: "GEMINI_API_KEY is not configured on this function" }, 500);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const attemptId = typeof body.attemptId === "string" ? body.attemptId : null;
  const questionId = typeof body.questionId === "string" ? body.questionId : null;
  if (!attemptId || !questionId) {
    return jsonResponse({ error: "attemptId and questionId are required" }, 400);
  }

  // Forward the caller's own JWT — never the service-role key — so every
  // read/write below runs under that student's RLS context.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Ownership + lifecycle gate. RLS already restricts `submissions: student
  // own` to auth.uid() = student_id, so a stranger's attemptId simply
  // returns no row here rather than someone else's data.
  const { data: sub, error: subErr } = await supabase
    .from("submissions")
    .select("id, student_id, status")
    .eq("id", attemptId)
    .eq("student_id", user.id)
    .maybeSingle();

  if (subErr) return jsonResponse({ error: subErr.message }, 500);
  if (!sub) return jsonResponse({ error: "Attempt not found" }, 404);
  if (sub.status !== "submitted" && sub.status !== "graded") {
    return jsonResponse({ error: "This attempt has not been graded yet" }, 400);
  }

  // 1. Cache check — never re-call Gemini for the same (attempt, question).
  const { data: cached, error: cacheErr } = await supabase
    .from("answer_explanations")
    .select("id, correct_answer, explanation, concept_tag, created_at")
    .eq("attempt_id", attemptId)
    .eq("question_id", questionId)
    .maybeSingle();

  if (cacheErr) return jsonResponse({ error: cacheErr.message }, 500);
  if (cached) return jsonResponse({ ...cached, cached: true });

  // 2. Load the wrong answer itself (MCQ/TF answers live in `essay_answers`
  // despite the table's name — see CLAUDE.md / src/lib/supabase/exams.ts).
  const { data: answerRow, error: answerErr } = await supabase
    .from("essay_answers")
    .select("answer, score, questions(id, type, text, meta)")
    .eq("submission_id", attemptId)
    .eq("question_id", questionId)
    .maybeSingle();

  if (answerErr) return jsonResponse({ error: answerErr.message }, 500);
  const question = (answerRow as any)?.questions;
  if (!answerRow || !question) {
    return jsonResponse({ error: "Answer not found for this attempt" }, 404);
  }
  if (question.type !== "MCQ" && question.type !== "TF") {
    return jsonResponse({ error: "Only MCQ/TF questions are supported" }, 400);
  }
  if ((answerRow as any).score !== 0) {
    return jsonResponse({ error: "This answer was not wrong" }, 400);
  }

  const meta = question.meta ?? {};
  const correctAnswer = correctAnswerText(question.type, meta);
  const studentAnswer = studentAnswerText(question.type, meta, (answerRow as any).answer ?? "");
  const optionsList: string[] = question.type === "MCQ" && Array.isArray(meta.options) ? meta.options : [];

  // 3. Privacy-safe prompt — question/options/correct/student-answer only.
  const prompt = [
    "You are a calm, encouraging exam tutor. A student answered a question incorrectly.",
    "Respond with ONLY a single JSON object, no markdown fences, no extra text, in exactly this shape:",
    '{"explanation": string, "concept_tag": string}',
    "",
    `Question type: ${question.type}`,
    `Question: ${question.text}`,
    optionsList.length > 0 ? `Options: ${optionsList.map((o, i) => `${LETTERS[i]}. ${o}`).join(" | ")}` : "",
    `Correct answer: ${correctAnswer}`,
    `Student's answer: ${studentAnswer}`,
    "",
    "In `explanation`, in 3-4 short sentences: (a) restate the correct answer, ",
    "(b) explain why the student's choice is wrong or what common trap it represents, ",
    "(c) explain the underlying concept in 2-3 sentences so it generalizes beyond this one question.",
    "In `concept_tag`, give a short (2-4 word) topic label for this question's underlying concept, ",
    "e.g. \"Newton's Third Law\" or \"SQL Joins\" — used to group similar mistakes together.",
  ].filter(Boolean).join("\n");

  let geminiText: string;
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
        }),
      }
    );

    if (geminiRes.status === 429) {
      const detail = await geminiRes.text().catch(() => "");
      console.error("[study-explain] Gemini 429", detail);
      // Surface Gemini's own quota message (e.g. which metric/limit was hit)
      // back to the client so the student/dev can see it without needing to
      // dig through Supabase function logs.
      let quotaDetail = "";
      try {
        const parsed = JSON.parse(detail);
        quotaDetail = parsed?.error?.message ?? "";
      } catch {
        /* not JSON — leave quotaDetail empty, the generic message still applies */
      }
      return jsonResponse(
        {
          error: quotaDetail
            ? `AI quota reached — ${quotaDetail}`
            : "AI quota reached — please try again shortly",
        },
        429
      );
    }
    if (!geminiRes.ok) {
      const detail = await geminiRes.text().catch(() => "");
      console.error("[study-explain] Gemini error", geminiRes.status, detail);
      return jsonResponse({ error: "AI explanation service is temporarily unavailable" }, 502);
    }

    const geminiJson = await geminiRes.json();
    geminiText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch (err) {
    console.error("[study-explain] Gemini fetch failed", err);
    return jsonResponse({ error: "AI explanation service is temporarily unavailable" }, 502);
  }

  const parsed = parseGeminiJson(geminiText);
  if (!parsed) {
    console.error("[study-explain] Could not parse Gemini response", geminiText);
    return jsonResponse({ error: "Could not generate an explanation — please try again" }, 502);
  }

  // 4. Persist to cache. Runs under the student's own RLS context (own
  // insert only). on `unique (attempt_id, question_id)` conflict — e.g. a
  // double-click race — fall back to reading back whatever won the race.
  const { data: inserted, error: insertErr } = await supabase
    .from("answer_explanations")
    .insert({
      attempt_id: attemptId,
      question_id: questionId,
      user_id: user.id,
      correct_answer: correctAnswer,
      explanation: parsed.explanation,
      concept_tag: parsed.concept_tag,
    })
    .select("id, correct_answer, explanation, concept_tag, created_at")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: race } = await supabase
        .from("answer_explanations")
        .select("id, correct_answer, explanation, concept_tag, created_at")
        .eq("attempt_id", attemptId)
        .eq("question_id", questionId)
        .single();
      if (race) return jsonResponse({ ...race, cached: true });
    }
    return jsonResponse({ error: insertErr.message }, 500);
  }

  return jsonResponse({ ...inserted, cached: false });
});
