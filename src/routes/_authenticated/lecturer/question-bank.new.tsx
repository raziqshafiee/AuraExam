import { createFileRoute } from "@tanstack/react-router";
import { QuestionEditor } from "@/components/brand/question-editor";
import { getLecturerClasses } from "@/lib/supabase/classes";

export const Route = createFileRoute("/_authenticated/lecturer/question-bank/new")({
  head: () => ({ meta: [{ title: "New question — Aura" }] }),
  loader: () => getLecturerClasses(),
  component: NewQuestion,
});

function NewQuestion() {
  const classes = Route.useLoaderData();
  return <QuestionEditor mode="new" classes={classes} />;
}
