// Centralized mock data for all screens.

export type ClassRow = {
  id: string;
  code: string;
  name: string;
  lecturer: string;
  students: number;
  color: "lime" | "pink" | "violet" | "sky" | "amber";
};

export const classes: ClassRow[] = [
  { id: "c1", code: "CS201", name: "Data Structures & Algorithms", lecturer: "Dr. Faiz Rahman", students: 42, color: "lime" },
  { id: "c2", code: "CS305", name: "Database Systems", lecturer: "Dr. Faiz Rahman", students: 36, color: "pink" },
  { id: "c3", code: "MA210", name: "Discrete Mathematics", lecturer: "Dr. Lim Wei", students: 28, color: "violet" },
  { id: "c4", code: "CS410", name: "Operating Systems", lecturer: "Dr. Faiz Rahman", students: 31, color: "sky" },
];

export type ExamRow = {
  id: string;
  title: string;
  classId: string;
  classCode: string;
  startTime: string; // ISO — exam window opens
  endTime: string;   // ISO — exam window closes
  duration: number;  // minutes
  questions: number;
  status: "upcoming" | "live" | "graded" | "draft";
  score?: number;
  total?: number;
};

export const exams: ExamRow[] = [
  { id: "e1", title: "Midterm — Trees & Graphs", classId: "c1", classCode: "CS201", startTime: "2026-06-04T09:00:00+08:00", endTime: "2026-06-04T10:30:00+08:00", duration: 90, questions: 20, status: "upcoming" },
  { id: "e2", title: "Quiz 3 — Indexes", classId: "c2", classCode: "CS305", startTime: "2026-05-28T14:00:00+08:00", endTime: "2026-05-28T14:30:00+08:00", duration: 30, questions: 10, status: "upcoming" },
  { id: "e3", title: "Quiz 1 — Big-O", classId: "c1", classCode: "CS201", startTime: "2026-04-12T09:00:00+08:00", endTime: "2026-04-12T09:30:00+08:00", duration: 30, questions: 15, status: "graded", score: 13, total: 15 },
  { id: "e4", title: "Quiz 2 — Sorting", classId: "c1", classCode: "CS201", startTime: "2026-04-26T09:00:00+08:00", endTime: "2026-04-26T09:30:00+08:00", duration: 30, questions: 12, status: "graded", score: 10, total: 12 },
  { id: "e5", title: "Final — Full Syllabus", classId: "c3", classCode: "MA210", startTime: "2026-06-18T09:00:00+08:00", endTime: "2026-06-18T11:00:00+08:00", duration: 120, questions: 30, status: "draft" },
  { id: "e6", title: "Quiz 4 — Hash Tables", classId: "c1", classCode: "CS201", startTime: "2026-05-22T10:00:00+08:00", endTime: "2026-05-22T10:30:00+08:00", duration: 30, questions: 12, status: "graded", score: 0, total: 12 },
];

export type QuestionType = "MCQ" | "TF" | "ESSAY";
export type Question = {
  id: string;
  type: QuestionType;
  text: string;
  classCode: string;
  difficulty: "easy" | "med" | "hard";
  points: number;
  tags: string[];
  version: number;
};

export const questions: Question[] = [
  { id: "q1", type: "MCQ", text: "Which traversal visits the root last?", classCode: "CS201", difficulty: "easy", points: 2, tags: ["trees"], version: 3 },
  { id: "q2", type: "MCQ", text: "Time complexity of binary search?", classCode: "CS201", difficulty: "easy", points: 1, tags: ["bigO"], version: 1 },
  { id: "q3", type: "TF", text: "A B-tree always has balanced height.", classCode: "CS305", difficulty: "med", points: 2, tags: ["indexes"], version: 2 },
  { id: "q4", type: "ESSAY", text: "Explain ACID properties with examples.", classCode: "CS305", difficulty: "hard", points: 10, tags: ["transactions"], version: 1 },
  { id: "q5", type: "MCQ", text: "Which sort is stable?", classCode: "CS201", difficulty: "med", points: 2, tags: ["sorting"], version: 1 },
  { id: "q6", type: "TF", text: "Hash table lookup is O(1) worst-case.", classCode: "CS201", difficulty: "med", points: 1, tags: ["hashing"], version: 4 },
  { id: "q7", type: "ESSAY", text: "Compare BFS and DFS, with use cases.", classCode: "CS201", difficulty: "hard", points: 8, tags: ["graphs"], version: 2 },
];

export type FlagReason = {
  time: string;
  type: "tab-switch" | "face-not-visible" | "multiple-faces" | "phone-detected" | "copy-paste";
  label: string;
};

