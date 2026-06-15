import { useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bold, Italic, Code, Image, X, Upload } from "lucide-react";
import { PageHeader, Card } from "./page";
import { WakeoutButton } from "./wakeout-button";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { renderMarkdown } from "@/lib/render-text";
import {
  createQuestion,
  updateQuestion,
  type Question,
  type QuestionMeta,
} from "@/lib/supabase/questions";

type ClassOption = { id: string; code: string; name: string; [key: string]: any };

const SYMBOL_GROUPS = [
  { label: "Greek",     symbols: ["α","β","γ","δ","θ","λ","μ","π","σ","Σ","Δ","Ω","φ","∞"] },
  { label: "Trig",      symbols: ["sin","cos","tan","sin⁻¹","cos⁻¹","tan⁻¹","sec","csc","cot"] },
  { label: "Log",       symbols: ["log","ln","log₂","log₁₀"] },
  { label: "Operators", symbols: ["±","×","÷","≤","≥","≠","≈","√","∫","∑","∏","→","∈","∉"] },
  { label: "Powers",    symbols: ["²","³","⁴","⁻¹","½","¼","¾"] },
  { label: "Sub",       symbols: ["₀","₁","₂","₃","₄","₅","₆","₇","₈","₉"] },
];

function SymbolPanel({ onInsert }: { onInsert: (sym: string) => void }) {
  return (
    <div className="p-2 border-2 border-ink rounded-xl bg-secondary/40 space-y-1.5">
      {SYMBOL_GROUPS.map((group) => (
        <div key={group.label} className="flex items-start gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground w-14 pt-1 shrink-0">
            {group.label}
          </span>
          <div className="flex flex-wrap gap-1">
            {group.symbols.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => onInsert(sym)}
                className="px-1.5 py-0.5 rounded border-2 border-ink bg-card hover:bg-lime text-xs font-mono transition-colors"
              >
                {sym}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function wrapSelection(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  before: string,
  after: string,
  setter: React.Dispatch<React.SetStateAction<string>>
) {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = el.value.substring(start, end);
  const inner = selected || "text";
  const replacement = before + inner + after;
  setter(el.value.substring(0, start) + replacement + el.value.substring(end));
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + before.length, start + before.length + inner.length);
  });
}

function insertAtTextarea(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  sym: string,
  setter: React.Dispatch<React.SetStateAction<string>>
) {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const next = el.value.substring(0, start) + sym + el.value.substring(end);
  setter(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + sym.length, start + sym.length);
  });
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);

  const [type, setType] = useState<"MCQ" | "TF" | "ESSAY">(question?.type ?? "MCQ");
  const [text, setText] = useState(question?.text ?? "");
  const [classId, setClassId] = useState(question?.class_id ?? classes[0]?.id ?? "");
  const [difficulty, setDifficulty] = useState<"easy" | "med" | "hard">(question?.difficulty ?? "med");
  const [points, setPoints] = useState(question?.points ?? 2);
  const [tagsInput, setTagsInput] = useState((question?.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [showSymbols, setShowSymbols] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingOptionImg, setUploadingOptionImg] = useState<number | null>(null);
  const [optionSymbolTarget, setOptionSymbolTarget] = useState<number | null>(null);

  const mcqMeta = question?.type === "MCQ" ? (question.meta as any) : null;
  const [options, setOptions] = useState<[string, string, string, string]>(
    mcqMeta?.options ?? ["", "", "", ""]
  );
  const [correct, setCorrect] = useState<0 | 1 | 2 | 3>(mcqMeta?.correct ?? 0);
  const [optionImages, setOptionImages] = useState<[string | null, string | null, string | null, string | null]>(
    mcqMeta?.option_images ?? [null, null, null, null]
  );

  const tfMeta = question?.type === "TF" ? (question.meta as any) : null;
  const [tfCorrect, setTfCorrect] = useState<boolean>(tfMeta?.correct ?? true);

  const essayMeta = question?.type === "ESSAY" ? (question.meta as any) : null;
  const [modelAnswer, setModelAnswer] = useState(essayMeta?.model_answer ?? "");
  const [rubric, setRubric] = useState(essayMeta?.rubric ?? "");

  const [imageUrl, setImageUrl] = useState<string | null>((question?.meta as any)?.image_url ?? null);

  function insertAtOption(idx: number, sym: string) {
    const el = optionRefs.current[idx];
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.substring(0, start) + sym + el.value.substring(end);
    setOptions((prev) => {
      const arr = [...prev] as [string, string, string, string];
      arr[idx] = next;
      return arr;
    });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + sym.length, start + sym.length);
    });
  }

  function buildMeta(): QuestionMeta {
    const img = imageUrl ? { image_url: imageUrl } : {};
    if (type === "MCQ") {
      const hasOptionImgs = optionImages.some(Boolean);
      return { ...img, options, correct, ...(hasOptionImgs ? { option_images: optionImages } : {}) };
    }
    if (type === "TF") return { ...img, correct: tfCorrect };
    return { ...img, model_answer: modelAnswer, rubric };
  }

  async function uploadImage(file: File, path: string): Promise<string> {
    const supabase = createBrowserClient();
    const { error } = await supabase.storage.from("class-materials").upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    const { data: { publicUrl } } = supabase.storage.from("class-materials").getPublicUrl(path);
    return publicUrl;
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    setUploadingImg(true);
    try {
      const url = await uploadImage(file, `questions/${Date.now()}-${file.name}`);
      setImageUrl(url);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image");
    } finally {
      setUploadingImg(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  }

  async function handleOptionImageUpload(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    setUploadingOptionImg(idx);
    try {
      const url = await uploadImage(file, `questions/${Date.now()}-opt${idx}-${file.name}`);
      setOptionImages((prev) => {
        const next = [...prev] as [string | null, string | null, string | null, string | null];
        next[idx] = url;
        return next;
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image");
    } finally {
      setUploadingOptionImg(null);
    }
  }

  function removeOptionImage(idx: number) {
    setOptionImages((prev) => {
      const next = [...prev] as [string | null, string | null, string | null, string | null];
      next[idx] = null;
      return next;
    });
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
            {/* Question type selector */}
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

            {/* Question text editor */}
            <Card>
              <label className="text-xs font-mono uppercase tracking-widest">Question</label>
              <div className="mt-1 border-2 border-ink rounded-xl bg-background">
                {/* Toolbar */}
                <div className="flex items-center gap-1 border-b-2 border-ink p-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => wrapSelection(textareaRef, "**", "**", setText)}
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-accent"
                    title="Bold — wraps selection in **...**"
                  >
                    <Bold className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => wrapSelection(textareaRef, "*", "*", setText)}
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-accent"
                    title="Italic — wraps selection in *...*"
                  >
                    <Italic className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => wrapSelection(textareaRef, "`", "`", setText)}
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-accent"
                    title="Code — wraps selection in `...`"
                  >
                    <Code className="w-4 h-4" />
                  </button>
                  <div className="w-px h-5 bg-ink/20 mx-1" />
                  <button
                    type="button"
                    onClick={() => { setShowSymbols((v) => !v); setOptionSymbolTarget(null); }}
                    className={`px-2.5 h-8 inline-flex items-center gap-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors ${
                      showSymbols ? "bg-lime border-ink" : "border-transparent hover:bg-accent"
                    }`}
                  >
                    Ω Math
                  </button>
                  <div className="w-px h-5 bg-ink/20 mx-1" />
                  <button
                    type="button"
                    onClick={() => imgInputRef.current?.click()}
                    disabled={uploadingImg}
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-accent disabled:opacity-50"
                    title="Add image to question"
                  >
                    {uploadingImg ? <span className="text-[10px] font-mono">…</span> : <Image className="w-4 h-4" />}
                  </button>
                  <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>

                {/* Symbol panel for question */}
                {showSymbols && (
                  <div className="border-b-2 border-ink p-3 bg-secondary/40">
                    <SymbolPanel onInsert={(sym) => insertAtTextarea(textareaRef, sym, setText)} />
                  </div>
                )}

                {/* Question image preview */}
                {imageUrl && (
                  <div className="relative border-b-2 border-ink p-3 bg-secondary/20">
                    <img src={imageUrl} alt="Question image" className="max-h-48 rounded-lg object-contain border border-ink/20" />
                    <button
                      type="button"
                      onClick={() => setImageUrl(null)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-card border-2 border-ink flex items-center justify-center hover:bg-pink hover:text-white transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <textarea
                  ref={textareaRef}
                  required
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full bg-transparent px-3 py-2 outline-none resize-none"
                  placeholder="Type your question… use **bold**, *italic*, `code`, or Ω Math for symbols"
                />
              </div>

              {/* Formatting preview */}
              {text && (
                <div className="mt-2 px-3 py-2 rounded-xl border border-ink/20 bg-secondary/20 text-sm">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">Preview</span>
                  <span dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
                </div>
              )}

              {!imageUrl && (
                <button
                  type="button"
                  onClick={() => imgInputRef.current?.click()}
                  disabled={uploadingImg}
                  className="mt-2 flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingImg ? "Uploading image…" : "Attach an image to this question (optional)"}
                </button>
              )}
            </Card>

            {/* MCQ Options */}
            {type === "MCQ" && (
              <Card>
                <label className="text-xs font-mono uppercase tracking-widest">Options</label>
                <div className="mt-2 space-y-3">
                  {(["A", "B", "C", "D"] as const).map((k, i) => (
                    <div key={k}>
                      {/* Option input row */}
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="correct"
                          checked={correct === i}
                          onChange={() => setCorrect(i as 0 | 1 | 2 | 3)}
                          className="w-4 h-4 accent-lime shrink-0"
                        />
                        <span className="font-mono text-xs w-5 font-bold shrink-0">{k}</span>
                        <input
                          ref={(el) => { optionRefs.current[i] = el; }}
                          required
                          value={options[i]}
                          onChange={(e) => {
                            const next = [...options] as [string, string, string, string];
                            next[i] = e.target.value;
                            setOptions(next);
                          }}
                          placeholder={`Option ${k}`}
                          className="flex-1 border-2 border-ink rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-lime min-w-0"
                        />
                        {/* Ω for this option */}
                        <button
                          type="button"
                          onClick={() => { setOptionSymbolTarget(optionSymbolTarget === i ? null : i); setShowSymbols(false); }}
                          className={`px-2 h-9 rounded-lg border-2 text-xs font-mono font-semibold transition-colors shrink-0 ${
                            optionSymbolTarget === i ? "bg-lime border-ink" : "border-ink bg-card hover:bg-accent"
                          }`}
                          title="Math symbols for this option"
                        >
                          Ω
                        </button>
                        {/* Image for this option */}
                        <label
                          className={`w-9 h-9 inline-flex items-center justify-center rounded-lg border-2 border-ink bg-card hover:bg-accent shrink-0 cursor-pointer ${uploadingOptionImg === i ? "opacity-50 pointer-events-none" : ""}`}
                          title="Add image to this option"
                        >
                          {uploadingOptionImg === i ? <span className="text-[10px] font-mono">…</span> : <Image className="w-4 h-4" />}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingOptionImg !== null}
                            onChange={(e) => handleOptionImageUpload(i, e)}
                          />
                        </label>
                        {/* Remove option image */}
                        {optionImages[i] && (
                          <button
                            type="button"
                            onClick={() => removeOptionImage(i)}
                            className="w-7 h-7 rounded-full bg-card border-2 border-ink flex items-center justify-center hover:bg-pink hover:text-white shrink-0"
                            title="Remove image"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Per-option symbol picker */}
                      {optionSymbolTarget === i && (
                        <div className="mt-1 ml-11">
                          <SymbolPanel onInsert={(sym) => insertAtOption(i, sym)} />
                        </div>
                      )}

                      {/* Option image preview */}
                      {optionImages[i] && (
                        <div className="mt-1 ml-11">
                          <img
                            src={optionImages[i]!}
                            alt={`Option ${k} image`}
                            className="max-h-32 rounded-lg border border-ink/20 object-contain"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    Select the radio button next to the correct answer
                  </p>
                </div>
              </Card>
            )}

            {/* True / False */}
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

            {/* Essay */}
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
