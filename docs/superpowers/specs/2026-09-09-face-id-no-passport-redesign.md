# Face ID Redesign: Drop the Passport-Photo Upload — Design

**Status:** Approved by user
**Supersedes:** the passport-photo-upload enrollment step of `docs/superpowers/specs/2026-08-21-face-id-design.md` (still authoritative for check-in, in-exam continuity checks, and trust scoring, which are unchanged)
**Author:** Claude Code, in collaboration with the project owner

## 1. Overview & Goals

The original Face ID design required students to upload a passport-style photo and then live-match a webcam frame against it before that live frame's embedding was accepted as the `baseline_embedding`. In practice the uploaded photo was never the thing check-ins compare against — `baseline_embedding` was always set from the **live** frame. The upload only served as (a) a one-time enrollment gate ("does this live face match this uploaded face") and (b) a source image for human reviewers and the profile-picture UI.

This redesign removes the upload entirely. Enrollment becomes a single live webcam capture: the student passes a liveness/anti-spoof challenge and a framing/single-face quality check, and that live frame's embedding becomes the baseline directly. A still from that same frame replaces the uploaded photo everywhere a photo was shown (profile picture, reviewer evidence).

Everything downstream of enrollment — exam-day check-in (`checkInExam`), the check-in review queue, in-exam identity-continuity checks, and trust scoring — is **unchanged**.

### Out of scope
- Check-in flow, in-exam continuity checks, trust score computation — untouched.
- PDPA export/deletion wiring — still deferred, per the original design.

## 2. Data Model

```sql
-- user_facial_profiles: drop the review-queue machinery for enrollment.
ALTER TABLE user_facial_profiles DROP COLUMN pending_embedding;
ALTER TABLE user_facial_profiles DROP COLUMN verification_attempts;
ALTER TABLE user_facial_profiles DROP COLUMN rejection_reason;

-- status no longer includes PENDING_REVIEW / REJECTED — enrollment either
-- succeeds (VERIFIED) or the student just retries (still UNREGISTERED).
ALTER TABLE user_facial_profiles DROP CONSTRAINT user_facial_profiles_status_check;
ALTER TABLE user_facial_profiles ADD CONSTRAINT user_facial_profiles_status_check
  CHECK (status IN ('UNREGISTERED','VERIFIED'));

-- Any rows currently mid-review collapse back to UNREGISTERED — the concept
-- they were waiting on no longer exists, and it's a handful of rows.
UPDATE user_facial_profiles SET status = 'UNREGISTERED' WHERE status IN ('PENDING_REVIEW','REJECTED');
```

`photo_url`, `is_photo_locked`, `last_photo_update`, `approved_by`, `baseline_embedding` keep their existing meaning and columns — only what populates `photo_url` changes (a captured-live still instead of an upload). `approved_by` stops being set by enrollment review (that path is gone) but is left in place since nothing else uses it and dropping it isn't required.

Storage: `facial-profiles/{userId}/enrollment.jpg` replaces `facial-profiles/{userId}/passport.jpg` as the locked reference still. The `review-{ts}.jpg` path (enrollment review evidence) is no longer written. `checkin-{submissionId}-{ts}.jpg` (check-in review evidence) is unchanged.

## 3. Enrollment Flow

**Client (`face-id-enroll.tsx`, single component, no upload step):**
1. Opens the webcam (unchanged permission/error handling).
2. Runs the existing `runLivenessCheck` (blink/head-turn + anti-spoof, unchanged, `liveness.ts`).
3. Captures the current frame, runs the quality check (single face, correctly framed) against that live frame instead of an uploaded image.
4. Extracts the embedding from the same frame (`extractEmbedding`, unchanged).
5. Calls `enrollFace({embedding, livenessPassed, qualityPassed, snapshotBase64})`.
6. On success: done, `VERIFIED`. On failure: show the specific reason (no face / liveness failed / framing) and let the student retry immediately — no attempt cap, no review routing.

**`quality.ts` change:** `checkPassportPhoto(human, image: HTMLImageElement)` is renamed `checkFaceFraming(human, source: HTMLImageElement | HTMLVideoElement)` — `human.detect()` already accepts either, so this is a type-level widening plus a rename, not new detection logic. `isFramedCorrectly` is unchanged.

**Server (`enrollFace`, replaces `registerPassportPhoto` + `verifyEnrolment`):**
- If `is_photo_locked`, reject: "Your Face ID is already verified. Request a photo change first." (existing 90-day-cooldown flow, unchanged, still fronted by `requestPhotoChange`/`canRequestPhotoChange`).
- If `!livenessPassed || !qualityPassed`, return `{ status: 'RETRY', reason }` — no DB write.
- Otherwise: upload `snapshotBase64` to `facial-profiles/{userId}/enrollment.jpg`, upsert `user_facial_profiles` with `status='VERIFIED'`, `baseline_embedding=embedding`, `photo_url`, `is_photo_locked=true`, `last_photo_update=now()`. Write the existing `identity`-category audit log entry ("Face ID registration verified").