export type Submission = {
  id: string;
  examId: string;
  student: string;
  studentId: string;
  status: "in-progress" | "submitted" | "graded" | "flagged";
  score?: number;
  total: number;
  flags: number;
  flagReasons: FlagReason[];
  appealRequired: boolean;
  submittedAt?: string;
  essayAnswers?: Record<string, string>;
};

export const submissions: Submission[] = [
  {
    id: "s1", examId: "e1", student: "Aisha Tan", studentId: "u-stu-1",
    status: "submitted", total: 20, flags: 0, flagReasons: [], appealRequired: false,
    submittedAt: "2026-06-04T10:14:00+08:00",
    essayAnswers: { q7: "BFS uses a queue and explores level by level — ideal for shortest path in unweighted graphs. DFS uses a stack and goes as deep as possible before backtracking — better for cycle detection and topological sort." },
  },
  {
    id: "s2", examId: "e1", student: "Hafiz Daud", studentId: "u-stu-2",
    status: "in-progress", total: 20, flags: 2, flagReasons: [
      { time: "09:14", type: "tab-switch", label: "Tab / window switch" },
      { time: "09:31", type: "face-not-visible", label: "Face not visible" },
    ], appealRequired: false,
  },
  {
    id: "s3", examId: "e1", student: "Priya Suresh", studentId: "u-stu-3",
    status: "submitted", total: 20, flags: 0, flagReasons: [], appealRequired: false,
    submittedAt: "2026-06-04T10:28:00+08:00",
    essayAnswers: { q7: "BFS explores all neighbors before going deeper using a queue, making it optimal for shortest-path problems. DFS uses a stack and explores as deep as possible first, making it better for maze solving, cycle detection, and topological sorting." },
  },
  {
    id: "s4", examId: "e1", student: "Wei Jian", studentId: "u-stu-4",
    status: "flagged", total: 20, flags: 5, flagReasons: [
      { time: "09:08", type: "tab-switch", label: "Tab / window switch" },
      { time: "09:12", type: "multiple-faces", label: "Multiple faces detected" },
      { time: "09:22", type: "copy-paste", label: "Copy-paste attempt" },
      { time: "09:35", type: "phone-detected", label: "Phone detected in frame" },
      { time: "09:41", type: "tab-switch", label: "Tab / window switch" },
    ], appealRequired: true,
    submittedAt: "2026-06-04T09:41:00+08:00",
    essayAnswers: { q7: "BFS and DFS are both graph traversal algorithms with different approaches..." },
  },
  {
    id: "s5", examId: "e6", student: "Aisha Tan", studentId: "u-stu-1",
    status: "flagged", total: 12, flags: 4, flagReasons: [
      { time: "10:08", type: "tab-switch", label: "Tab / window switch" },
      { time: "10:15", type: "face-not-visible", label: "Face not visible" },
      { time: "10:22", type: "multiple-faces", label: "Multiple faces detected" },
      { time: "10:29", type: "copy-paste", label: "Copy-paste attempt" },
    ], appealRequired: true,
    submittedAt: "2026-05-22T10:29:00+08:00",
  },
];

export type Announcement = {
  id: string;
  classId: string;
  author: string;
  date: string;
  title: string;
  body: string;
};

export const announcements: Announcement[] = [
  { id: "a1", classId: "c1", author: "Dr. Faiz", date: "2026-05-20", title: "Midterm scope released", body: "Chapters 1–6. Focus on traversals and graph basics." },
  { id: "a2", classId: "c1", author: "Dr. Faiz", date: "2026-05-15", title: "Lab moved to LR-204", body: "This Thursday's lab is in LR-204, not the usual room." },
  { id: "a3", classId: "c2", author: "Dr. Faiz", date: "2026-05-22", title: "Quiz 3 reminder", body: "Quiz 3 covers indexing strategies. Practice problems posted." },
];

export type NoteFile = {
  id: string;
  classId: string;
  title: string;
  description: string;
  fileType: "pdf" | "image" | "file";
  fileName: string;
  uploadedAt: string;
  author: string;
};

export const classNotes: NoteFile[] = [
  { id: "cn1", classId: "c1", title: "Week 5 Lecture Slides", description: "Trees, heaps, and priority queues overview.", fileType: "pdf", fileName: "week5-trees.pdf", uploadedAt: "2026-05-19", author: "Dr. Faiz" },
  { id: "cn2", classId: "c1", title: "Graph Algorithm Cheat Sheet", description: "BFS, DFS, Dijkstra quick reference card.", fileType: "image", fileName: "graphs-cheatsheet.png", uploadedAt: "2026-05-22", author: "Dr. Faiz" },
  { id: "cn3", classId: "c2", title: "Quiz 3 Practice Problems", description: "20 indexing problems with full solutions.", fileType: "pdf", fileName: "quiz3-practice.pdf", uploadedAt: "2026-05-21", author: "Dr. Faiz" },
];

