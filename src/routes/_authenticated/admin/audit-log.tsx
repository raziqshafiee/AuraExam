import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { fmtMY } from "@/lib/datetime";
import { getAuditLog, type AuditCategory, type AuditEntry } from "@/lib/supabase/audit";

const TABS: { key: AuditCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "user_management", label: "Users" },
  { key: "exam", label: "Exams" },
  { key: "appeal", label: "Appeals" },
  { key: "integrity", label: "Integrity" },
  { key: "class", label: "Classes" },
];

const CATEGORY_STYLE: Record<AuditCategory, { bg: string; label: string }> = {
  user_management: { bg: "bg-lime", label: "User" },
  exam:            { bg: "bg-violet text-violet-foreground", label: "Exam" },
  appeal:          { bg: "bg-sky", label: "Appeal" },
  integrity:       { bg: "bg-pink", label: "Integrity" },
  class:           { bg: "bg-amber", label: "Class" },
  general:         { bg: "bg-muted", label: "General" },
};

export const Route = createFileRoute("/_authenticated/admin/audit-log")({
  head: () => ({ meta: [{ title: "Audit log — Aura" }] }),
  loader: () => getAuditLog(),
  component: AuditLogPage,
});

function AuditLogPage() {
  const entries = Route.useLoaderData() as AuditEntry[];
  const [tab, setTab] = useState<AuditCategory | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = entries.filter((e) => {
    const matchTab = tab === "all" || e.category === tab;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      e.actor.toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q) ||
      e.target.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  return (
    <>
      <PageHeader
        badge="History"
        badgeColor="bg-lime"
        title="Audit log"
        subtitle={`${filtered.length} of ${entries.length} events`}
      />

      <div className="flex gap-3 flex-wrap items-center mb-4">
        <input
          type="search"
          placeholder="Search by actor, action or target…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] border-2 border-ink rounded-full px-4 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-lime"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full border-2 border-ink text-sm font-mono transition-colors ${
              tab === t.key
                ? "bg-ink text-background"
                : "bg-card hover:bg-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground font-mono text-sm">
            No events recorded yet.
          </p>
        ) : (
          <ul className="divide-y-2 divide-ink/10">
            {filtered.map((e) => {
              const style = CATEGORY_STYLE[e.category] ?? CATEGORY_STYLE.general;
              return (
                <li key={e.id} className="py-3 flex items-start gap-3 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground w-40 shrink-0 pt-0.5">
                    {fmtMY(e.created_at, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest shrink-0 ${style.bg}`}
                  >
                    {style.label}
                  </span>
                  <span className="font-semibold shrink-0">{e.actor}</span>
                  <span className="text-sm text-muted-foreground shrink-0">{e.action}</span>
                  <span className="font-mono text-sm">→ {e.target}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
