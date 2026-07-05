// src/features/study-autopsy/use-explanations.ts
//
// Client-side state for the "Why Was I Wrong?" page: tracks per-question
// generate/loading/error state and calls the study-explain edge function.
// Never talks to any existing table directly — only invokes the new
// edge function, which itself enforces ownership + RLS.

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ExplainErrorResponse, ExplainResponse, WrongQuestion } from "./types";

export type QuestionState = WrongQuestion & {
  generating: boolean;
  generateError: string | null;
};

export function useAutopsyExplanations(attemptId: string, initial: WrongQuestion[]) {
  const [questions, setQuestions] = useState<QuestionState[]>(
    initial.map((q) => ({ ...q, generating: false, generateError: null }))
  );

  const patch = useCallback((questionId: string, partial: Partial<QuestionState>) => {
    setQuestions((prev) => prev.map((q) => (q.questionId === questionId ? { ...q, ...partial } : q)));
  }, []);

  // One invocation attempt. Returns either the parsed success data, or
  // { failed: true, status, message } so the retry loop below can decide
  // whether a 429 is worth backing off and retrying automatically.
  const invokeOnce = useCallback(
    async (questionId: string) => {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke<ExplainResponse | ExplainErrorResponse>(
        "study-explain",
        { body: { attemptId, questionId } }
      );

      if (error) {
        // supabase-js's FunctionsHttpError.message is always the generic
        // "Edge Function returned a non-2xx status code" — the actual
        // { error: "..." } body our function sends back, and the real HTTP
        // status, live on error.context (the raw Response). Unwrap both so
        // the student (and we, debugging) see the real reason, and so 429s
        // can be retried automatically below.
        let message = error.message || "Something went wrong";
        let status: number | undefined = (error as any).context?.status;
        try {
          const body = await (error as any).context?.clone?.().json();
          if (body?.error) message = body.error;
        } catch {
          /* context wasn't JSON or already consumed — fall back to error.message */
        }
        return { failed: true as const, status, message };
      }
      if (!data || "error" in data) {
        return { failed: true as const, status: undefined, message: (data as ExplainErrorResponse | undefined)?.error ?? "Something went wrong" };
      }
      return { failed: false as const, data };
    },
    [attemptId]
  );

  const MAX_429_RETRIES = 2;
  const RETRY_BACKOFF_MS = [3000, 6000];

  const generate = useCallback(
    async (questionId: string) => {
      patch(questionId, { generating: true, generateError: null });
      try {
        let attempt = 0;
        while (true) {
          const result = await invokeOnce(questionId);

          if (!result.failed) {
            patch(questionId, {
              generating: false,
              generateError: null,
              explanation: result.data.explanation,
              conceptTag: result.data.concept_tag,
            });
            return;
          }

          // Quota hits are transient — back off and retry automatically a
          // couple of times before surfacing the error to the student.
          if (result.status === 429 && attempt < MAX_429_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS[attempt]));
            attempt++;
            continue;
          }

          patch(questionId, { generating: false, generateError: result.message });
          return;
        }
      } catch (err: any) {
        patch(questionId, { generating: false, generateError: err?.message ?? "Network error" });
      }
    },
    [invokeOnce, patch]
  );

  // Sequential, not Promise.all — firing every uncached question's Gemini
  // call at once bursts past the free-tier rate limit (HTTP 429) even when
  // there are only a handful of questions. A small stagger between calls
  // keeps requests well under the per-minute quota.
  const generateAllUncached = useCallback(async () => {
    const targets = questions.filter((q) => !q.explanation && !q.generating);
    for (const q of targets) {
      await generate(q.questionId);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }, [questions, generate]);

  return { questions, generate, generateAllUncached };
}
