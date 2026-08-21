# Face ID Biometric Verification & Proctoring Module — Design

**Status:** Approved by user, pending final spec review
**Supersedes:** the removed Face Match feature (commit `ab8c11c`) and the removed identity-checkin hard-block queue
**Author:** Claude Code, in collaboration with the project owner

## 1. Overview & Goals

Rebuild student identity verification as a **passport-photo registration + live-match** system ("Face ID"), replacing the previously removed Face Match / matric-card OCR feature. Core principles carried through the whole design:

- **Data minimization:** store mathematical embeddings and minimal cropped stills, never raw video.
- **Server-authoritative matching:** the browser extracts embeddings (no server-side ML pipeline exists in this app), but every similarity score that gates a business decision is computed server-side from raw embedding vectors — a client can never simply report a passing score.
- **Reuse existing exam-attempt infrastructure** (`submissions`, `flag_reasons`, `proctor-snapshots` bucket) instead of building a parallel session-tracking system, per the project owner's explicit choice.

### Out of scope
- Wiring facial data into the `admin/pdpa` deletion/export flow (still a mock stub per `CLAUDE.md`) — noted as a future follow-up, not built here.
- Any change to the existing hard-flag proctoring mechanics (tab-switch, copy-paste, fullscreen-exit, PrintScreen) — untouched.
- Any change to `camera-proctor.tsx`'s continuous in-exam face-count/gaze detection loop (`FaceLandmarker`) — untouched; this module only adds a *periodic* identity-continuity check on top of it.

## 2. Data Model

The old Face Match tables (`face_enrollments`, `face_verifications`, `face_challenges`, `face_enrollment_sessions`, `identity_checkin_queue`) and columns (`exams.require_identity_verification`, `profiles.matric_no`) are **dropped** and replaced fresh — they don't match this design's shape and carry no data worth preserving into it (per project owner decision).

```sql
-- Registration & enrollment
CREATE TABLE user_facial_profiles (
  user_id                UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status                 TEXT NOT NULL DEFAULT 'UNREGISTERED'
                           CHECK (status IN ('UNREGISTERED','VERIFIED','PENDING_REVIEW','REJECTED')),
  baseline_embedding     JSONB,              -- normalized float array, from the LIVE frame at successful enrollment
  photo_url              TEXT,               -- private bucket path, the locked passport photo (for human review only)
  is_photo_locked        BOOLEAN NOT NULL DEFAULT FALSE,
  verification_attempts  INT NOT NULL DEFAULT 0,
  last_photo_update      TIMESTAMPTZ,
  approved_by            UUID REFERENCES profiles(id),
  rejection_reason       TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-exam opt-in (recreated, same shape/semantics as the old flag)
ALTER TABLE exams ADD COLUMN require_identity_verification BOOLEAN NOT NULL DEFAULT FALSE;

-- Check-in state + trust score live on the EXISTING submissions table
ALTER TABLE submissions ADD COLUMN checkin_status TEXT
  CHECK (checkin_status IN ('pending','verified','checkin-pending-review','rejected'));
ALTER TABLE submissions ADD COLUMN check_in_score NUMERIC;        -- cosine similarity %, at check-in
ALTER TABLE submissions ADD COLUMN checkin_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN checked_in_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN trust_score INT;               -- 0-100, computed at submit

-- Anomaly events reuse the EXISTING flag_reasons table — its `type` column
-- already accepts free-form advisory strings; we extend the vocabulary with
-- identity-continuity mismatches. No new event table.
ALTER TABLE flag_reasons ADD COLUMN snapshot_url TEXT;            -- set only for flagged in-exam re-checks
ALTER TABLE flag_reasons ADD COLUMN confidence_score NUMERIC;     -- similarity %, only for identity-continuity checks
```

Storage: a new private bucket `facial-profiles` (path `{userId}/passport.jpg`, and `{userId}/review-{ts}.jpg` for review-evidence snapshots), plus reuse of the existing private `proctor-snapshots` bucket for in-exam continuity-check snapshots. Both accessed only via short-lived (30-minute) signed URLs — no public paths, no raw video.

## 3. Registration & Enrollment

**Client flow:**
1. Student uploads a passport photo. Client-side (`human`, cached after first load) gives instant feedback on format/size/exactly-one-face/50–70% framing — UX only, not the security boundary.
2. `registerPassportPhoto` server fn uploads the photo to `facial-profiles/{userId}/passport.jpg` and returns its path. Nothing is locked yet.
3. Client opens the webcam, runs a blink/head-turn liveness challenge, and extracts a live-frame embedding.
4. Client sends **both** the passport-photo embedding and the live embedding to `verifyEnrolment`.

