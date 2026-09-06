import { useMemo, useState } from "react";
import { PageHeader, Section, Empty } from "@/components/brand/page";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HELP_CATEGORIES, type HelpEntry } from "@/lib/help-content";
import type { Role } from "@/lib/auth";
import { Search } from "lucide-react";

function matches(entry: HelpEntry, query: string) {
  const haystack = [entry.question, entry.answer, ...(entry.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function HelpPage({ role }: { role: Role }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const categories = useMemo(() => {
    return HELP_CATEGORIES.filter((c) => c.roles.includes(role))
      .map((c) => ({
        ...c,
        entries: c.entries.filter((e) => e.roles.includes(role)),
      }))
      .filter((c) => c.entries.length > 0)
      .map((c) => ({
        ...c,
        entries: query ? c.entries.filter((e) => matches(e, query)) : c.entries,
      }))
      .filter((c) => c.entries.length > 0);
  }, [role, query]);

  const totalMatches = categories.reduce((sum, c) => sum + c.entries.length, 0);

  return (
    <>
      <PageHeader
        badge="Help"
        badgeColor="bg-amber"
        title="Help Center"
        subtitle="Search or browse by topic — every module, answered."
      />

      <div className="relative mb-8 max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          placeholder='Search for an issue, e.g. "camera", "appeal", "flagged"…'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border-2 border-ink rounded-full pl-11 pr-4 py-2.5 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-lime"
        />
      </div>

      {query && (
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
          {totalMatches} result{totalMatches !== 1 ? "s" : ""} for "{search.trim()}"
        </p>
      )}

      {categories.length === 0 ? (
        <Empty
          title="No results found"
          hint="Try a different word, or check Common Problems below."
        />
      ) : (
        categories.map((category) => (
          <Section key={category.id} title={category.title}>
            <Accordion type="multiple" className="rounded-3xl border-2 border-ink bg-card px-6 shadow-brut">
              {category.entries.map((entry) => (
                <AccordionItem key={entry.id} value={entry.id} className="border-ink/15">
                  <AccordionTrigger className="font-display font-bold">
                    {entry.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {entry.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Section>
        ))
      )}
    </>
  );
}
