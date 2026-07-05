import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";

export function MarketingFooter() {
  return (
    <footer className="bg-ink text-background border-t-2 border-ink">
      <div className="max-w-7xl mx-auto px-6 py-16 grid gap-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="text-background">
            <Logo />
          </div>
          <p className="mt-4 max-w-sm text-sm text-background/70">
            Online exams that feel calm, fair, and a little bit fun. Built for Malaysian classrooms.
          </p>
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-background/50 mb-3">Product</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/features" className="hover:text-lime">Features</Link></li>
            <li><Link to="/philosophy" className="hover:text-lime">Philosophy</Link></li>
            <li><Link to="/login" className="hover:text-lime">Log in</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-background/50 mb-3">Company</div>
          <ul className="space-y-2 text-sm">
            <li><span className="text-background/50">Built in Malaysia 🇲🇾</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-background/15 py-6 text-center text-xs font-mono text-background/50">
        © 2026 Aura Exam · UTC+8
      </div>
    </footer>
  );
}