**`verifyEnrolment` (server-authoritative):**
- Computes `score = cosineSimilarity(passportEmbedding, liveEmbedding)` server-side via the shared `compare.ts` utility — the client's own locally-computed score, if any, is informational only and never trusted.
- **Pass (`score >= 0.85` and liveness passed):** `status='VERIFIED'`, `is_photo_locked=true`, `baseline_embedding = liveEmbedding`, `last_photo_update=now()`, `verification_attempts` reset to 0.
- **Fail, attempts 1–2:** increment `verification_attempts`, return score + attempts remaining.
- **Fail, attempt 3:** `status='PENDING_REVIEW'`; the failing live frame is saved as a low-res JPEG to `facial-profiles/{userId}/review-{ts}.jpg` so a reviewer has photo + snapshot + score.

**Reconciling "zero self-service swapping" with the 90-day cooldown:** "locked" blocks *directly overwriting* the stored photo. The cooldown/freeze window instead governs when a locked, verified student is *allowed to re-enter the registration flow* at all. Concretely: a locked profile calling `registerPassportPhoto`/`verifyEnrolment` again is rejected unless `now - last_photo_update >= 90 days` **and** the student has no exam starting within the next 48 hours — in which case the profile is unlocked for exactly one new registration cycle, gated through the identical `verifyEnrolment` match logic above (never a raw photo overwrite).

**Manual review queue (registration):** `getFacialReviewQueue` (admin: all `PENDING_REVIEW`; lecturer: only students enrolled in their own classes) and `reviewFacialProfile({userId, action: 'APPROVE'|'REJECT', reason?})`.
- **Approve:** `status='VERIFIED'`, locks, `baseline_embedding` set from the stored review-snapshot embedding, `approved_by` recorded.
- **Reject:** `status='REJECTED'`, `rejection_reason` stored, `verification_attempts` reset to 0, stays unlocked so the student can retry registration from scratch.
- Both actions write to `audit_log` under the existing `general` category (no new category added, to avoid touching the fixed enum documented in `CLAUDE.md`).

## 4. Exam-Day Check-In

Runs in the exam lobby, before "Start exam," only for exams with `require_identity_verification = true`.

**`checkInExam({examId, embedding})`:**
1. Requires `user_facial_profiles.status = 'VERIFIED'` — otherwise a hard error, not a retry loop ("your profile isn't verified — contact your lecturer").
2. Creates/reuses the `submissions` row (same idempotent pattern `startExam` already uses for retakes). This does **not** start the exam timer — `started_at` is only set on first answer save, per the existing invariant.
3. Computes `score = cosineSimilarity(baseline_embedding, embedding)` server-side and increments `submissions.checkin_attempts` (rate-limits brute-force attempts against the stored baseline).
4. **`score >= 0.85`:** `checkin_status='verified'`, `check_in_score`, `checked_in_at` set. Server mints a signed JWT (`jose`, new `EXAM_SESSION_SECRET` env var) with `{sub: userId, examId, submissionId, exp: examDeadline}`. Client then calls `startExam` with the token; `startExam` verifies the signature and claims in addition to its existing checks — a client that bypasses the UI still can't open the exam without a token proving check-in passed.
5. **`score < 0.85`, attempts 1–2:** return score, allow retry.
6. **`score < 0.85`, attempt 3:** `checkin_status='checkin-pending-review'`.

**Invigilator queue — no auto-admit:** the student sees a waiting screen polling check-in status every ~10s. `getCheckinQueue` (lecturer: own classes; admin: any) lists `checkin-pending-review` submissions with the registered photo, the failing live snapshot, and the score. `reviewCheckin({submissionId, action:'clear'|'reject', reason?})`:
- **Clear:** `checkin_status='verified'`. The student's next poll sees this; their client re-calls `checkInExam`, which detects the already-verified status and mints the token without re-running the biometric check.
- **Reject:** `checkin_status='rejected'` with a reason — blocks that exam attempt entirely.

**Explicitly accepted trade-off:** with no auto-admit timeout, a student's ability to enter a live, time-boxed exam depends entirely on a lecturer or admin being reachable during the exam window. This is a deliberate choice by the project owner, overriding the previously-designed 5-minute auto-admit safety net used by the (now-removed) identity-checkin hard-block feature.

## 5. In-Exam Telemetry & Trust Score

- **Continuous** face-count/gaze detection is unchanged — still `camera-proctor.tsx`'s lightweight `FaceLandmarker`, no `human` in that hot loop.
- **Periodic** (every 5 minutes, matching the existing adaptive-snapshot cadence) identity-continuity check: client loads/uses `human` (cached) to re-extract an embedding and compares it to `baseline_embedding`. A mismatch writes an advisory `flag_reasons` row with `confidence_score` and a `snapshot_url` — evidence only, never triggers auto-submit.
- `NO_FACE_DETECTED` / `MULTIPLE_FACES_DETECTED` / `OFF_SCREEN_GAZE` reuse the existing advisory flag plumbing and its existing lowercase-hyphen type strings (`face-missing`, etc.) rather than introducing SCREAMING_SNAKE names, to avoid two naming conventions in one column.
- `FULLSCREEN_EXIT` / `TAB_SWITCH` remain unchanged hard flags — outside this rebuild.
- **Trust score:** computed in `submitExam`. Starts at 100, applies weighted deductions per `flag_reasons` type count (identity-mismatch weighted heaviest, face-missing/gaze lighter), floored at 0, stored in `submissions.trust_score` for lecturer/admin review.

