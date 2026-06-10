import { createFileRoute } from "@tanstack/react-router";
import { QuestionEditor } from "@/components/brand/question-editor";
import { getLecturerClasses } from "@/lib/supabase/classes";
import { getQuestion } from "@/lib/supabase/questions";

export const Route = createFileRoute("/_authenticated/lecturer/question-bank/$id/edit")({
  head: () => ({ meta: [{ title: "Edit question — Aura" }] }),
  loader: async ({ params }) => {
    const [classes, question] = await Promise.all([
      getLecturerClasses(),
      getQuestion({ data: params.id }),
    ]);
    return { classes, question };
  },
  component: EditQuestion,
});

function EditQuestion() {
  const { classes, question } = Route.useLoaderData();
  return <QuestionEditor mode="edit" classes={classes} question={question} />;
}
