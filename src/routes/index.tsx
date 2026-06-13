import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/brand/marketing-layout";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { DoodleBackdrop, Star, Squiggle, Zigzag, Dots } from "@/components/brand/doodles";
import { ArrowRight, ShieldCheck, Eye, Lock, Pencil, GraduationCap, Sparkles, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aura Exam — Online exams that feel calm." },
      { name: "description", content: "Not another stressful proctoring tool. Aura Exam is the playful, fair, calm way to run online exams for Malaysian classrooms." },
      { property: "og:title", content: "Aura Exam — Online exams that feel calm." },
      { property: "og:description", content: "Playful, fair, calm online examinations for Malaysian classrooms." },
    ],
  }),
  component: Index,
});

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border-2 border-ink bg-card font-mono text-xs uppercase tracking-widest shadow-brut-sm ${className}`}>
      {children}
    </span>
  );
}

function Index() {
  return (
    <MarketingLayout>
      {/* HERO */}
      <section className="relative overflow-hidden border-b-2 border-ink">
        <DoodleBackdrop />
        <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-28 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <Pill className="bg-lime"><Sparkles className="w-3.5 h-3.5" /> Not another stressful proctoring tool.</Pill>
            <h1 className="mt-6 font-display font-extrabold text-6xl md:text-7xl leading-[0.95] tracking-tight">
              Exams that <span className="relative inline-block">
                actually
                <Squiggle className="absolute -bottom-2 left-0 w-full h-3 text-pink" />
              </span>
              <br />feel <span className="text-violet">calm.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-md">
              Aura is the online exam platform built for Malaysian classrooms. Fair proctoring, friendly UI, and zero
              "what just happened" energy. Wiggle through your next paper.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <WakeoutButton asChild size="lg">
                <Link to="/register">Get started — free <ArrowRight className="w-4 h-4" /></Link>
              </WakeoutButton>
              <WakeoutButton asChild size="lg" variant="secondary">
                <Link to="/features">See how it works</Link>
              </WakeoutButton>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2"><Star className="w-5 h-5 text-amber" /> Built for UTC+8</div>
              <div className="flex items-center gap-2"><Star className="w-5 h-5 text-violet" /> No video recording</div>
            </div>
          </div>

          {/* Mock exam card */}
          <div className="relative">
            <div className="absolute -top-6 -right-6 text-pink"><Zigzag className="w-32 h-6" /></div>
            <div className="absolute -bottom-6 -left-6 text-violet"><Dots /></div>
            <div className="relative rounded-4xl border-2 border-ink bg-card shadow-brut-lg p-6 rotate-[-1.5deg]">
              <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                <span>EXAM · DATA STRUCTURES 101</span>
                <span className="text-pink font-bold">⏱ 42:18</span>
              </div>
              <div className="mt-6 rounded-2xl bg-secondary border-2 border-ink p-5">
                <div className="font-mono text-xs text-muted-foreground">QUESTION 7 OF 20</div>
                <div className="mt-2 font-display font-bold text-2xl leading-snug">
                  Which traversal visits the root <em className="text-pink not-italic">last</em>?
                </div>
                <ul className="mt-4 space-y-2">
                  {[
                    { k: "A", t: "Pre-order", on: false },
                    { k: "B", t: "In-order", on: false },
                    { k: "C", t: "Post-order", on: true },
                    { k: "D", t: "Level-order", on: false },
                  ].map((o) => (
                    <li
                      key={o.k}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-ink font-medium ${o.on ? "bg-lime shadow-brut-sm" : "bg-card"}`}
                    >
                      <span className="font-mono text-xs">{o.k}</span>
                      <span>{o.t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <button className="text-sm font-semibold text-muted-foreground">← Prev</button>
                <div className="flex gap-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <span key={i} className={`w-2.5 h-2.5 rounded-full border-2 border-ink ${i === 6 ? "bg-lime" : i < 6 ? "bg-violet" : "bg-card"}`} />
                  ))}
                </div>
                <button className="text-sm font-semibold">Next →</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ROLE BAND */}
      <section className="bg-lime border-b-2 border-ink py-4 overflow-hidden">
        <div className="flex gap-12 whitespace-nowrap font-display font-bold text-2xl">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-12">
              <span>STUDENT</span><Star className="w-5 h-5" />
              <span>LECTURER</span><Star className="w-5 h-5" />
              <span>ADMIN</span><Star className="w-5 h-5" />
              <span>ALL IN ONE PLACE</span><Star className="w-5 h-5" />
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="relative border-b-2 border-ink">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="max-w-2xl">
            <Pill>The good stuff</Pill>
            <h2 className="mt-4 font-display font-extrabold text-5xl tracking-tight">
              Everything an exam needs.<br />
              <span className="text-muted-foreground">Nothing it doesn't.</span>
            </h2>
          </div>

          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Pencil,
                color: "bg-lime",
                title: "Question bank",
                text: "MCQ, true/false, and essay. Write once, reuse across any exam. Rich text with LaTeX and code blocks built in.",
              },
              {
                icon: GraduationCap,
                color: "bg-pink",
                title: "Guided exam lifecycle",
                text: "Draft → upcoming → live → closed → graded. Each state has guardrails — no accidental publishes, no edits once students are in.",
              },
              {
                icon: Eye,
                color: "bg-violet text-violet-foreground",
                title: "Local face detection",
                text: "MediaPipe FaceLandmarker runs entirely in your browser via WebAssembly. Detects multiple faces and tracks gaze direction. No video ever leaves the device.",
              },
              {
                icon: Lock,
                color: "bg-sky",
                title: "Fullscreen lockdown",
                text: "Exams run fullscreen. Tab-switching, copy-paste, right-click, and leaving fullscreen are hard integrity flags — three strikes auto-submits the paper.",
              },
              {
                icon: ShieldCheck,
                color: "bg-amber",
                title: "Score + integrity appeals",
                text: "One appeal per submission within 7 days. Dispute a score or challenge a flag. Approved integrity appeals unlock a retake; approved score appeals update the grade directly.",
              },
              {
                icon: ClipboardList,
                color: "bg-card",
                title: "Assignments",
                text: "File submissions with server-enforced deadlines. Resubmit any time before the cutoff. Lecturers review and grade after close — locked once marked.",
              },
            ].map((f, i) => (
              <div key={i} className="group rounded-3xl border-2 border-ink bg-card p-6 shadow-brut hover:-translate-y-1 transition-transform">
                <div className={`w-12 h-12 rounded-2xl border-2 border-ink flex items-center justify-center mb-4 ${f.color}`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="font-display font-bold text-xl">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THREE ROLES */}
      <section className="border-b-2 border-ink">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="text-center max-w-2xl mx-auto">
            <Pill>Built for everyone</Pill>
            <h2 className="mt-4 font-display font-extrabold text-5xl tracking-tight">Three roles. One vibe.</h2>
          </div>
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {[
              {
                role: "Students",
                color: "bg-sky",
                to: "/login",
                points: [
                  "Join classes with an enrolment code",
                  "Take exams in fullscreen lockdown",
                  "Submit assignments before the deadline",
                  "Appeal grades or integrity flags within 7 days",
                ],
              },
              {
                role: "Lecturers",
                color: "bg-violet text-violet-foreground",
                to: "/login",
                points: [
                  "Build a reusable question bank (MCQ, TF, Essay)",
                  "Schedule exams through a guided lifecycle",
                  "Monitor live sessions and grade essays",
                  "Review and resolve appeals in-app",
                ],
              },
              {
                role: "Admins",
                color: "bg-lime",
                to: "/login",
                points: [
                  "Manage users — ban, unban, reset password",
                  "View the full audit log by category",
                  "Configure platform defaults",
                ],
              },
            ].map((r) => (
              <div key={r.role} className={`rounded-3xl border-2 border-ink p-8 shadow-brut ${r.color}`}>
                <h3 className="font-display font-extrabold text-3xl">{r.role}</h3>
                <ul className="mt-6 space-y-3">
                  {r.points.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <Star className="w-4 h-4 shrink-0 mt-1" />
                      <span className="font-medium">{p}</span>
                    </li>
                  ))}
                </ul>
                <WakeoutButton asChild variant="secondary" size="sm" className="mt-8">
                  <Link to={r.to}>Open my view →</Link>
                </WakeoutButton>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b-2 border-ink">
        <div className="max-w-4xl mx-auto px-6 py-24">
          <Pill>Quick answers</Pill>
          <h2 className="mt-4 font-display font-extrabold text-5xl tracking-tight">Questions, sorted.</h2>
          <div className="mt-12 space-y-4">
            {[
              {
                q: "Is my camera recording video?",
                a: "No. MediaPipe FaceLandmarker runs locally in your browser using WebAssembly — no stream ever leaves the device. Only still snapshots are captured when suspicious activity is detected, and only those images are stored.",
              },
              {
                q: "What counts as an integrity flag?",
                a: "Hard flags — tab-switching, copy-paste, leaving fullscreen, and multiple faces in frame — count toward a 3-strike auto-submit. Advisory flags — face missing, camera lost, gaze away, and head turned — are recorded for the lecturer to review but never trigger auto-submit on their own.",
              },
              {
                q: "What happens if I lose internet during an exam?",
                a: "Answers autosave as you type. When you reconnect, you resume exactly where you left off. The timer keeps running, so reconnect quickly.",
              },
              {
                q: "Can I appeal a result?",
                a: "Yes — one appeal per submission within 7 days of the result. Submit a score dispute if you think the grade is wrong, or an integrity appeal if you were flagged unfairly. Approved integrity appeals unlock a retake; approved score appeals update your grade directly.",
              },
            ].map((f, i) => (
              <details key={i} className="group rounded-2xl border-2 border-ink bg-card p-6 shadow-brut-sm open:shadow-brut">
                <summary className="font-display font-bold text-xl cursor-pointer list-none flex items-center justify-between">
                  {f.q}
                  <span className="ml-4 w-8 h-8 rounded-full border-2 border-ink flex items-center justify-center bg-lime group-open:bg-pink transition-colors">+</span>
                </summary>
                <p className="mt-4 text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-violet text-violet-foreground border-b-2 border-ink relative overflow-hidden">
        <DoodleBackdrop />
        <div className="relative max-w-4xl mx-auto px-6 py-24 text-center">
          <h2 className="font-display font-extrabold text-5xl md:text-6xl tracking-tight">
            Ready to make exams<br />less of a thing?
          </h2>
          <p className="mt-6 text-violet-foreground/80 max-w-lg mx-auto">
            Spin up your account in under a minute. Free for the dev &amp; testing phase.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <WakeoutButton asChild size="lg">
              <Link to="/register">Create my account</Link>
            </WakeoutButton>
            <WakeoutButton asChild size="lg" variant="secondary">
              <Link to="/contact">Talk to us</Link>
            </WakeoutButton>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