## 6. File & Route Structure

**Client lib** `src/lib/face-id/` (mirrors the old `lib/face/` layout):
| File | Responsibility |
|---|---|
| `compare.ts` | `cosineSimilarity(a: number[], b: number[]): number` — zero dependencies, safe to import from both client and server code. This is the standalone "Biometric Comparison Service" deliverable. |
| `embedding.ts` | `human` loader + `extractEmbedding(source)` |
| `liveness.ts` | blink/head-turn challenge runner |
| `quality.ts` | passport-photo face-count/framing/sharpness checks |
| `business-rules.ts` | pure functions: `canRequestPhotoChange(lastUpdate, upcomingExamStarts, now)`, `nextRegistrationOutcome(attempts, score)` |

**Server** `src/lib/supabase/`:
| File | Responsibility |
|---|---|
| `face-id.ts` | `registerPassportPhoto`, `verifyEnrolment`, `requestPhotoChange`, `checkInExam`, `getCheckinQueue`, `reviewCheckin`, `getFacialReviewQueue`, `reviewFacialProfile` |
| `exam-session-token.ts` | `signExamToken`/`verifyExamToken` via `jose`, reading `EXAM_SESSION_SECRET` |

**Components:** `passport-upload.tsx`, `face-id-enroll.tsx` (webcam + liveness + match loop), `face-id-checkin.tsx` (lobby check-in + waiting screen), `facial-review-card.tsx` (shared photo/snapshot/score/approve-reject card, reused by both queue types).

**Routes:** `student/face-id.tsx` (replaces `verify-identity.tsx`); one tabbed page per reviewer role — `lecturer/face-id-review.tsx` and `admin/face-id-review.tsx`, each with "Registrations" and "Exam Check-ins" tabs (two nav entries total, not four). `app-shell.tsx` gets one `ScanFace`-icon nav entry per role.

**Modified existing files:** `lib/supabase/exams.ts` (re-add `require_identity_verification` field/gate in `startExam`, wire token verification), `student/exams.$examId.lobby.tsx` (check-in step), `student/exams.$examId.take.tsx` (periodic re-check + trust-score-contributing flags), `components/brand/exam-builder.tsx` (re-add the toggle), `app-shell.tsx` (nav).

## 7. Dependencies & Environment

- New dependency: `@vladmandic/human` (re-added), `jose` (new, for signed exam session tokens).
- New env var: `EXAM_SESSION_SECRET` — server-only (`process.env`), documented in `CLAUDE.md`'s environment variable list, never sent to the client.

## 8. Security & Data Minimization

- `user_facial_profiles` and its embeddings/photos are readable/writable by the owning student only via RLS; lecturer/admin access is exclusively through service-role server functions, never direct client table queries.
- Both storage buckets (`facial-profiles`, `proctor-snapshots`) stay private; access only via 30-minute signed URLs.
- `baseline_embedding` is a JSONB float array — not reversible to an image, satisfying data minimization.
- No raw video ever leaves the browser — only single stills (passport photo, low-res review/continuity snapshots) and float-array embeddings.
- `EXAM_SESSION_SECRET` never reaches client code.
- PDPA data-subject-request wiring for this data is explicitly deferred (see §1 Out of scope).

## 9. Testing Strategy

Following this repo's existing convention (pure-function unit tests only, no DB-touching test suite):
- `compare.ts` — `cosineSimilarity` on identical/orthogonal/near-threshold vectors.
- `quality.ts` — framing/face-count validation logic against mocked detection results.
- `exam-session-token.ts` — sign/verify roundtrip, expiry rejection, tampered-signature rejection.
- `business-rules.ts` — cooldown/freeze-window date math, registration-outcome thresholds.
- Trust-score weighting function — deduction math, floor-at-0 behavior.

## 10. Key Decisions Log (for implementers)

| Decision | Resolution |
|---|---|
| DB relationship to existing session/event tables | Reuse `submissions` + `flag_reasons`; only `user_facial_profiles` is new |
| Old Face Match tables | Dropped and recreated fresh |
| Face embedding library | `@vladmandic/human` (re-added) |
| Exam session gating | Real signed JWT (`jose` + `EXAM_SESSION_SECRET`), not just a DB flag |
| Per-exam scope | Opt-in toggle (`exams.require_identity_verification`), not mandatory for all exams |
| Invigilator-clearance queue | No auto-admit timeout (explicit trade-off, see §4) |
