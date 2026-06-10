import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/brand/marketing-layout";
import { Star } from "@/components/brand/doodles";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — Aura Exam" },
      { name: "description", content: "Question banks, exam builder, FaceLandmarker proctoring, integrity flags, appeals, assignments — everything Aura Exam ships with." },
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
      "MCQ, True/False, Essay question types",
      "Rich text with LaTeX + code blocks",
      "Reusable across any exam",
      "Tags and point weights per question",
      "Bulk-select when building exams",
    ],
  },
  {
    title: "Exam management",
    color: "bg-pink",
    items: [
      "Guided lifecycle: draft → upcoming → live → closed → graded",
      "Publish when ready; unpublish before any submissions exist",
      "Only title editable after publishing",
      "Fullscreen enforced on exam start (user-gesture scope)",
      "Auto-submit on timeout",
    ],
  },
  {
    title: "Proctoring",
    color: "bg-violet text-violet-foreground",
    items: [
      "MediaPipe FaceLandmarker — runs in-browser via WebAssembly",
      "Gaze tracking: head-turned (|yaw| > 45°) + looking-down (pitch < −30°)",
      "Multiple-face detection with 8-second grace period",
      "Adaptive snapshots: 60s normal rate, 15s during alert mode",
      "Snapshots stored per submission — no video ever recorded",
    ],
  },
  {
    title: "Integrity flags",
    color: "bg-sky",
    items: [
      "Hard flags: tab-switch, copy-paste, fullscreen exit, multiple faces",
      "3 hard flags → exam auto-submitted as flagged",
      "Advisory flags: face missing, camera lost, gaze away, head turned",
      "Advisory flags recorded for lecturer review — never auto-submit",
      "60-second cooldown between repeated hard flag reports",
    ],
  },
  {
    title: "Grading + appeals",
    color: "bg-amber",
    items: [
      "MCQ and True/False auto-graded instantly on submit",
      "Manual essay grading per question by the lecturer",
      "One appeal per submission — score dispute or integrity challenge",
      "7-day appeal window from submission date",
      "Integrity appeal approved → retake unlocked; score appeal approved → grade updated",
    ],
  },
  {
    title: "Assignments",
    color: "bg-card",
    items: [
      "File submissions with server-enforced deadlines",
      "Resubmit any time before the deadline (replaces previous file)",
      "Locked after lecturer marks as reviewed",
      "Grading available only after the deadline closes",
      "Download submissions for offline review",
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