This keeps the same server-authoritative principle the original design cared about: the server never trusts a client-reported "verified" outcome — it makes the actual DB state change here, from data the client captured. The trust boundary that's inherently client-side (that the submitted embedding really came from the live camera frame, that `human`'s liveness/anti-spoof scores are honest) is unchanged from the original design, which had the identical property — the original's server-side cosine-similarity check ran on two client-submitted embedding arrays, so it never independently proved provenance either. Removing the second embedding doesn't newly weaken anything.

## 4. Manual Reset (new)

`resetFacialProfile({userId, reason})` server fn:
- Auth: admin (any student) or lecturer (only students enrolled in a class they teach — same ownership check pattern as `reviewCheckin`).
- Deletes the `user_facial_profiles` row for `userId` and removes `facial-profiles/{userId}/*` from storage (best-effort on storage; the DB delete is authoritative).
- Writes an `identity`-category `audit_log` entry: `"Reset Face ID for {userId}: {reason}"`.
- Sends a `pushNotification` to the student ("Your Face ID was reset by a reviewer — please re-register.").
- Exposed as a "Reset Face ID" button in both `admin/face-id-review.tsx` and `lecturer/face-id-review.tsx`, next to each check-in-queue row's student name (a small icon button with a confirm step via the existing `ConfirmModal` component, since this is a destructive action per `CLAUDE.md`'s component conventions).

## 5. Reviewer Pages

`admin/face-id-review.tsx` and `lecturer/face-id-review.tsx` drop their "Registrations" tab and become single-purpose pages: the existing exam check-in queue table, plus the new Reset action per row. No more tab UI (`Tabs` component removed if it has no other use on that page). `getFacialReviewQueue` and `reviewFacialProfile` server functions are deleted. `facial-review-card.tsx` — if it has a registration-review-specific rendering branch, that branch is deleted; the check-in-review rendering is unchanged.

## 6. File & Route Changes

**Deleted:** `src/components/brand/passport-upload.tsx`
**Added:** nothing new client-side (enrollment stays inside `face-id-enroll.tsx`); `scripts/migrate-face-id-no-passport.ts` (server-side migration script, mirrors the existing `migrate-face-id*.ts` scripts' pattern — direct `pg` connection with a Supabase-SQL-Editor fallback note, per `CLAUDE.md`).
**Edited:**
- `src/lib/supabase/face-id.ts` — remove `registerPassportPhoto`, `verifyEnrolment`, `getFacialReviewQueue`, `reviewFacialProfile`; add `enrollFace`, `resetFacialProfile`; update `signedFacialProfileUrls`'s hardcoded `passport.jpg` name to `enrollment.jpg`.
- `src/components/brand/face-id-enroll.tsx` — own the whole flow (camera → liveness → quality → embed → `enrollFace`), no longer takes a `passportEmbedding` prop.
- `src/lib/face-id/quality.ts` — rename/widen as in §3.
- `src/routes/_authenticated/student/face-id.tsx` — remove the upload step/state, render `FaceIdEnroll` directly.
- `src/routes/_authenticated/admin/face-id-review.tsx`, `src/routes/_authenticated/lecturer/face-id-review.tsx` — drop the Registrations tab, add Reset action.
- `src/components/brand/facial-review-card.tsx` — drop the registration-review branch if present.
- `src/tests/lib/face-id-business-rules.test.ts` — remove `nextRegistrationOutcome` coverage (function deleted; `canRequestPhotoChange` coverage stays).
- `src/tests/lib/face-id-quality.test.ts` — update for the renamed/widened function; add a case using a mock video-like source object.

## 7. Testing Strategy

Following the existing convention (pure-function unit tests, no DB-touching suite):
- `quality.ts` — framing/face-count logic against mocked detection results for both an image-like and a video-like source.
- `business-rules.ts` — `canRequestPhotoChange` coverage unchanged; `nextRegistrationOutcome` tests removed along with the function.
- No new pure-function surface is introduced by `enrollFace`/`resetFacialProfile` (they're thin server-fn handlers over existing storage/DB/audit primitives, matching how `checkInExam` etc. are already untested at the handler level in this repo).

## 8. Key Decisions Log

| Decision | Resolution |
|---|---|
| Enrollment security model | Single live capture (liveness + quality gate), no upload-vs-live match step |
| Enrollment failure handling | Unlimited retries, no review queue — quality/liveness either pass or the student tries again |
| Profile/reviewer photo source | Still saved, now from the live enrollment frame instead of an upload |
| Admin/lecturer override | New on-demand `resetFacialProfile` action, replacing the old queue-based reject path |
| Check-in, continuity checks, trust score | Unchanged |
