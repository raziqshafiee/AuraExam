// src/routes/_authenticated/study.index.tsx
//
// NEW route — /study. Lists the signed-in student's own graded/submitted
// exam attempts that have at least one wrong MCQ/TF answer, linking into
// /study/autopsy/$attemptId. Read-only; does not touch any existing route
// or component.

import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, Empty, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getAutopsyList } from "@/features/study-autopsy/server";
import { fmtMY } from "@/lib/datetime";
import { ArrowRight, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/study/")({
  head: () => ({ meta: [{ title: "Why Was I Wrong? — Aura" }] }),
  loader: () => getAutopsyList(),
  component: StudyIndex,
});

function StudyIndex() {
  const items = Route.useLoaderData();

  return (
    <>
      <PageHeader
        badge="Study"
        badgeColor="bg-sky"
        title="Why Was I Wrong?"
        subtitle="Review the questions you missed across your graded exams, with AI explanations of the underlying concept."
      />

      {items.length === 0 ? (
        <Empty
          title="Nothing to review yet"
          hint="Once you have a graded exam with a wrong MCQ or True/False answer, it will show up here."
        />
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card key={item.attemptId} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 w-10 h-10 rounded-full border-2 border-ink bg-sky/30 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="font-display font-bold truncate">{item.examTitle}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {item.classCode}
                    {item.submittedAt && <> · {fmtMY(item.submittedAt, { dateStyle: "short" })}</>}
                    {" · "}
                    {item.wrongCount} wrong answer{item.wrongCount !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <WakeoutButton asChild size="sm" variant="secondary">
                <Link to="/study/autopsy/$attemptId" params={{ attemptId: item.attemptId }}>
                  Review <ArrowRight className="w-4 h-4" />
                </Link>
              </WakeoutButton>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
