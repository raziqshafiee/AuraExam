import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired route. Review & submit now happens in an in-page overlay on the take
// page so fullscreen + integrity lockdown stay active the whole time. This URL
// is kept only to redirect anyone (old links, back button) back into the exam,
// which re-enters lockdown — it must never render a review outside proctoring.
export const Route = createFileRoute(
  "/_authenticated/student/exams/$examId/submit-confirm"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/student/exams/$examId/take",
      params: { examId: params.examId },
    });
  },
});