export type StudentSubmission = {
  id: string;
  classId: string;
  student: string;
  studentId: string;
  title: string;
  fileName: string;
  fileType: "pdf" | "image" | "file";
  submittedAt: string;
  status: "submitted" | "reviewed";
};

export const studentSubmissions: StudentSubmission[] = [
  { id: "ss1", classId: "c1", student: "Aisha Tan", studentId: "u-stu-1", title: "Assignment 2 — BST Implementation", fileName: "bst-aisha.pdf", fileType: "pdf", submittedAt: "2026-05-20", status: "reviewed" },
];

export type Appeal = {
  id: string;
  examTitle: string;
  questionRef: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  date: string;
  type: "score" | "integrity";
};

export const appeals: Appeal[] = [
  { id: "ap1", examTitle: "Quiz 1 — Big-O", questionRef: "Q7", status: "pending", reason: "I believe the accepted answer treats average vs worst-case ambiguously.", date: "2026-04-14", type: "score" },
  { id: "ap2", examTitle: "Quiz 2 — Sorting", questionRef: "Q3", status: "approved", reason: "Insertion sort is stable — accepted both B and C.", date: "2026-04-28", type: "score" },
  { id: "ap3", examTitle: "Quiz 4 — Hash Tables", questionRef: "Integrity flags", status: "pending", reason: "The tab-switch was caused by my external monitor disconnecting. The face-not-visible flag occurred when I looked at my notepad. I did not cheat.", date: "2026-05-23", type: "integrity" },
];

export type Notif = {
  id: string;
  kind: "exam" | "grade" | "appeal" | "system" | "integrity";
  title: string;
  body: string;
  date: string;
  read: boolean;
};

export const notifications: Notif[] = [
  { id: "n1", kind: "exam", title: "Midterm starts in 3 days", body: "CS201 Midterm — Trees & Graphs · Jun 4, 9:00 AM", date: "2026-06-01T08:00:00+08:00", read: false },
  { id: "n2", kind: "grade", title: "Quiz 2 graded", body: "You scored 10 / 12 in CS201 Quiz 2.", date: "2026-04-27T16:00:00+08:00", read: false },
  { id: "n3", kind: "appeal", title: "Appeal approved", body: "Your appeal for Quiz 2 Q3 was approved.", date: "2026-04-29T11:00:00+08:00", read: true },
  { id: "n4", kind: "integrity", title: "Integrity flags — action required", body: "Quiz 4 was auto-submitted due to 4 integrity flags. Appeal within 7 days or your score will be 0.", date: "2026-05-22T10:30:00+08:00", read: false },
  { id: "n5", kind: "system", title: "Welcome to Aura", body: "Your account is ready.", date: "2026-04-01T08:00:00+08:00", read: true },
];

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "student" | "lecturer" | "admin";
  status: "active" | "banned" | "pending";
  joined: string;
};

export const adminUsers: AdminUser[] = [
  { id: "u-stu-1", name: "Aisha Tan", email: "aisha@student.aura.my", role: "student", status: "active", joined: "2026-01-12" },
  { id: "u-stu-2", name: "Hafiz Daud", email: "hafiz@student.aura.my", role: "student", status: "active", joined: "2026-01-12" },
  { id: "u-lec-1", name: "Dr. Faiz Rahman", email: "faiz@aura.my", role: "lecturer", status: "active", joined: "2025-09-01" },
  { id: "u-lec-2", name: "Dr. Maya Iskandar", email: "maya@aura.my", role: "lecturer", status: "pending", joined: "2026-05-20" },
  { id: "u-adm-1", name: "Mei Lin", email: "mei@aura.my", role: "admin", status: "active", joined: "2025-08-15" },
  { id: "u-stu-9", name: "Throwaway Test", email: "test@x.com", role: "student", status: "banned", joined: "2026-03-01" },
];

export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  target: string;
  date: string;
};

export const auditLog: AuditEvent[] = [
  { id: "l1", actor: "Mei Lin", action: "Approved lecturer", target: "Dr. Maya Iskandar", date: "2026-05-20T10:14:00+08:00" },
  { id: "l2", actor: "Dr. Faiz", action: "Published exam", target: "CS201 Midterm", date: "2026-05-18T15:00:00+08:00" },
  { id: "l3", actor: "Mei Lin", action: "Banned user", target: "Throwaway Test", date: "2026-03-02T09:30:00+08:00" },
  { id: "l4", actor: "Dr. Faiz", action: "Overrode score", target: "Quiz 1 / Aisha Tan", date: "2026-04-15T11:00:00+08:00" },
];

export function classById(id: string) {
  return classes.find((c) => c.id === id);
}
export function examById(id: string) {
  return exams.find((e) => e.id === id);
}
