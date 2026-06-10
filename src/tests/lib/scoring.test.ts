/**
 * Tests for the exam scoring logic extracted from submitExam in exams.ts.
 *
 * The scoring algorithm is the heart of the grading system — errors here
 * directly corrupt student grades. These tests are pure (no DB calls).
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Extracted scoring logic (mirrors submitExam in exams.ts exactly)
// ---------------------------------------------------------------------------
type QuestionType = "MCQ" | "TF" | "ESSAY";

interface Question {
  id: string;
  type: QuestionType;
  points: number;
  meta: Record<string, any> | null;
}

interface AnswerInsert {
  submission_id: string;
  question_id: string;
  answer: string;
  score: number | null;
}

function scoreSubmission(
  questions: Question[],
  answers: Record<string, string>,
  submissionId: string
): { score: number; inserts: AnswerInsert[] } {
  const LETTER_MAP: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  let score = 0;
  const inserts: AnswerInsert[] = [];

  for (const q of questions) {
    const studentAnswer = answers[q.id] ?? "";

    if (q.type === "MCQ") {
      const studentIdx = LETTER_MAP[studentAnswer];
      const pts =
        studentIdx !== undefined && studentIdx === q.meta?.correct
          ? (q.points ?? 1)
          : 0;
      if (studentIdx !== undefined) score += pts;
      if (studentIdx !== undefined) {
        inserts.push({ submission_id: submissionId, question_id: q.id, answer: studentAnswer, score: pts });
      }
    } else if (q.type === "TF") {
      const studentBool = studentAnswer === "True";
      const pts =
        studentAnswer !== "" && studentBool === q.meta?.correct
          ? (q.points ?? 1)
          : 0;
      if (studentAnswer !== "") score += pts;
      if (studentAnswer) {
        inserts.push({ submission_id: submissionId, question_id: q.id, answer: studentAnswer, score: pts });
      }
    } else if (q.type === "ESSAY") {
      if (studentAnswer.trim()) {
        const truncated = studentAnswer.slice(0, 5000);
        inserts.push({ submission_id: submissionId, question_id: q.id, answer: truncated, score: null });
      }
    }
  }

  return { score, inserts };
}

// ---------------------------------------------------------------------------
// MCQ scoring
// ---------------------------------------------------------------------------
describe("MCQ scoring", () => {
  const q: Question = { id: "q1", type: "MCQ", points: 2, meta: { correct: 1 } }; // correct = B

  it("awards full points for the correct answer", () => {
    const { score, inserts } = scoreSubmission([q], { q1: "B" }, "sub1");
    expect(score).toBe(2);
    expect(inserts[0].score).toBe(2);
    expect(inserts[0].answer).toBe("B");
  });

  it("awards zero for a wrong answer", () => {
    const { score, inserts } = scoreSubmission([q], { q1: "A" }, "sub1");
    expect(score).toBe(0);
    expect(inserts[0].score).toBe(0);
  });

  it("does not add to score when question is unanswered", () => {
    const { score, inserts } = scoreSubmission([q], {}, "sub1");
    expect(score).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("does not insert a row for an empty string answer", () => {
    const { inserts } = scoreSubmission([q], { q1: "" }, "sub1");
    expect(inserts).toHaveLength(0);
  });

  it("handles correct answer at index 0 (A) — tests the falsy-index edge case", () => {
    const qA: Question = { id: "q2", type: "MCQ", points: 3, meta: { correct: 0 } };
    const { score, inserts } = scoreSubmission([qA], { q2: "A" }, "sub1");
    expect(score).toBe(3);
    expect(inserts[0].score).toBe(3);
  });

  it("gives zero for wrong answer when correct is A (index 0)", () => {
    const qA: Question = { id: "q2", type: "MCQ", points: 3, meta: { correct: 0 } };
    const { score } = scoreSubmission([qA], { q2: "B" }, "sub1");
    expect(score).toBe(0);
  });

  it("handles correct answer at index 3 (D)", () => {
    const qD: Question = { id: "q3", type: "MCQ", points: 1, meta: { correct: 3 } };
    const { score } = scoreSubmission([qD], { q3: "D" }, "sub1");
    expect(score).toBe(1);
  });

  it("ignores an invalid letter like 'E' — not inserted or scored", () => {
    const { score, inserts } = scoreSubmission([q], { q1: "E" }, "sub1");
    expect(score).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("accumulates points across multiple correct MCQ answers", () => {
    const q2: Question = { id: "q2", type: "MCQ", points: 3, meta: { correct: 2 } }; // C
    const { score } = scoreSubmission([q, q2], { q1: "B", q2: "C" }, "sub1");
    expect(score).toBe(5);
  });

  it("partial credit: one correct, one wrong", () => {
    const q2: Question = { id: "q2", type: "MCQ", points: 3, meta: { correct: 2 } };
    const { score } = scoreSubmission([q, q2], { q1: "B", q2: "A" }, "sub1");
    expect(score).toBe(2);
  });

  it("falls back to 1 point when question.points is not set", () => {
    const noPoints: Question = { id: "q5", type: "MCQ", points: undefined as any, meta: { correct: 0 } };
    const { score } = scoreSubmission([noPoints], { q5: "A" }, "sub1");
    expect(score).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TF scoring
// ---------------------------------------------------------------------------
describe("TF scoring", () => {
  const qTrue: Question  = { id: "t1", type: "TF", points: 1, meta: { correct: true } };
  const qFalse: Question = { id: "t2", type: "TF", points: 2, meta: { correct: false } };

  it("awards points when student answers True and correct is true", () => {
    const { score, inserts } = scoreSubmission([qTrue], { t1: "True" }, "sub1");
    expect(score).toBe(1);
    expect(inserts[0].score).toBe(1);
  });

  it("awards points when student answers False and correct is false", () => {
    const { score } = scoreSubmission([qFalse], { t2: "False" }, "sub1");
    expect(score).toBe(2);
  });

  it("gives zero when student answers False but correct is true", () => {
    const { score } = scoreSubmission([qTrue], { t1: "False" }, "sub1");
    expect(score).toBe(0);
  });

  it("gives zero when student answers True but correct is false", () => {
    const { score } = scoreSubmission([qFalse], { t2: "True" }, "sub1");
    expect(score).toBe(0);
  });

  it("does not score an unanswered TF question", () => {
    const { score, inserts } = scoreSubmission([qTrue], {}, "sub1");
    expect(score).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("accumulates TF + MCQ scores correctly", () => {
    const mcq: Question = { id: "m1", type: "MCQ", points: 3, meta: { correct: 0 } };
    const { score } = scoreSubmission([qTrue, mcq], { t1: "True", m1: "A" }, "sub1");
    expect(score).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// ESSAY handling
// ---------------------------------------------------------------------------
describe("ESSAY answer handling", () => {
  const q: Question = { id: "e1", type: "ESSAY", points: 10, meta: null };

  it("never adds to auto_score (score is always null)", () => {
    const { score, inserts } = scoreSubmission([q], { e1: "My answer" }, "sub1");
    expect(score).toBe(0);
    expect(inserts[0].score).toBeNull();
  });

  it("inserts the answer text", () => {
    const { inserts } = scoreSubmission([q], { e1: "Some text" }, "sub1");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].answer).toBe("Some text");
  });

  it("does not insert for a blank answer", () => {
    const { inserts } = scoreSubmission([q], { e1: "" }, "sub1");
    expect(inserts).toHaveLength(0);
  });

  it("does not insert for a whitespace-only answer", () => {
    const { inserts } = scoreSubmission([q], { e1: "   " }, "sub1");
    expect(inserts).toHaveLength(0);
  });

  it("truncates answers longer than 5000 characters", () => {
    const long = "x".repeat(6000);
    const { inserts } = scoreSubmission([q], { e1: long }, "sub1");
    expect(inserts[0].answer.length).toBe(5000);
  });

  it("does not truncate answers of exactly 5000 characters", () => {
    const exact = "x".repeat(5000);
    const { inserts } = scoreSubmission([q], { e1: exact }, "sub1");
    expect(inserts[0].answer.length).toBe(5000);
  });

  it("does not truncate short answers", () => {
    const { inserts } = scoreSubmission([q], { e1: "short" }, "sub1");
    expect(inserts[0].answer.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Mixed question sets
// ---------------------------------------------------------------------------
describe("Mixed question scoring", () => {
  const mcq: Question   = { id: "m1", type: "MCQ",   points: 2, meta: { correct: 1 } };
  const tf: Question    = { id: "t1", type: "TF",    points: 1, meta: { correct: true } };
  const essay: Question = { id: "e1", type: "ESSAY", points: 5, meta: null };

  it("auto_score is only MCQ + TF; essay is unscored", () => {
    const { score, inserts } = scoreSubmission(
      [mcq, tf, essay],
      { m1: "B", t1: "True", e1: "My essay" },
      "sub1"
    );
    expect(score).toBe(3); // 2 + 1
    expect(inserts.find((i) => i.question_id === "e1")?.score).toBeNull();
  });

  it("all unanswered returns score 0 and no inserts", () => {
    const { score, inserts } = scoreSubmission([mcq, tf, essay], {}, "sub1");
    expect(score).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("sets the correct submission_id on every insert", () => {
    const { inserts } = scoreSubmission(
      [mcq, tf, essay],
      { m1: "B", t1: "True", e1: "text" },
      "submission-abc-123"
    );
    expect(inserts.every((i) => i.submission_id === "submission-abc-123")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integrity flag whitelist
// ---------------------------------------------------------------------------
describe("Hard flag type whitelist", () => {
  const HARD_FLAG_TYPES = new Set([
    "tab-switch", "copy", "paste", "fullscreen-exit",
    "multiple-faces", "screenshot", "right-click",
  ]);

  const ADVISORY_TYPES = ["face-missing", "camera-lost", "gaze-away", "head-turned"];

  it("contains all 7 expected hard flag types", () => {
    expect(HARD_FLAG_TYPES.size).toBe(7);
    for (const t of ["tab-switch","copy","paste","fullscreen-exit","multiple-faces","screenshot","right-click"]) {
      expect(HARD_FLAG_TYPES.has(t)).toBe(true);
    }
  });

  it("does NOT contain any advisory types", () => {
    for (const t of ADVISORY_TYPES) {
      expect(HARD_FLAG_TYPES.has(t)).toBe(false);
    }
  });

  it("does NOT contain time-window (late submission flag)", () => {
    expect(HARD_FLAG_TYPES.has("time-window")).toBe(false);
  });

  it("only hard types increment the flag counter", () => {
    const inc = (type: string, flags: number) =>
      HARD_FLAG_TYPES.has(type) ? flags + 1 : flags;

    expect(inc("tab-switch", 0)).toBe(1);
    expect(inc("face-missing", 0)).toBe(0);
    expect(inc("multiple-faces", 2)).toBe(3);
    expect(inc("gaze-away", 2)).toBe(2);
  });

  it("auto-submit triggers at exactly 3 hard flags", () => {
    const shouldAutoSubmit = (flags: number) => flags >= 3;
    expect(shouldAutoSubmit(2)).toBe(false);
    expect(shouldAutoSubmit(3)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Exam lifecycle state machine
// ---------------------------------------------------------------------------
describe("Exam lifecycle state machine", () => {
  type ExamStatus = "draft" | "upcoming" | "live" | "closed" | "graded";
  const LOCKED: ExamStatus[] = ["live", "closed", "graded"];

  const canEdit = (s: ExamStatus) => !LOCKED.includes(s);
  const canDelete = (s: ExamStatus, subs: number) => !LOCKED.includes(s) && subs === 0;
  const allowedFields = (s: ExamStatus) =>
    LOCKED.includes(s) ? [] :
    s === "upcoming" ? ["title", "require_camera"] :
    ["title", "class_id", "start_time", "end_time", "duration", "require_camera", "status", "questions"];

  it("draft can be edited with all fields", () => {
    expect(canEdit("draft")).toBe(true);
    expect(allowedFields("draft")).toContain("class_id");
    expect(allowedFields("draft")).toContain("questions");
  });

  it("upcoming can be edited (title + camera only)", () => {
    expect(canEdit("upcoming")).toBe(true);
    expect(allowedFields("upcoming")).toEqual(["title", "require_camera"]);
  });

  it("live/closed/graded cannot be edited", () => {
    for (const s of ["live", "closed", "graded"] as ExamStatus[]) {
      expect(canEdit(s)).toBe(false);
      expect(allowedFields(s)).toEqual([]);
    }
  });

  it("draft with no submissions can be deleted", () => {
    expect(canDelete("draft", 0)).toBe(true);
  });

  it("draft with submissions cannot be deleted", () => {
    expect(canDelete("draft", 1)).toBe(false);
  });

  it("live exam cannot be deleted even with no submissions", () => {
    expect(canDelete("live", 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Appeal window validation
// ---------------------------------------------------------------------------
describe("Appeal window (7 days)", () => {
  const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const withinWindow = (submittedAt: Date, now = new Date()) =>
    now.getTime() - submittedAt.getTime() <= WINDOW_MS;

  it("allows appeal immediately after submission", () => {
    expect(withinWindow(new Date())).toBe(true);
  });

  it("allows appeal 6 days after submission", () => {
    expect(withinWindow(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))).toBe(true);
  });

  it("allows appeal exactly 7 days after submission", () => {
    expect(withinWindow(new Date(Date.now() - WINDOW_MS))).toBe(true);
  });

  it("denies appeal after 7 days", () => {
    expect(withinWindow(new Date(Date.now() - (WINDOW_MS + 1)))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Essay grading — final score calculation
// ---------------------------------------------------------------------------
describe("Essay grading — score promotion", () => {
  interface Essay { score: number | null }

  function computeScore(autoScore: number, essays: Essay[]) {
    const allGraded = essays.length > 0 && essays.every((e) => e.score !== null);
    const essaySum = essays.reduce((sum, e) => sum + (e.score ?? 0), 0);
    return { newScore: autoScore + essaySum, allGraded };
  }

  it("returns auto_score only when no essays exist", () => {
    expect(computeScore(8, []).newScore).toBe(8);
    expect(computeScore(8, []).allGraded).toBe(false);
  });

  it("adds essay scores to auto_score", () => {
    expect(computeScore(5, [{ score: 7 }, { score: 3 }]).newScore).toBe(15);
  });

  it("is not allGraded when any essay is null", () => {
    expect(computeScore(0, [{ score: 7 }, { score: null }]).allGraded).toBe(false);
  });

  it("is allGraded only when every essay has a score", () => {
    expect(computeScore(0, [{ score: 7 }, { score: 3 }]).allGraded).toBe(true);
  });

  it("treats null essay scores as 0 in running total", () => {
    expect(computeScore(2, [{ score: 4 }, { score: null }]).newScore).toBe(6);
  });

  it("treats score=0 as a valid graded value (not null)", () => {
    const { allGraded, newScore } = computeScore(5, [{ score: 0 }]);
    expect(allGraded).toBe(true);
    expect(newScore).toBe(5);
  });
});
