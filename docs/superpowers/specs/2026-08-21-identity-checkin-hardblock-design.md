# Identity check-in hard block — design

Status: approved design, not yet built
Branch: `worktree-face-match`

## 1. Problem & goal

Today the exam-lobby identity check (`IdentityGate`, `faceVerify` with `context: "lobby"`) is fail-soft: once a student exhausts their automated verification attempts, `faceVerify` returns `elevated: true` and the student is allowed to start the exam anyway — the lecturer is merely notified after the fact (`notifyIdentityUnverified`). This makes automated verification purely advisory for anyone willing to fail it on purpose, which defeats the point of Face Match for exams that specifically opted into `require_identity_verification`.

This design changes that path to a hard block: a student who exhausts automated attempts is held in a supervisor-reviewable queue instead of being let straight in, with a bounded auto-admit timeout as a safety net against a student being locked out of a live, time-boxed exam through no fault of their own.

## 2. Scope

- Applies only to exams with `require_identity_verification = true` — the existing flag that already gates whether `IdentityGate` renders at all. Exams without it are completely unaffected.
- Applies only to the `context: "lobby"` `faceVerify` path. In-exam (`context: "in_exam"`) and submit-time (`context: "submit"`) re-checks are explicitly **out of scope** and remain fail-soft, unchanged — pausing or kicking a student mid-exam over a failed re-check is a materially different, higher-stakes intervention than gating entry, and was not asked for.
- No new session-token/JWT mechanism. Supabase's existing auth session remains the sole session mechanism; the automated-pass path is completely unchanged.

## 3. Data model

New table `identity_checkin_queue`:

```sql
CREATE TABLE identity_checkin_queue (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  exam_id       uuid not null references exams(id) on delete cascade,
  queued_at     timestamptz not null default now(),
  status        text not null default 'waiting'
                  check (status in ('waiting','cleared','auto_admitted','rejected')),
  cleared_by    uuid references auth.users(id),
  cleared_at    timestamptz,
  reject_reason text,
  unique (user_id, exam_id)
);

CREATE INDEX identity_checkin_queue_exam_status_idx
  ON identity_checkin_queue (exam_id, status);
```

One row per (student, exam). A fresh lobby visit that re-triggers the queue path upserts the same `waiting` row (does not reset `queued_at` — see §6) rather than creating duplicates. A `rejected` row is terminal for that exam (§6).

RLS: no client policies, same as `face_enrollments`/`face_challenges` — every access goes through `createAdminClient()` inside an authorization-checked server function.

## 4. Server logic changes (`src/lib/supabase/face.ts` unless noted)

### `faceVerify` — lobby-failure branch

Current behavior when `context === "lobby"` and `attemptsRemaining === 0`: returns `{ passed: false, elevated: true, ... }`, caller proceeds anyway.

New behavior: instead of signaling fail-soft "elevated," upsert `identity_checkin_queue` (`status='waiting'`; only set `queued_at` on first insert, not on conflict) and return `{ passed: false, queued: true, queueId, attemptsRemaining: 0 }`. Notify the class's lecturer(s) — same recipients/pattern as the existing `notifyIdentityUnverified` call — with a link to the queue view instead of the monitor page. The student notification changes similarly ("your lecturer has been notified" → "you're in the review queue").

### New: `getIdentityCheckinStatus` (GET, student-facing)

Input: `examId`. Returns the caller's current queue row status (or `null` if none exists / they never got queued). This is also where the 5-minute auto-admit timeout is evaluated **lazily** on each call — no cron: if `status === 'waiting'` and `now() - queued_at > 5 minutes`, flip to `auto_admitted` before returning. Matches this codebase's existing client-triggered-fallback convention (`syncExamStatuses`).

### New: `getIdentityCheckinQueue` (GET, lecturer/admin-facing)

Lists `waiting` rows. Lecturer sees only students enrolled in their own classes (same `class_enrollments` join pattern as `getLecturerFaceReviewQueue`); admin sees all, unscoped.

