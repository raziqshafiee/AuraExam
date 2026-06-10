import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/brand/marketing-layout";
import { WakeoutButton } from "@/components/brand/wakeout-button";

export const Route = createFileRoute("/philosophy")({
  head: () => ({
    meta: [
      { title: "Philosophy — Aura Exam" },
      { name: "description", content: "Why Aura Exam is built for calm, fair, kind online examinations." },
      { property: "og:title", content: "Philosophy — Aura Exam" },
      { property: "og:description", content: "Why we build calm, fair, kind exams." },
    ],
  }),
  component: PhilosophyPage,
});

function PhilosophyPage() {
  return (
    <MarketingLayout>
      <section className="border-b-2 border-ink">
        <div className="max-w-3xl mx-auto px-6 py-24">
          <span className="inline-block px-4 py-1.5 rounded-full border-2 border-ink bg-pink font-mono text-xs uppercase tracking-widest shadow-brut-sm">A small manifesto</span>
          <h1 className="mt-6 font-display font-extrabold text-6xl tracking-tight">
            Exams are stressful enough. The software shouldn't be.
          </h1>
          <div className="mt-10 space-y-6 text-lg leading-relaxed text-foreground/90">
            <p>
              Most online exam platforms feel like airport security. Cameras tracking your eyes.
              Browsers locked into kiosk mode. Modals that scream at you for blinking.
            </p>
            <p>
              We built Aura the other way. <span className="font-bold">No video recording.</span>
              Screenshots only happen when the system genuinely needs proof. Frames never leave your
              browser. The interface is calm, the copy is kind, and the colors are warm because
              you're about to do something hard.
            </p>
            <p>
              Lecturers shouldn't have to learn a new tool every semester. Students shouldn't dread
              opening the tab. Admins shouldn't be the bad guy. Aura's job is to disappear — so
              learning, teaching, and grading can be the loudest things in the room.
            </p>
            <h2 className="font-display font-extrabold text-3xl pt-6">What we won't do</h2>
            <ul className="space-y-3 pl-6 list-disc marker:text-pink">
              <li>Record video of students taking exams.</li>
              <li>Send camera frames to a third-party API.</li>
              <li>Auto-fail anyone without lecturer review.</li>
              <li>Charge per-seat fees that punish small classes.</li>
            </ul>
          </div>
          <div className="mt-12">
            <WakeoutButton asChild size="lg">
              <Link to="/register">Join the calm side</Link>
            </WakeoutButton>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
