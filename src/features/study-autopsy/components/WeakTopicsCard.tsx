// src/features/study-autopsy/components/WeakTopicsCard.tsx
//
// "You lost most marks on: <topic> (60%)" summary. Groups wrong answers by
// their AI-generated concept_tag when available, falling back to the
// question's existing `tags` column before any explanation has been
// generated yet — so the card is useful immediately, not just after the
// student clicks "Generate".

import { Card } from "@/components/brand/page";
import { TrendingDown } from "lucide-react";
import type { QuestionState } from "../use-explanations";

type TopicBreakdown = { tag: string; pointsLost: number; pct: number };

function computeBreakdown(questions: QuestionState[]): TopicBreakdown[] {
  const totalLost = questions.reduce((sum, q) => sum + q.points, 0);
  if (totalLost === 0) return [];

  const byTag = new Map<string, number>();
  for (const q of questions) {
    const tag = q.conceptTag ?? q.fallbackTag;
    byTag.set(tag, (byTag.get(tag) ?? 0) + q.points);
  }

  return Array.from(byTag.entries())
    .map(([tag, pointsLost]) => ({ tag, pointsLost, pct: Math.round((pointsLost / totalLost) * 100) }))
    .sort((a, b) => b.pointsLost - a.pointsLost);
}

export function WeakTopicsCard({ questions }: { questions: QuestionState[] }) {
  if (questions.length === 0) return null;
  const breakdown = computeBreakdown(questions);
  const top = breakdown[0];

  return (
    <Card className="mb-6 bg-pink/10">
      <div className="flex items-start gap-3">
        <TrendingDown className="w-6 h-6 text-pink shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-lg">
            {top ? (
              <>You lost most marks on: {top.tag} ({top.pct}%)</>
            ) : (
              "Weak topics"
            )}
          </div>
          <div className="mt-3 space-y-2">
            {breakdown.map((b) => (
              <div key={b.tag} className="flex items-center gap-3 text-sm">
                <span className="w-32 sm:w-40 shrink-0 truncate font-medium">{b.tag}</span>
                <div className="flex-1 h-2.5 rounded-full bg-ink/10 overflow-hidden">
                  <div className="h-full bg-pink" style={{ width: `${b.pct}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">{b.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
