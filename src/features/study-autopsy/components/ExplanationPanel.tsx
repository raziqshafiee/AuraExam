// src/features/study-autopsy/components/ExplanationPanel.tsx
//
// Renders the AI explanation for one wrong answer, or a "Generate
// explanation" action with a per-item loading/error state when it hasn't
// been generated (cached) yet.

import { Loader2, Sparkles, AlertCircle, Lightbulb } from "lucide-react";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import type { QuestionState } from "../use-explanations";

export function ExplanationPanel({
  question,
  onGenerate,
}: {
  question: QuestionState;
  onGenerate: (questionId: string) => void;
}) {
  if (question.explanation) {
    return (
      <div className="rounded-2xl border-2 border-ink/20 bg-lime/10 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="w-4 h-4 text-ink shrink-0" />
          <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Why this was wrong
          </span>
          {question.conceptTag && (
            <span className="ml-auto px-2 py-0.5 rounded-full border border-ink/30 bg-card text-[10px] font-mono uppercase tracking-wide">
              {question.conceptTag}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{question.explanation}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-ink/30 px-4 py-3">
      {question.generateError ? (
        <div className="flex items-start gap-2 mb-2 text-sm text-pink">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{question.generateError}</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-2">
          Get an AI explanation for why this answer was wrong.
        </p>
      )}
      <WakeoutButton
        size="sm"
        variant="secondary"
        disabled={question.generating}
        onClick={() => onGenerate(question.questionId)}
      >
        {question.generating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" /> {question.generateError ? "Try again" : "Generate explanation"}
          </>
        )}
      </WakeoutButton>
    </div>
  );
}
