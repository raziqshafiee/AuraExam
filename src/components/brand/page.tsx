import { type ReactNode } from "react";

export function PageHeader({
  badge, title, subtitle, badgeColor = "bg-lime", action,
}: {
  badge?: string;
  title: string;
  subtitle?: string;
  badgeColor?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        {badge && (
          <span className={`inline-block px-3 py-1 rounded-full border-2 border-ink font-mono text-[10px] uppercase tracking-widest shadow-brut-sm ${badgeColor}`}>
            {badge}
          </span>
        )}
        <h1 className="mt-2 font-display font-extrabold text-4xl md:text-5xl tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-muted-foreground max-w-2xl">{subtitle}</p>}
      </div>
      {action && <div className="flex gap-2">{action}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border-2 border-ink bg-card p-6 shadow-brut ${className}`}>
      {children}
    </div>
  );
}

export function Stat({ label, value, color = "bg-card" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className={`rounded-3xl border-2 border-ink p-5 shadow-brut ${color}`}>
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 font-display font-extrabold text-4xl">{value}</div>
    </div>
  );
}

export function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-extrabold text-2xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-ink/40 p-10 text-center">
      <div className="font-display font-bold text-lg">{title}</div>
      {hint && <div className="mt-1 text-sm text-muted-foreground">{hint}</div>}
    </div>
  );
}
