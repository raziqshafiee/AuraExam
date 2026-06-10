import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { ExamBuilder } from "@/components/brand/exam-builder";
import { getLecturerClasses } from "@/lib/supabase/classes";
import { getQuestions } from "@/lib/supabase/questions";
import { getExam } from "@/lib/supabase/exams";
import { PageHeader } from "@/components/brand/page";

export const Route = createFileRoute(
  "/_authenticated/lecturer/exams/$examId/edit"
)({
  head: () => ({ meta: [{ title: "Edit exam — Aura" }] }),
  loader: async ({ params }) => {
    const [classes, questions, exam] = await Promise.all([
      getLecturerClasses(),
      getQuestions(),
      getExam({ data: params.examId }),
    ]);
    if (!exam) throw notFound();
    // Live, closed, and graded exams cannot be edited — send directly to results.
    if (["live", "closed", "graded"].includes(exam.status)) {
      throw redirect({
        to: "/lecturer/exams/$examId/results",
        params: { examId: params.examId },
      });
    }
    return { classes, questions, exam };
  },
  component: EditExam,
});

function EditExam() {
  const { classes, questions, exam } = Route.useLoaderData();
  return (
    <>
      <PageHeader
        badge={exam.status === "upcoming" ? "Limited edit" : "Edit"}
        badgeColor="bg-violet"
        title={exam.title}
        subtitle={
          exam.status === "upcoming"
            ? "Published — only title and camera setting can be changed"
            : undefined
        }
      />
      <ExamBuilder
        mode="edit"
        classes={classes}
        questions={questions}
        exam={exam}
      />
    </>
  );
}
