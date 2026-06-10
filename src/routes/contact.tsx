import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/brand/marketing-layout";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { Mail, MapPin, Star } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Aura Exam" },
      { name: "description", content: "Get in touch with the Aura Exam team." },
      { property: "og:title", content: "Contact — Aura Exam" },
      { property: "og:description", content: "Say hi to the Aura Exam team." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <MarketingLayout>
      <section className="border-b-2 border-ink">
        <div className="max-w-5xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12">
          <div>
            <span className="inline-block px-4 py-1.5 rounded-full border-2 border-ink bg-violet text-violet-foreground font-mono text-xs uppercase tracking-widest shadow-brut-sm">Say hi</span>
            <h1 className="mt-4 font-display font-extrabold text-5xl tracking-tight">Let's talk exams.</h1>
            <p className="mt-4 text-muted-foreground max-w-md">
              Drop us a line about your institution, your students, or what's broken about the tool you use today.
            </p>
            <div className="mt-8 space-y-4 text-sm">
              <div className="flex items-center gap-3"><Mail className="w-5 h-5 text-pink" /> hello@aura-exam.app</div>
              <div className="flex items-center gap-3"><MapPin className="w-5 h-5 text-violet" /> Kuala Lumpur · UTC+8</div>
              <div className="flex items-center gap-3"><Star className="w-5 h-5 text-amber" /> Replies within 1 working day</div>
            </div>
          </div>
          <form className="rounded-3xl border-2 border-ink bg-card p-6 shadow-brut space-y-4">
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Name</label>
              <input className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" placeholder="Your name" />
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Email</label>
              <input type="email" className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" placeholder="you@school.edu.my" />
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Message</label>
              <textarea rows={5} className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" placeholder="Tell us a bit..." />
            </div>
            <WakeoutButton type="button" className="w-full">Send it</WakeoutButton>
          </form>
        </div>
      </section>
    </MarketingLayout>
  );
}
