import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/brand/marketing-layout";
import { Star } from "@/components/brand/doodles";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — Aura Exam" },
      { name: "description", content: "Question banks, exam builder, in-browser proctoring, integrity flags, appeals, assignments, AI study review, and admin tools — everything Aura Exam ships with." },
      { property: "og:title", content: "Features — Aura Exam" },
      { property: "og:description", content: "Everything Aura Exam ships with." },
    ],
  }),
  component: FeaturesPage,
});

const groups = [
  {
    title: "Question bank",
    color: "bg-lime",
    items: [
      "MCQ, True/False, and Essay question types",
      "Per-question point weights",
      "Questions are reusable across any exam",
      "Bulk-select questions when building an exam",
      "Owned per lecturer — isolated across accounts",
    ],
  },
  {
    title: "Exam management",
    color: "bg-pink",
    items: [
      "Guided lifecycle: draft → upcoming → live → closed → graded",
      "Publish when ready; unpublish before any submissions exist",
      "Schedule open and close times; exam goes live automatically",
      "Fullscreen enforced on start; exit triggers an integrity flag",
      "Auto-submit on timeout — no answer is ever lost",
    ],
  },
  {
    title: "Proctoring",
    color: "bg-violet text-violet-foreground",
    items: [
      "MediaPipe FaceLandmarker — runs fully in-browser, no server video",
      "Detects multiple faces with an 8-second grace period",
      "Gaze tracking: flags head-turned (yaw > 45°) and looking-down (pitch < −30°)",
      "Adaptive snapshots: every 60s normally, every 15s during alert mode",
      "Snapshots scoped per submission in secure storage",
    ],
  },
  {
    title: "Integrity flags",
    color: "bg-sky",
    items: [
      "Hard flags: tab-switch, copy-paste, fullscreen exit, multiple faces",
      "3 hard flags → exam auto-submitted and marked flagged",
      "Advisory flags: face missing, camera lost, gaze away, head turned",
      "Advisory flags are for lecturer review only — never trigger auto-submit",
      "60-second cooldown between repeated flag reports",
    ],
  },
  {
    title: "Grading + appeals",
    color: "bg-amber",
    items: [
      "MCQ and True/False auto-graded instantly on submit",
      "Essay answers queued for manual lecturer grading per question",
      "Submission promoted to graded only when all essays are scored",
      "One appeal per submission — score dispute or integrity challenge",
      "Integrity appeal approved → retake unlocked; score appeal → grade updated",
    ],
  },
  {
    title: "Assignments",
    color: "bg-card",
    items: [
      "File submissions with server-enforced deadlines",
      "Resubmit any time before the deadline (replaces previous file)",
      "Locked after lecturer marks as reviewed",
      "Grading panel opens only after the deadline closes",
      "Download any submission for offline review",
    ],
  },
  {
    title: "Classes",
    color: "bg-lime/60",
    items: [
      "Lecturers create classes with a unique class code",
      "Students enroll via class code",
      "Exams and assignments are scoped to a class",
      "Class roster with enrollment counts visible to admin",
      "Admin can delete classes and view all enrollments",
    ],
  },
  {
    title: "Notifications",
    color: "bg-pink/60",
    items: [
      "In-app notifications for exam results, appeal outcomes, and announcements",
      "Unread badge in the nav bar — polled every 30 seconds",
      "Mark all as read in one click",
      "Notifications scoped by role — students, lecturers, and admins each see their own",
    ],
  },
  {
    title: "Study — Why Was I Wrong?",
    color: "bg-violet/60",
    items: [
      "Students review every wrong MCQ and True/False answer after grading",
      "AI-generated explanation per wrong answer, cached after first load",
      "Weak-topic summary groups mistakes by concept",
      "Generate explanations one-by-one or all at once",
      "Read-only — never touches the original submission",
    ],
  },
  {
    title: "Admin tools",
    color: "bg-sky/60",
    items: [
      "Manage all users: view, ban, and unban accounts",
      "Role-based access: student, lecturer, admin",
      "Full audit log with categories: user management, exam, integrity, appeal, class",
      "Overview of all classes and exams platform-wide",
      "Admin bypasses RLS via service role — no data is hidden",
    ],
  },
];

function FeaturesPage() {
  return (
    <MarketingLayout>
      <section className="border-b-2 border-ink">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <span className="inline-block px-4 py-1.5 rounded-full border-2 border-ink bg-lime font-mono text-xs uppercase tracking-widest shadow-brut-sm">All the things</span>
          <h1 className="mt-4 font-display font-extrabold text-6xl tracking-tight max-w-3xl">Every feature, no fluff.</h1>
          <p className="mt-4 text-muted-foreground max-w-xl">A complete list of what ships in Aura Exam — accurate to the current build.</p>
        </div>
      </section>
      <section className="border-b-2 border-ink">
        <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((g) => (
            <div key={g.title} className={`rounded-3xl border-2 border-ink p-6 shadow-brut ${g.color}`}>
              <h2 className="font-display font-bold text-2xl">{g.title}</h2>
              <ul className="mt-5 space-y-2">
                {g.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-sm font-medium">
                    <Star className="w-3.5 h-3.5 shrink-0 mt-1" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
