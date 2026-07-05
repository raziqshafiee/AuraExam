// src/routes/_authenticated/study.autopsy.$attemptId.tsx
//
// NEW route — /study/autopsy/$attemptId. The "Why Was I Wrong?" detail page:
// weak-topics summary + accordion of wrong MCQ/TF answers, each with an
// on-demand, cached AI explanation. Read-only against existing exam data;
// writes only happen via the study-explain edge function into the new
// answer_explanations table.

import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getAttemptAutopsy } from "@/features/study-autopsy/server";
import { useAutopsyExplanations } from "@/features/study-autopsy/use-explanations";
import { WeakTopicsCard } from "@/features/study-autopsy/components/WeakTopicsCard";
import { WrongAnswerAccordion } from "@/features/study-autopsy/components/WrongAnswerAccordion";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/study/autopsy/$attemptId")({
  head: () => ({ meta: [{ title: "Why Was I Wrong? — Aura" }] }),
  loader: ({ params }) => getAttemptAutopsy({ data: params.attemptId }),
  component: AutopsyDetail,
});

function AutopsyDetail() {
  const { exam, attempt, wrongQuestions } = Route.useLoaderData();
  const { questions, generate, generateAllUncached } = useAutopsyExplanations(attempt.id, wrongQuestions);

  const uncachedCount = questions.filter((q) => !q.explanation).length;

  return (
    <>
      <PageHeader
        badge={exam.classCode}
        badgeColor="bg-sky"
        title={exam.title}
        subtitle={`${attempt.score} / ${attempt.total} pts — reviewing ${questions.length} wrong answer${questions.length !== 1 ? "s" : ""}`}
        action={
          uncachedCount > 0 ? (
            <WakeoutButton size="sm" variant="primary" onClick={() => generateAllUncached()}>
              <Sparkles className="w-4 h-4" /> Generate all explanations
            </WakeoutButton>
          ) : undefined
        }
      />

      {questions.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No wrong MCQ or True/False answers were found for this attempt — nice work!
          </p>
        </Card>
      ) : (
        <>
          <WeakTopicsCard questions={questions} />
          <WrongAnswerAccordion questions={questions} onGenerate={generate} />
        </>
      )}

      <div className="mt-6">
        <WakeoutButton asChild variant="ghost" size="sm">
          <Link to="/study">← Back to study</Link>
        </WakeoutButton>
      </div>
    </>
  );
}
