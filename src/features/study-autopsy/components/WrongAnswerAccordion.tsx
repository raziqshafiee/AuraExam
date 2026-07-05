// src/features/study-autopsy/components/WrongAnswerAccordion.tsx
//
// One accordion item per wrong MCQ/TF answer: question text, the options
// (highlighting the student's wrong pick vs. the correct one — same visual
// language as the existing exam result page), and the AI explanation panel.

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { renderMarkdown } from "@/lib/render-text";
import { XCircle, CheckCircle } from "lucide-react";
import { ExplanationPanel } from "./ExplanationPanel";
import type { QuestionState } from "../use-explanations";

const LETTERS = ["A", "B", "C", "D"];

export function WrongAnswerAccordion({
  questions,
  onGenerate,
}: {
  questions: QuestionState[];
  onGenerate: (questionId: string) => void;
}) {
  if (questions.length === 0) return null;

  return (
    <Accordion type="multiple" className="rounded-3xl border-2 border-ink bg-card shadow-brut px-5">
      {questions.map((q, i) => (
        <AccordionItem key={q.questionId} value={q.questionId} className="border-ink/15">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-start gap-3 text-left pr-4">
              <span className="shrink-0 w-7 h-7 rounded-full border-2 border-ink bg-secondary flex items-center justify-center text-xs font-mono font-bold">
                {i + 1}
              </span>
              <span
                className="text-sm leading-relaxed pt-0.5"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(q.text) }}
              />
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="pl-10 space-y-3">
              {q.imageUrl && (
                <img src={q.imageUrl} alt="Question image" className="rounded-lg border border-ink/20 max-h-40 object-contain" />
              )}

              {q.type === "MCQ" && (
                <div className="grid gap-2">
                  {q.options.map((opt, idx) => {
                    const letter = LETTERS[idx];
                    const isChosen = letter === q.studentAnswer;
                    const isCorrect = q.correctAnswer.startsWith(`${letter}.`);
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm ${
                          isCorrect
                            ? "border-lime bg-lime/20 font-semibold"
                            : isChosen
                              ? "border-pink bg-pink/10 font-semibold"
                              : "border-ink/20 bg-secondary"
                        }`}
                      >
                        {isCorrect ? (
                          <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                        ) : isChosen ? (
                          <XCircle className="w-4 h-4 text-pink shrink-0" />
                        ) : (
                          <span className="w-4 h-4 shrink-0" />
                        )}
                        <span className="font-mono text-xs mr-1 shrink-0">{letter}.</span>
                        <span dangerouslySetInnerHTML={{ __html: renderMarkdown(opt) }} />
                      </div>
                    );
                  })}
                </div>
              )}

              {q.type === "TF" && (
                <div className="flex gap-3">
                  {["True", "False"].map((val) => {
                    const isChosen = q.studentAnswer === val;
                    const isCorrect = q.correctAnswer === val;
                    return (
                      <div
                        key={val}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm ${
                          isCorrect
                            ? "border-lime bg-lime/20 font-semibold"
                            : isChosen
                              ? "border-pink bg-pink/10 font-semibold"
                              : "border-ink/20 bg-secondary"
                        }`}
                      >
                        {isCorrect && <CheckCircle className="w-4 h-4 text-green-600" />}
                        {isChosen && !isCorrect && <XCircle className="w-4 h-4 text-pink" />}
                        {val}
                      </div>
                    );
                  })}
                </div>
              )}

              <ExplanationPanel question={q} onGenerate={onGenerate} />
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
