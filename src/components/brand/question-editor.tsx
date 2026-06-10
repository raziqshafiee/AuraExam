import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bold, Italic, Code, Sigma } from "lucide-react";
import { PageHeader, Card } from "./page";
import { WakeoutButton } from "./wakeout-button";
import {
  createQuestion,
  updateQuestion,
  type Question,
  type QuestionMeta,
} from "@/lib/supabase/questions";

type ClassOption = { id: string; code: string; name: string; [key: string]: any };

export function QuestionEditor({
  mode,
  classes,
  question,
}: {
  mode: "new" | "edit";
  classes: ClassOption[];
  question?: Question;
}) {
  const navigate = useNavigate();

  const [type, setType] = useState<"MCQ" | "TF" | "ESSAY">(question?.type ?? "MCQ");
  const [text, setText] = useState(question?.text ?? "");
  const [classId, setClassId] = useState(question?.class_id ?? classes[0]?.id ?? "");
  const [difficulty, setDifficulty] = useState<"easy" | "med" | "hard">(question?.difficulty ?? "med");
  const [points, setPoints] = useState(question?.points ?? 2);
  const [tagsInput, setTagsInput] = useState((question?.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);

  const mcqMeta = question?.type === "MCQ" ? (question.meta as any) : null;
  const [options, setOptions] = useState<[string, string, string, string]>(
    mcqMeta?.options ?? ["", "", "", ""]
  );
  const [correct, setCorrect] = useState<0 | 1 | 2 | 3>(mcqMeta?.correct ?? 0);

  const tfMeta = question?.type === "TF" ? (question.meta as any) : null;
  const [tfCorrect, setTfCorrect] = useState<boolean>(tfMeta?.correct ?? true);

  const essayMeta = question?.type === "ESSAY" ? (question.meta as any) : null;
  const [modelAnswer, setModelAnswer] = useState(essayMeta?.model_answer ?? "");
  const [rubric, setRubric] = useState(essayMeta?.rubric ?? "");

  function buildMeta(): QuestionMeta {
    if (type === "MCQ") return { options, correct };
    if (type === "TF") return { correct: tfCorrect };
    return { model_answer: modelAnswer, rubric };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!classId) { toast.error("Select a class first"); return; }
    setSaving(true);
    try {
      const payload = {
        type,
        text,
        class_id: classId,
        difficulty,
        points,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
        meta: buildMeta(),
      };
      if (mode === "new") {
        await createQuestion({ data: payload });
        toast.success("Question saved!");
      } else {
        await updateQuestion({ data: { id: question!.id, ...payload } });
        toast.success("Question updated!");
      }
      navigate({ to: "/lecturer/question-bank" });
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        badge={mode === "new" ? "Compose" : "Edit"}
        badgeColor="bg-lime"
        title={mode === "new" ? "New question" : "Edit question"}
      />
      <form onSubmit={handleSave}>
        <div className="grid lg:grid-cols-[1fr_280px] gap-6">
          <div className="space-y-4">
            <Card>
              <div className="flex gap-2">
                {(["MCQ", "TF", "ESSAY"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`px-3 py-1.5 rounded-full border-2 border-ink text-sm font-semibold transition-colors ${
                      type === t ? "bg-lime shadow-brut-sm" : "bg-card hover:bg-accent"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <label className="text-xs font-mono uppercase tracking-widest">Question</label>
              <div className="mt-1 border-2 border-ink rounded-xl bg-background">
                <div className="flex items-center gap-1 border-b-2 border-ink p-2">
                  {[Bold, Italic, Code, Sigma].map((Ic, i) => (
                    <button
                      key={i}
                      type="button"
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-accent"
                    >
                      <Ic className="w-4 h-4" />
                    </button>
                  ))}
                  <span className="ml-2 text-xs font-mono text-muted-foreground">LaTeX + code</span>
                </div>
                <textarea
                  required
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full bg-transparent px-3 py-2 outline-none resize-none"
                  placeholder="Type your question..."
                />
              </div>
            </Card>

            {type === "MCQ" && (
              <Card>
                <label className="text-xs font-mono uppercase tracking-widest">Options</label>
                <div className="mt-2 space-y-2">
                  {(["A", "B", "C", "D"] as const).map((k, i) => (
                    <div key={k} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct"
                        checked={correct === i}
                        onChange={() => setCorrect(i as 0 | 1 | 2 | 3)}
                        className="w-4 h-4 accent-lime"
                      />
                      <span className="font-mono text-xs w-6 font-bold">{k}</span>
                      <input
                        required
                        value={options[i]}
                        onChange={(e) => {
                          const next = [...options] as [string, string, string, string];
                          next[i] = e.target.value;
                          setOptions(next);
                        }}
                        placeholder={`Option ${k}`}
                        className="flex-1 border-2 border-ink rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-lime"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    Select the radio button next to the correct answer
                  </p>
                </div>
              </Card>
            )}

            {type === "TF" && (
              <Card>
                <label className="text-xs font-mono uppercase tracking-widest">Correct answer</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {([true, false] as const).map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setTfCorrect(v)}
                      className={`px-4 py-3 rounded-xl border-2 border-ink font-bold transition-colors ${
                        tfCorrect === v ? "bg-lime shadow-brut-sm" : "bg-card hover:bg-accent"
                      }`}
                    >
                      {v ? "True" : "False"}
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {type === "ESSAY" && (
              <Card>
                <label className="text-xs font-mono uppercase tracking-widest">Model answer</label>
                <textarea
                  rows={6}
                  value={modelAnswer}
                  onChange={(e) => setModelAnswer(e.target.value)}
                  className="mt-2 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-lime resize-none"
                  placeholder="What does a full-marks answer look like?"
                />
                <label className="text-xs font-mono uppercase tracking-widest mt-4 block">Rubric</label>
                <textarea
                  rows={3}
                  value={rubric}
                  onChange={(e) => setRubric(e.target.value)}
                  className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-lime resize-none"
                  placeholder="Grading rubric / key points"
                />
              </Card>
            )}
          </div>

          <aside className="space-y-4">
            <Card>
              <div className="font-display font-bold mb-3">Meta</div>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs font-mono uppercase tracking-widest">Class</label>
                  <select
                    required
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    className="mt-1 w-full border-2 border-ink rounded-xl px-3 py-2 bg-background focus:outline-none"
                  >
                    <option value="">Select class…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-widest">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as "easy" | "med" | "hard")}
                    className="mt-1 w-full border-2 border-ink rounded-xl px-3 py-2 bg-background focus:outline-none"
                  >
                    <option value="easy">Easy</option>
                    <option value="med">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-widest">Points</label>
                  <input
                    type="number"
                    min={1}
                    value={points}
                    onChange={(e) => setPoints(Number(e.target.value))}
                    className="mt-1 w-full border-2 border-ink rounded-xl px-3 py-2 bg-background focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-widest">Tags</label>
                  <input
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="trees, recursion"
                    className="mt-1 w-full border-2 border-ink rounded-xl px-3 py-2 bg-background focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-muted-foreground font-mono">Comma-separated</p>
                </div>
              </div>
            </Card>

            {mode === "edit" && question && (
              <Card>
                <div className="font-display font-bold mb-2">Version history</div>
                <div className="text-sm font-mono">v{question.version} · current</div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">
                  Saving creates v{question.version + 1}
                </div>
              </Card>
            )}

            <div className="flex gap-2">
              <WakeoutButton
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => navigate({ to: "/lecturer/question-bank" })}
              >
                Cancel
              </WakeoutButton>
              <WakeoutButton type="submit" className="flex-1" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </WakeoutButton>
            </div>
          </aside>
        </div>
      </form>
    </>
  );
}
