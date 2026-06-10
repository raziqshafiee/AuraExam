import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, PageHeader, Empty } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getQuestions, deleteQuestion, type Question } from "@/lib/supabase/questions";

export const Route = createFileRoute("/_authenticated/lecturer/question-bank/")({
  head: () => ({ meta: [{ title: "Question bank — Aura" }] }),
  loader: () => getQuestions(),
  component: QuestionBank,
});

function QuestionBank() {
  const initial = Route.useLoaderData();
  const [questions, setQuestions] = useState<Question[]>(initial);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "MCQ" | "TF" | "ESSAY">("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const uniqueClasses = Array.from(
    new Map(questions.map((q) => [q.class_id, q.classes?.code])).entries()
  ).filter(([, code]) => Boolean(code));

  const filtered = questions.filter((q) => {
    const matchSearch =
      q.text.toLowerCase().includes(search.toLowerCase()) ||
      (q.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchType = typeFilter === "all" || q.type === typeFilter;
    const matchClass = classFilter === "all" || q.class_id === classFilter;
    return matchSearch && matchType && matchClass;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await deleteQuestion({ data: id });
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      toast.success("Question deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <PageHeader
        badge="Library"
        badgeColor="bg-lime"
        title="Question bank"
        subtitle={`${questions.length} question${questions.length !== 1 ? "s" : ""}`}
        action={
          <WakeoutButton asChild>
            <Link to="/lecturer/question-bank/new">+ New question</Link>
          </WakeoutButton>
        }
      />

      <Card className="mb-4">
        <div className="flex gap-3 flex-wrap">
          <input
            placeholder="Search questions or tags…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 min-w-48 border-2 border-ink rounded-full px-4 py-1.5 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-lime"
          />
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as typeof typeFilter); setPage(1); }}
            className="border-2 border-ink rounded-full px-3 py-1.5 bg-background text-sm font-mono focus:outline-none"
          >
            <option value="all">All types</option>
            <option value="MCQ">MCQ</option>
            <option value="TF">True / False</option>
            <option value="ESSAY">Essay</option>
          </select>
          <select
            value={classFilter}
            onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
            className="border-2 border-ink rounded-full px-3 py-1.5 bg-background text-sm font-mono focus:outline-none"
          >
            <option value="all">All classes</option>
            {uniqueClasses.map(([id, code]) => (
              <option key={id} value={id!}>{code}</option>
            ))}
          </select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Empty
          title="No questions found"
          hint={
            questions.length === 0
              ? "Create your first question to get started."
              : "Try adjusting your filters."
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {paginated.map((q) => (
              <Card key={q.id} className="flex items-center gap-4 flex-wrap py-4">
                <span
                  className={`px-2.5 py-1 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest shrink-0 ${
                    q.type === "MCQ"
                      ? "bg-lime"
                      : q.type === "TF"
                      ? "bg-pink"
                      : "bg-violet text-violet-foreground"
                  }`}
                >
                  {q.type}
                </span>
                <div className="text-xs font-mono text-muted-foreground shrink-0">
                  {q.classes?.code ?? "—"}
                </div>
                <div className="flex-1 min-w-48 font-medium line-clamp-2">{q.text}</div>
                <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground shrink-0 flex-wrap">
                  {q.tags?.length > 0 && <span>{q.tags.join(", ")}</span>}
                  <span
                    className={`px-2 py-0.5 rounded-full border border-ink/30 ${
                      q.difficulty === "easy"
                        ? "bg-lime/40"
                        : q.difficulty === "hard"
                        ? "bg-pink/40"
                        : "bg-amber/40"
                    }`}
                  >
                    {q.difficulty}
                  </span>
                  <span>
                    v{q.version} · {q.points}pt{q.points !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <WakeoutButton asChild size="sm" variant="secondary">
                    <Link to="/lecturer/question-bank/$id/edit" params={{ id: q.id }}>
                      Edit
                    </Link>
                  </WakeoutButton>
                  <WakeoutButton
                    size="sm"
                    variant="ghost"
                    disabled={deleting === q.id}
                    onClick={() => handleDelete(q.id)}
                  >
                    {deleting === q.id ? "…" : "Delete"}
                  </WakeoutButton>
                </div>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-xs font-mono text-muted-foreground">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 rounded-full border-2 border-ink text-xs font-mono font-bold bg-card hover:bg-ink hover:text-paper transition-all shadow-brut disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ←
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`w-8 h-8 rounded-full border-2 border-ink text-xs font-mono font-bold transition-all shadow-brut ${
                      n === safePage ? "bg-ink text-paper" : "bg-card hover:bg-ink hover:text-paper"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={safePage === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-full border-2 border-ink text-xs font-mono font-bold bg-card hover:bg-ink hover:text-paper transition-all shadow-brut disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
