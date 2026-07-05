// Shared types for the "Why Was I Wrong?" study module (ADD-ON feature).
// These describe data shapes returned by src/features/study-autopsy/server.ts
// and consumed by the /study and /study/autopsy/$attemptId routes.

export type WrongQuestion = {
  questionId: string;
  type: "MCQ" | "TF";
  text: string;
  points: number;
  options: string[];
  optionImages: (string | null)[];
  imageUrl: string | null;
  studentAnswer: string; // "A" | "B" | "C" | "D" for MCQ, "True" | "False" for TF
  correctAnswer: string; // human-readable, e.g. "B. Mitosis" or "False"
  fallbackTag: string; // from the existing questions.tags column, used before AI generation
  explanation: string | null; // cached AI explanation, if any
  conceptTag: string | null; // cached AI concept tag, if any
};

export type AutopsyAttempt = {
  exam: { id: string; title: string; classCode: string };
  attempt: { id: string; status: string; submittedAt: string | null; score: number; total: number };
  wrongQuestions: WrongQuestion[];
};

export type AutopsyListItem = {
  attemptId: string;
  examId: string;
  examTitle: string;
  classCode: string;
  submittedAt: string | null;
  wrongCount: number;
};

// Response shape returned by the study-explain edge function.
export type ExplainResponse = {
  id: string;
  correct_answer: string | null;
  explanation: string;
  concept_tag: string | null;
  created_at: string;
  cached: boolean;
};

export type ExplainErrorResponse = { error: string };
