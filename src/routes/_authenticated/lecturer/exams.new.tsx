import { createFileRoute } from "@tanstack/react-router";
import { ExamBuilder } from "@/components/brand/exam-builder";
import { getLecturerClasses } from "@/lib/supabase/classes";
import { getQuestions } from "@/lib/supabase/questions";
import { PageHeader } from "@/components/brand/page";

export const Route = createFileRoute("/_authenticated/lecturer/exams/new")({
  head: () => ({ meta: [{ title: "New exam — Aura" }] }),
  loader: async () => {
    const [classes, questions] = await Promise.all([
      getLecturerClasses(),
      getQuestions(),
    ]);
    return { classes, questions };
  },
  component: NewExam,
});

function NewExam() {
  const { classes, questions } = Route.useLoaderData();
  return (
    <>
      <PageHeader badge="Build" badgeColor="bg-violet" title="New exam" />
      <ExamBuilder mode="new" classes={classes} questions={questions} />
    </>
  );
}
