import { Link } from "@tanstack/react-router";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-display font-extrabold text-xl tracking-tight">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-lime border-2 border-ink shadow-brut-sm">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
          <path d="M12 1 L14.5 9 L23 11 L14.5 13 L12 21 L9.5 13 L1 11 L9.5 9 Z" />
        </svg>
      </span>
      <span>Aura<span className="text-pink">.</span></span>
    </Link>
  );
}
