import type { Role } from "@/lib/auth";

export type HelpEntry = {
  id: string;
  question: string;
  answer: string;
  roles: Role[];
  keywords?: string[];
};

export type HelpCategory = {
  id: string;
  title: string;
  roles: Role[];
  entries: HelpEntry[];
};

const ALL: Role[] = ["student", "lecturer", "admin"];

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    roles: ALL,
    entries: [
      {
        id: "login-issues",
        question: "I can't log in — what should I check?",
        answer:
          "Make sure you're using the email your class/account was registered with. If you just registered, check your inbox (and spam folder) for a confirmation step. If your account was banned by an admin, sign-in will be blocked — contact your lecturer or admin to ask about your account status.",
        roles: ALL,
        keywords: ["login", "sign in", "password", "banned", "account"],
      },
      {
        id: "role-home",
        question: "Why does the app look different from a friend's?",
        answer:
          "Aura has three roles — student, lecturer, and admin — and each gets its own dashboard, nav colour (sky for students, violet for lecturers, lime for admins), and permissions. You'll always land on the dashboard for your role after logging in.",
        roles: ALL,
        keywords: ["role", "dashboard", "colour", "color", "theme"],
      },
      {
        id: "sidebar-collapse",
        question: "How do I get more screen space?",
        answer:
          "Click the arrow icon at the top of the sidebar to collapse it to icons-only. Your preference is remembered on this device. On mobile, navigation moves to a bottom bar with a \"More\" button for anything that doesn't fit.",
        roles: ALL,
        keywords: ["sidebar", "collapse", "mobile", "navigation"],
      },
    ],
  },
  {
    id: "classes",
    title: "Classes",
    roles: ALL,
    entries: [
      {
        id: "student-join-class",
        question: "How do I join a class?",
        answer:
          "Classes are added by your lecturer or admin enrolling you — there's no self-service \"join with a code\" flow. If a class you expect to see isn't listed, ask your lecturer to confirm you've been enrolled.",
        roles: ["student"],
        keywords: ["join", "enroll", "enrol", "class code"],
      },
      {
        id: "lecturer-create-class",
        question: "How do I create a class?",
        answer:
          "From Classes, use the create action to name your class. You can then enrol students, post announcements and notes, and later attach exams and assignments to it from the class page.",
        roles: ["lecturer"],
        keywords: ["create class", "new class"],
      },
      {
        id: "lecturer-edit-archive-delete",
        question: "Can I edit, archive, or delete my class?",
        answer:
          "Yes — from your class page you can edit its details, archive it (hides it from active lists without deleting data), or delete it entirely. Deleting is permanent, so archiving is the safer choice if you just want it out of the way at term end.",
        roles: ["lecturer"],
        keywords: ["edit class", "archive class", "delete class"],
      },
      {
        id: "admin-delete-class",
        question: "What happens when I delete a class as admin?",
        answer:
          "Deleting a class is permanent and removes its enrolments. This action is written to the audit log under the 'class' category so there's a record of who deleted what and when.",
        roles: ["admin"],
        keywords: ["delete class", "audit log"],
      },
      {
        id: "class-notes-announcements",
        question: "What's the difference between class notes and announcements?",
        answer:
          "Announcements are broadcast messages lecturers post to a class — students get a notification for each one. Class notes are reference material (like a running notice board) attached to the class page for students to read at any time.",
        roles: ALL,
        keywords: ["notes", "announcements", "broadcast"],
      },
    ],
  },
  {
    id: "exams-student",
    title: "Taking an exam",
    roles: ["student"],
    entries: [
      {
        id: "exam-not-visible",
        question: "I can't see an exam I was told about.",
        answer:
          "Exams only appear once a lecturer publishes them (status moves from draft to upcoming), and only to students enrolled in that class. If it's still not showing near its scheduled time, check with your lecturer that it's been published and that you're enrolled in the right class.",
        roles: ["student"],
        keywords: ["exam missing", "not visible", "published"],
      },
      {
        id: "exam-lifecycle-student",
        question: "Why can't I start the exam yet / why is it locked?",
        answer:
          "An exam becomes \"live\" only once its scheduled start time is reached, and it closes automatically at its end time. If you're early, wait for the start time; if it's already closed, it can no longer be taken — raise an appeal if you believe there was a genuine issue.",
        roles: ["student"],
        keywords: ["locked", "start time", "live", "closed"],
      },
      {
        id: "camera-required",
        question: "The exam wants camera access — is that required?",
        answer:
          "If your lecturer enabled camera proctoring for the exam, the lobby will ask you to allow camera access before you can start. It's used for face verification and integrity monitoring during the attempt. Allow the browser permission prompt — without it you won't be able to begin.",
        roles: ["student"],
        keywords: ["camera", "permission", "webcam", "proctoring"],
      },
      {
        id: "fullscreen-exit-flag",
        question: "I got flagged for leaving fullscreen — what happened?",
        answer:
          "The exam enters fullscreen when you click \"Start exam\" in the lobby. Exiting fullscreen during the attempt (Esc, Alt+Tab out, etc.) counts as a hard integrity flag. So does switching tabs or copy-pasting. These are serious — 3 hard flags in one attempt auto-submits your exam as \"flagged.\" Stay in the exam tab, in fullscreen, until you submit.",
        roles: ["student"],
        keywords: ["fullscreen", "tab switch", "flag", "auto submit", "copy paste"],
      },
      {
        id: "three-flags-autosubmit",
        question: "My exam auto-submitted itself — why?",
        answer:
          "Hard integrity flags (tab-switching, copy-paste, exiting fullscreen, or the camera detecting multiple faces) count toward a 3-strike limit. On the 3rd hard flag, your attempt is automatically submitted with status \"flagged\" to protect exam integrity. If you believe this was a mistake (e.g. a genuine accidental click), you can file an integrity appeal within 7 days.",
        roles: ["student"],
        keywords: ["auto submit", "flagged", "three strikes", "integrity"],
      },
      {
        id: "advisory-flags",
        question: "I saw a warning about my face or gaze — does that count against me?",
        answer:
          "No. Warnings like \"face missing,\" \"camera lost,\" \"gaze away,\" or \"head turned\" are advisory only — they're logged for your lecturer to review later but do NOT count toward the 3-strike auto-submit. Only tab-switch, copy-paste, fullscreen-exit, and multiple-faces are hard flags.",
        roles: ["student"],
        keywords: ["gaze", "face missing", "camera lost", "advisory", "warning"],
      },
      {
        id: "multiple-faces",
        question: "It flagged \"multiple faces\" when someone briefly walked past.",
        answer:
          "There's an 8-second grace period specifically to avoid punishing brief walk-past false positives, and a 60-second cooldown between reports so a lingering issue isn't reported repeatedly. If it still triggered, someone else was likely in frame for longer than that grace window — keep your camera pointed only at yourself for the rest of the attempt.",
        roles: ["student"],
        keywords: ["multiple faces", "walk past", "false positive"],
      },
      {
        id: "answers-not-saving",
        question: "Are my answers saved as I go, or only at submit?",
        answer:
          "Your timer/attempt starts the moment you save your first answer, and answers save as you work through the exam — you don't need to wait until the end. If your connection drops, reconnect and continue; your progress up to the last save is kept.",
        roles: ["student"],
        keywords: ["save", "autosave", "progress", "disconnect"],
      },
      {
        id: "essay-grading-wait",
        question: "Why is my score incomplete after submitting?",
        answer:
          "Your MCQ/True-False score (auto_score) is calculated immediately and is final. If the exam includes essay questions, your final score isn't ready until a lecturer manually grades every essay — the submission only becomes \"graded\" once all essays have a score. You'll get a notification when grading is complete.",
        roles: ["student"],
        keywords: ["score", "essay", "grading", "incomplete", "pending"],
      },
    ],
  },
  {
    id: "exams-lecturer",
    title: "Building & running exams",
    roles: ["lecturer"],
    entries: [
      {
        id: "exam-lifecycle-lecturer",
        question: "What are the exam statuses and what can I still change?",
        answer:
          "Exams move draft → upcoming (published) → live (start time reached) → closed (end time reached) → graded (all essays scored). You can freely edit everything while in draft. Once published to upcoming, only the title and the require-camera setting can still change. Once live, closed, or graded, no edits or deletion are permitted at all — plan your questions and schedule carefully before publishing.",
        roles: ["lecturer"],
        keywords: ["status", "draft", "upcoming", "live", "closed", "graded", "edit"],
      },
      {
        id: "cant-edit-exam",
        question: "Why can't I edit my exam anymore?",
        answer:
          "Once an exam is live, closed, or graded, edits and deletion are locked entirely — this protects fairness for students already attempting or who have completed it. If you published too early by mistake and there are no submissions yet and the window hasn't opened, you can unpublish it back to draft to fix it.",
        roles: ["lecturer"],
        keywords: ["locked", "cannot edit", "unpublish"],
      },
      {
        id: "unpublish-exam",
        question: "Can I unpublish an exam after publishing it?",
        answer:
          "Yes, but only if it has zero submissions and its scheduled window hasn't opened yet. This reverts it to draft for full editing. If either condition fails (someone already started, or the start time has passed), it can no longer be unpublished.",
        roles: ["lecturer"],
        keywords: ["unpublish", "revert", "draft"],
      },
      {
        id: "publish-requirements",
        question: "Why won't my exam publish?",
        answer:
          "To move from draft to upcoming you need a title, an assigned class, a schedule (start/end time), and at least one question attached. Check the exam builder for anything left blank.",
        roles: ["lecturer"],
        keywords: ["publish", "requirements", "cant publish"],
      },
      {
        id: "grading-essays",
        question: "How do I grade essay answers?",
        answer:
          "Open the exam's Results page — essays with score: null are awaiting grading. A submission is only promoted to \"graded\" once every essay in it has a score, so partially-graded attempts stay in a pending state. Once you finish grading all essays across the exam, an audit log entry is written and students get notified.",
        roles: ["lecturer"],
        keywords: ["grade essay", "results", "score", "pending"],
      },
      {
        id: "monitor-page",
        question: "What does the Monitor page show during a live exam?",
        answer:
          "It's a live view of who's attempting the exam, their flag counts, and integrity events as they happen — useful for spotting a student approaching the 3-flag auto-submit threshold or a proctoring issue in real time.",
        roles: ["lecturer"],
        keywords: ["monitor", "live", "watch", "proctoring"],
      },
    ],
  },
  {
    id: "question-bank",
    title: "Question bank",
    roles: ["lecturer"],
    entries: [
      {
        id: "question-types",
        question: "What question types are supported?",
        answer:
          "Multiple choice (MCQ), True/False, and Essay. MCQ and True/False are auto-scored the moment a student submits; Essay questions always require manual grading afterwards.",
        roles: ["lecturer"],
        keywords: ["mcq", "true false", "essay", "question types"],
      },
      {
        id: "reuse-questions",
        question: "Can I reuse a question across multiple exams?",
        answer:
          "Yes — the Question Bank is a shared pool. Search or filter by type/tag/class to find existing questions and attach them to a new exam via the Exam Builder rather than recreating them.",
        roles: ["lecturer"],
        keywords: ["reuse", "search", "tags", "filter"],
      },
    ],
  },
  {
    id: "appeals",
    title: "Appeals",
    roles: ALL,
    entries: [
      {
        id: "appeal-types",
        question: "What kinds of appeals can I file?",
        answer:
          "Two types: a score appeal (you dispute the grade you received) or an integrity appeal (you dispute a flag or an auto-submit). Only one appeal is allowed per submission, so make sure you pick the right type and include full details the first time.",
        roles: ["student"],
        keywords: ["appeal type", "score dispute", "integrity dispute"],
      },
      {
        id: "appeal-window",
        question: "How long do I have to file an appeal?",
        answer:
          "7 days from the date of submission (or from when you were flagged). After that window closes, the appeal option is no longer available for that submission — so raise any concerns promptly.",
        roles: ["student"],
        keywords: ["deadline", "window", "7 days", "expired"],
      },
      {
        id: "appeal-outcomes",
        question: "What happens if my appeal is approved?",
        answer:
          "An approved integrity appeal moves your submission to \"retake-approved,\" letting you attempt the exam again. An approved score appeal has your lecturer supply a corrected score, which then replaces your submission's recorded score.",
        roles: ["student"],
        keywords: ["approved", "retake", "corrected score"],
      },
      {
        id: "lecturer-review-appeals",
        question: "How do I review and decide on a student's appeal?",
        answer:
          "Open Appeals from your nav — each pending appeal shows the submission, the student's reason, and (for integrity appeals) the flag history. Approve or reject; for a score appeal you approve, you'll be asked to enter the corrected score. Every decision is written to the audit log under the 'appeal' category.",
        roles: ["lecturer"],
        keywords: ["review appeal", "approve", "reject", "audit log"],
      },
    ],
  },
  {
    id: "face-id",
    title: "Face ID & proctoring",
    roles: ALL,
    entries: [
      {
        id: "student-register-face",
        question: "Do I need to register my face before an exam?",
        answer:
          "If a lecturer has enabled camera requirements, yes — go to Face ID in your nav to register a reference photo before your first proctored exam. This is what your live camera feed is checked against during check-in.",
        roles: ["student"],
        keywords: ["register face", "enroll", "reference photo"],
      },
      {
        id: "change-face-photo",
        question: "Can I update my registered photo?",
        answer:
          "Your Face ID page shows your current registered photo, when it was last updated, and whether you're currently eligible to change it. If eligible, you can submit a new one; if not, you'll see why (e.g. a recent change, or a pending review).",
        roles: ["student"],
        keywords: ["update photo", "change photo", "re-register"],
      },
      {
        id: "face-id-review",
        question: "What am I reviewing on the Face ID Review page?",
        answer:
          "It's the queue of student face-registration submissions (new registrations or change requests) awaiting approval, plus any flagged mismatches from exam check-ins. Review the submitted photo against context before approving or rejecting.",
        roles: ["lecturer", "admin"],
        keywords: ["face id review", "approve photo", "queue"],
      },
      {
        id: "why-camera-proctor",
        question: "What exactly does the camera check during an exam?",
        answer:
          "It runs face detection throughout the attempt: verifying your face is present and matches your registered photo, counting faces in frame (to catch a second person), and tracking head pose. Head-turned fires if you look far to the side for 5+ seconds; gaze-away fires if you look down for 5+ seconds — both are advisory only. Snapshots are taken periodically (faster right after any suspicious event) and stored privately, scoped to your submission.",
        roles: ["student"],
        keywords: ["camera check", "face detection", "head pose", "snapshot"],
      },
    ],
  },
  {
    id: "assignments",
    title: "Assignments",
    roles: ALL,
    entries: [
      {
        id: "assignment-deadline",
        question: "What happens if I miss an assignment deadline?",
        answer:
          "The deadline is enforced on the server, not just by the countdown you see — a client-side timer is advisory only. Once the deadline passes you can no longer submit or resubmit, so don't rely on a slow upload finishing right at the wire.",
        roles: ["student"],
        keywords: ["deadline", "late", "submit", "resubmit"],
      },
      {
        id: "resubmit-assignment",
        question: "Can I resubmit an assignment?",
        answer:
          "Yes, as many times as you like up until the deadline — each resubmission replaces your previous file and resets your status back to \"submitted.\" Once a lecturer marks it \"reviewed,\" though, it's locked and can no longer be changed.",
        roles: ["student"],
        keywords: ["resubmit", "replace file", "reviewed", "locked"],
      },
      {
        id: "grade-assignment-timing",
        question: "Why can't I grade a submission yet?",
        answer:
          "Grading only opens up after the assignment's end_at deadline has passed — this keeps things fair so no student is graded differently mid-window while others can still submit or resubmit.",
        roles: ["lecturer"],
        keywords: ["grade", "locked", "deadline", "end_at"],
      },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    roles: ["student", "lecturer"],
    entries: [
      {
        id: "notification-types",
        question: "What triggers a notification?",
        answer:
          "Appeal updates, exam publishing or flagging, published grades, new announcements, class notes, and assignment activity (posted, submitted, reviewed) all generate a notification in your Inbox, with an unread badge in the sidebar.",
        roles: ["student", "lecturer"],
        keywords: ["inbox", "unread", "badge"],
      },
      {
        id: "notifications-not-updating",
        question: "My unread badge isn't updating right away.",
        answer:
          "The badge count refreshes automatically about every 30 seconds — it isn't instant. If it's been longer than that and still looks wrong, try reloading the page.",
        roles: ["student", "lecturer"],
        keywords: ["badge", "not updating", "refresh", "stale"],
      },
    ],
  },
  {
    id: "profile",
    title: "Account & profile",
    roles: ["student", "lecturer"],
    entries: [
      {
        id: "update-profile",
        question: "How do I update my name or details?",
        answer:
          "Go to Profile from your sidebar's utility section. You can update your personal details there; email/role changes typically need an admin.",
        roles: ["student", "lecturer"],
        keywords: ["edit profile", "name", "details"],
      },
    ],
  },
  {
    id: "admin",
    title: "Admin: users, exams & audit",
    roles: ["admin"],
    entries: [
      {
        id: "admin-ban-user",
        question: "What does banning a user do?",
        answer:
          "A banned user is blocked from signing in. The ban/unban action is written to the audit log under the 'user_management' category so there's always a record of who did it and when.",
        roles: ["admin"],
        keywords: ["ban", "unban", "block", "audit log"],
      },
      {
        id: "admin-audit-log",
        question: "What shows up in the Audit Log?",
        answer:
          "Every logged event falls into one of five categories: user_management (bans/unbans), class (class deletion), exam (publish/unpublish/delete, and full essay grading), integrity (auto-submit after 3 flags), and appeal (approve/reject decisions). Use it to trace who did what and when.",
        roles: ["admin"],
        keywords: ["audit log", "categories", "history"],
      },
      {
        id: "admin-settings-stub",
        question: "Why don't my changes on the Settings page seem to save?",
        answer:
          "Platform Settings is currently a UI-only preview — the flag threshold (3) and appeal window (7 days) shown there are hardcoded defaults and aren't wired to a backend yet, so edits won't persist.",
        roles: ["admin"],
        keywords: ["settings", "not saving", "hardcoded"],
      },
      {
        id: "admin-pdpa-stub",
        question: "How do I process a PDPA data request?",
        answer:
          "The PDPA page currently shows mock data only — there's no real request-processing pipeline wired up yet. Treat anything shown there as a placeholder, not a live queue.",
        roles: ["admin"],
        keywords: ["pdpa", "data request", "mock"],
      },
      {
        id: "admin-integrity-page",
        question: "What does the Integrity page let me do?",
        answer:
          "It gives you a platform-wide view of integrity flags and auto-submitted exams across all classes and lecturers, so you can spot patterns (e.g. one exam generating unusually many flags) beyond what any single lecturer's Monitor view shows.",
        roles: ["admin"],
        keywords: ["integrity", "flags overview"],
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Common problems",
    roles: ALL,
    entries: [
      {
        id: "camera-not-working",
        question: "My camera won't turn on / permission keeps failing.",
        answer:
          "Check your browser's site settings for this address and make sure camera access is set to Allow, not Block. If another app (a video call, another browser tab) is currently using your camera, close it first — most browsers only let one app access the camera at a time. Then reload the page.",
        roles: ["student"],
        keywords: ["camera", "permission", "webcam", "not working"],
      },
      {
        id: "page-stuck-loading",
        question: "A page is stuck loading or looks broken.",
        answer:
          "Try a hard refresh first. If it persists, log out and back in — a stale session is a common cause. If it's happening mid-exam, do not close the tab; note the issue and contact your lecturer immediately, since exam progress and integrity flags depend on the session staying active.",
        roles: ALL,
        keywords: ["stuck", "loading", "broken", "refresh"],
      },
      {
        id: "wrong-role-redirect",
        question: "I keep getting redirected somewhere I don't expect.",
        answer:
          "Every account has exactly one role, and the app always routes you to that role's home. If you believe your role is wrong (e.g. you should be a lecturer, not a student), that's an account-level fix only an admin can make.",
        roles: ALL,
        keywords: ["redirect", "wrong role", "wrong dashboard"],
      },
      {
        id: "who-to-contact",
        question: "Who do I contact if none of this solves my problem?",
        answer:
          "Students and lecturers should first contact their class lecturer for exam/class/grading issues. Account-level issues (bans, role changes, missing enrolments) need an admin. There's no live support chat in the app yet — reach out through your institution's usual contact channel.",
        roles: ALL,
        keywords: ["contact", "support", "help"],
      },
    ],
  },
];