### New: `decideIdentityCheckin` (POST, lecturer/admin-facing)

Input: `{ queueId, decision: "clear" | "reject", reason? }`.

Authorization: admin always; lecturer only if the student is enrolled in one of their classes (same pattern as `faceReview`'s lecturer branch).

- `clear`: `status='cleared'`, `cleared_by`, `cleared_at`.
- `reject`: `status='rejected'`, `cleared_by`, `cleared_at`, `reject_reason`. Writes to `audit_log` (category `identity`).

Either decision pushes a notification to the student.

### `startExam` (`src/lib/supabase/exams.ts:1232`)

Only the **initial-insert branch** (where `existing.data` is falsy — i.e., first time a submission is created for this student+exam) needs the gate; resuming an already-started submission means the student already passed it once.

Before that insert: if the exam's `require_identity_verification` is true (add this column to the existing `examCheck` select), look up `identity_checkin_queue` for `(user.id, examId)`.
- No row, or `status` in `('cleared', 'auto_admitted')` → proceed as today.
- `status === 'waiting'` → throw (the lobby UI should already prevent reaching `startExam` in this state via the waiting screen, but the server call must be authoritative regardless of what the client does).
- `status === 'rejected'` → throw with a distinct message the client can render as "contact your lecturer."

Because `started_at` is only ever stamped at this insert, and this insert doesn't happen until the queue status is `cleared`/`auto_admitted`, queue-wait time is **never** counted against the student's duration — no separate "duration used" tracking table is needed.

## 5. Client UI

### Student — waiting screen

Replaces the current fail-soft "you may still begin" copy in `IdentityGate`/the lobby route, for the lobby context specifically. Polls `getIdentityCheckinStatus` every ~10s.

- `waiting`: "Waiting for your lecturer to confirm your identity — you'll be let in automatically within 5 minutes even if nobody responds sooner."
- `cleared` / `auto_admitted`: proceeds to "Start exam" automatically (calls `startExam` as today).
- `rejected`: "Your identity could not be confirmed for this exam. Contact your lecturer." — terminal, no retry loop offered inline.

A student who refreshes/re-enters the lobby after being queued should short-circuit straight to this waiting screen (via a queue-status check on mount) rather than re-running automated `faceVerify` attempts from scratch.

### Lecturer — queue section on `identity-sessions.tsx`

A third section alongside the existing supervised-window and OCR-mismatch-review sections: list of `waiting` entries scoped to the lecturer's classes, each with Clear/Reject actions — mirrors the existing `ReviewRow` component already on that page.

### Admin — queue view

New section on the existing `admin/identity` area (or a new `admin/identity-checkin` route), same list/actions, unscoped across all students.

## 6. Edge cases

- **Reject overrides auto-admit.** The lazy timeout check in `getIdentityCheckinStatus` only ever flips `waiting` rows — a `rejected` row is never touched by it.
- **Re-queuing doesn't reset the timeout.** The upsert in `faceVerify`'s lobby-failure branch must not overwrite an existing row's `queued_at` — otherwise a student (or a client retry) could indefinitely postpone the auto-admit timeout just by re-triggering the failure path.
- **Exam window closes while queued.** No new handling needed — the existing `end_time` checks elsewhere already prevent starting an exam past its window, independent of queue status.
- **Concurrent clear + reject** (two supervisors act at once): `decideIdentityCheckin` should only apply its update `WHERE status = 'waiting'`, so the second call becomes a no-op against an already-decided row rather than silently overwriting the first decision.

## 7. Explicitly out of scope

- In-exam and submit-time identity re-checks — unchanged, remain fail-soft.
- Any new session-token/JWT mechanism.
- Applying this to exams without `require_identity_verification`.
- The separately-approved (bounded-scope) trust-score and profile-photo framing-check additions — tracked and implemented independently of this spec.
