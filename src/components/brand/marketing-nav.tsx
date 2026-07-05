import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";
import { WakeoutButton } from "./wakeout-button";

const links = [
  { to: "/features", label: "Features" },
  { to: "/philosophy", label: "Philosophy" },
] as const;

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b-2 border-ink">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
        <Logo />
        <nav className="hidden md:flex items-center gap-1 ml-6">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="px-4 py-2 text-sm font-semibold rounded-full hover:bg-accent transition-colors"
              activeProps={{ className: "bg-accent" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <WakeoutButton asChild variant="ghost" size="sm">
            <Link to="/login">Log in</Link>
          </WakeoutButton>
          <WakeoutButton asChild size="sm">
            <Link to="/register">Get started</Link>
          </WakeoutButton>
        </div>
      </div>
    </header>
  );
}
