# Face ID Redesign: Drop the Passport-Photo Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the passport-photo-upload enrollment step of Face ID with a single live webcam capture (liveness + framing quality gate), so students never upload a static photo but still prove a live face before their baseline embedding is accepted.

**Architecture:** Enrollment collapses from two server round-trips (`registerPassportPhoto` then `verifyEnrolment`) into one (`enrollFace`), fed by a single-component webcam flow. The enrollment manual-review queue (`PENDING_REVIEW`/`REJECTED`, `getFacialReviewQueue`, `reviewFacialProfile`) is deleted outright — with nothing to mismatch against, enrollment just retries client-side until it passes — and replaced by a new on-demand `resetFacialProfile` action for admins/lecturers. Check-in, in-exam continuity checks, and trust scoring are untouched.

**Tech Stack:** TanStack Start server functions, Supabase (Postgres + Storage), `@vladmandic/human` (client-side face embeddings/liveness), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-face-id-no-passport-redesign.md`

## Global Constraints

- `user_facial_profiles.status` becomes `'UNREGISTERED' | 'VERIFIED'` only (no `PENDING_REVIEW`/`REJECTED`).
- No attempt cap on enrollment — unlimited client-side retries, no server-side counter.
- The registered photo is always a live-captured still (`facial-profiles/{userId}/enrollment.jpg`), never an upload.
- Check-in (`checkInExam`), `getCheckinQueue`, `reviewCheckin`, `checkIdentityContinuity`, and trust scoring are not modified by this plan.
- Every server-side DB write in `face-id.ts` continues to run through the service-role admin client, never the caller's client — this is an existing RLS-driven security invariant (see the comment at the top of `src/lib/supabase/face-id.ts`), not something this plan changes but something every new function in it must preserve.
- `audit_log` writes use `category: "identity"` (already a valid `AuditCategory` value in `src/lib/supabase/audit.ts:7-14` and already accepted by the DB per `scripts/migrate-audit-category.ts`).

---

## Task 1: Database migration

**Files:**
- Create: `scripts/migrate-face-id-no-passport.ts`
- Modify: `package.json` (add script entry)

**Interfaces:**
- Produces: `user_facial_profiles` with columns `pending_embedding`, `verification_attempts`, `rejection_reason` dropped, and its `status` CHECK constraint narrowed to `('UNREGISTERED','VERIFIED')`.

- [ ] **Step 1: Write the migration script**

```ts
import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

// The passport-photo-upload enrollment step (and its PENDING_REVIEW/REJECTED
// manual-review path) is removed — enrollment is now a single live webcam
// capture that either succeeds or the student retries. See
// docs/superpowers/specs/2026-09-09-face-id-no-passport-redesign.md.
async function migrate() {
  console.log("Dropping passport-review columns from user_facial_profiles…");

  await pool.query(`
    UPDATE user_facial_profiles SET status = 'UNREGISTERED' WHERE status IN ('PENDING_REVIEW','REJECTED');
  `);
  console.log("✓  in-flight PENDING_REVIEW/REJECTED rows collapsed to UNREGISTERED");

  await pool.query(`
    ALTER TABLE user_facial_profiles DROP CONSTRAINT IF EXISTS user_facial_profiles_status_check;
    ALTER TABLE user_facial_profiles ADD CONSTRAINT user_facial_profiles_status_check
      CHECK (status IN ('UNREGISTERED','VERIFIED'));
  `);
  console.log("✓  status constraint narrowed to UNREGISTERED/VERIFIED");

  await pool.query(`
    ALTER TABLE user_facial_profiles DROP COLUMN IF EXISTS pending_embedding;
    ALTER TABLE user_facial_profiles DROP COLUMN IF EXISTS verification_attempts;
    ALTER TABLE user_facial_profiles DROP COLUMN IF EXISTS rejection_reason;
  `);
  console.log("✓  pending_embedding, verification_attempts, rejection_reason dropped");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add this line immediately after the `"migrate:face-id-status-check"` entry (`package.json:41`):

```json
    "migrate:face-id-no-passport": "tsx scripts/migrate-face-id-no-passport.ts",
```

- [ ] **Step 3: Run the migration**

Run: `npm run migrate:face-id-no-passport`
Expected: all three "✓" lines print, then "Migration complete." with exit code 0. If `DATABASE_URL` is unreachable from this network, run the same three SQL blocks manually in the Supabase Dashboard → SQL Editor instead (per `CLAUDE.md`'s note on migration scripts).

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-face-id-no-passport.ts package.json
git commit -m "$(cat <<'EOF'
feat(face-id): drop passport-review columns from user_facial_profiles

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018qdNmHJTqnxaivtMfBhZEW
EOF
)"
```

---

## Task 2: Rename the framing-quality check

**Files:**
- Modify: `src/lib/face-id/quality.ts:20-48`

**Interfaces:**
- Consumes: nothing new.
- Produces: `checkFaceFraming(human: any, image: HTMLImageElement): Promise<PassportPhotoCheck>` (same behavior and signature as the old `checkPassportPhoto`, renamed only — it will be called against a still captured from the live webcam frame in Task 5, not an uploaded file, so the old name no longer fits).

- [ ] **Step 1: Rename the function**

In `src/lib/face-id/quality.ts`, change line 22 from:

```ts
export async function checkPassportPhoto(
```

to:

```ts
export async function checkFaceFraming(
```

- [ ] **Step 2: Verify no test references the old name**

Run: `Select-String -Path "src\tests\lib\face-id-quality.test.ts" -Pattern "checkPassportPhoto"`
Expected: no matches (the existing test file only imports and tests `isFramedCorrectly`, not `checkPassportPhoto`, so nothing else needs updating here).

- [ ] **Step 3: Run the existing quality tests**

Run: `npm run test -- src/tests/lib/face-id-quality.test.ts`
Expected: PASS (7 tests, unchanged — this task doesn't touch `isFramedCorrectly`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/face-id/quality.ts
git commit -m "$(cat <<'EOF'
refactor(face-id): rename checkPassportPhoto to checkFaceFraming

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018qdNmHJTqnxaivtMfBhZEW
EOF
)"
```

---

## Task 3: Remove the passport-match outcome logic

**Files:**
- Modify: `src/lib/face-id/business-rules.ts:1-20`
- Modify: `src/tests/lib/face-id-business-rules.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `business-rules.ts` now exports only `canRequestPhotoChange` and `PhotoChangeCheck` — `nextRegistrationOutcome` and `RegistrationOutcome` are gone, since there's no longer a passport-vs-live match score to turn into an outcome.

- [ ] **Step 1: Remove the failing tests first**

In `src/tests/lib/face-id-business-rules.test.ts`, delete the entire `describe("nextRegistrationOutcome", ...)` block (lines 4-43) and change the import on line 2 from:

```ts
import { nextRegistrationOutcome, canRequestPhotoChange } from "@/lib/face-id/business-rules";
```

to:

```ts
import { canRequestPhotoChange } from "@/lib/face-id/business-rules";
```

The file should now start with:

```ts
import { describe, it, expect } from "vitest";
import { canRequestPhotoChange } from "@/lib/face-id/business-rules";

describe("canRequestPhotoChange", () => {
```

- [ ] **Step 2: Run the tests to confirm the remaining suite still passes**

Run: `npm run test -- src/tests/lib/face-id-business-rules.test.ts`
Expected: PASS (6 tests — the `canRequestPhotoChange` describe block, untouched).

- [ ] **Step 3: Remove `nextRegistrationOutcome` from the source**

In `src/lib/face-id/business-rules.ts`, delete lines 1-20 (the `RegistrationOutcome` interface and `nextRegistrationOutcome` function). The file should now start with:

```ts
export interface PhotoChangeCheck {
  allowed: boolean;
  reason?: string;
}

export function canRequestPhotoChange(
```

- [ ] **Step 4: Run the tests again to confirm nothing broke**

Run: `npm run test -- src/tests/lib/face-id-business-rules.test.ts`
Expected: PASS (6 tests, same as Step 2).

- [ ] **Step 5: Commit**

```bash
git add src/lib/face-id/business-rules.ts src/tests/lib/face-id-business-rules.test.ts
git commit -m "$(cat <<'EOF'
refactor(face-id): remove nextRegistrationOutcome (no more passport match)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018qdNmHJTqnxaivtMfBhZEW
EOF
)"
```

---

## Task 4: Rewrite the Face ID server functions

**Files:**
- Modify: `src/lib/supabase/face-id.ts`

**Interfaces:**
- Consumes: `cosineSimilarity` from `@/lib/face-id/compare` (unchanged, still used by `checkInExam`/`checkIdentityContinuity`), `FACE_ID` from `@/lib/constants`, `writeAudit`/`pushNotification` (unchanged signatures).
- Produces:
  - `getMyFacialProfile(): Promise<MyFacialProfile>` — same name, narrowed shape (see Step 1).
  - `enrollFace(data: { embedding: number[]; livenessPassed: boolean; qualityPassed: boolean; snapshotBase64: string }): Promise<{ status: "VERIFIED" } | { status: "RETRY"; reason: string }>` — new, replaces `registerPassportPhoto` + `verifyEnrolment`.
  - `resetFacialProfile(data: { userId: string; reason: string }): Promise<{ ok: true }>` — new.
  - `requestPhotoChange`, `getCheckinQueue`, `reviewCheckin`, `checkInExam`, `checkIdentityContinuity` — unchanged except `getCheckinQueue`'s returned rows gain a `studentId: string` field (Task 7/8 need it to call `resetFacialProfile`).
  - `getFacialReviewQueue`, `reviewFacialProfile`, `registerPassportPhoto`, `verifyEnrolment` — deleted.

- [ ] **Step 1: Narrow `MyFacialProfile` and `getMyFacialProfile`**

Replace lines 58-107 (the `MyFacialProfile` type through the end of `getMyFacialProfile`) with:

```ts
export type MyFacialProfile = {
  status: "UNREGISTERED" | "VERIFIED";
  isPhotoLocked: boolean;
  photoUrl: string | null;
  lastPhotoUpdate: string | null;
  photoChangeEligible: boolean;
  photoChangeReason: string | null;
};

// GET: the caller's own Face ID registration status, so the student page can
// show where they stand instead of always restarting at the enroll step.
// Reads run in the caller's context — the owner-SELECT RLS policy is what
// scopes this to their own row. photoUrl is a 30-minute signed URL to the
// live-captured enrollment still — used to show it as the profile picture.
export const getMyFacialProfile = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyFacialProfile> => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await db(supabase)
      .from("user_facial_profiles")
      .select("status, is_photo_locked, last_photo_update")
      .eq("user_id", user.id)
      .maybeSingle();

    const { photoUrl } = profile ? await signedFacialProfileUrls(user.id) : { photoUrl: null };

    let photoChangeEligible = false;
    let photoChangeReason: string | null = null;
    if (profile?.status === "VERIFIED" && profile.is_photo_locked) {
      const check = await getPhotoChangeEligibility(supabase, user.id, profile.last_photo_update);
      photoChangeEligible = check.allowed;
      photoChangeReason = check.reason ?? null;
    }

    return {
      status: (profile?.status ?? "UNREGISTERED") as MyFacialProfile["status"],
      isPhotoLocked: profile?.is_photo_locked ?? false,
      photoUrl,
      lastPhotoUpdate: profile?.last_photo_update ?? null,
      photoChangeEligible,
      photoChangeReason,
    };
  },
);
```

- [ ] **Step 2: Replace `registerPassportPhoto` + `verifyEnrolment` with `enrollFace`**

**Careful — `requestPhotoChange` sits between these two functions and must be kept.** Delete only the `registerPassportPhoto` function (starts with the `// POST: upload a passport photo...` comment, ends right before the blank line preceding the `// POST: unlock a locked, verified profile...` comment that introduces `requestPhotoChange`), leave `requestPhotoChange` itself completely untouched, then delete only the `verifyEnrolment` function (starts with the `// POST: 1:1 match between the passport-photo embedding...` comment, ends right before the blank line preceding the `signedFacialProfileUrls` function's doc comment). Insert the following two new functions where `verifyEnrolment` used to be (i.e., immediately after `requestPhotoChange`, before `signedFacialProfileUrls`):

```ts
// POST: enroll (or re-enroll after a photo-change unlock) a Face ID profile
// from a single live webcam capture. There's no upload to match against
// anymore — liveness and framing-quality are checked client-side (the same
// trust level `livenessPassed` already had in the old passport-match flow)
// and gate whether this frame's embedding becomes the baseline. A failing
// check is just a client-side retry, never a DB write.
export const enrollFace = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      embedding: number[];
      livenessPassed: boolean;
      qualityPassed: boolean;
      snapshotBase64: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await db(supabase)
      .from("user_facial_profiles")
      .select("is_photo_locked")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.is_photo_locked) {
      throw new Error("Your Face ID is already verified. Request a photo change first.");
    }

    if (!data.livenessPassed) {
      return {
        status: "RETRY" as const,
        reason: "Liveness check failed — make sure you're in good lighting and try again.",
      };
    }
    if (!data.qualityPassed) {
      return {
        status: "RETRY" as const,
        reason: "Face wasn't framed correctly — move closer or further and try again.",
      };
    }

    const admin = createAdminClient();
    const path = `${user.id}/enrollment.jpg`;
    const { error: uploadError } = await admin.storage
      .from(FACIAL_PROFILES_BUCKET)
      .upload(path, base64ToBuffer(data.snapshotBase64), { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    await admin.from("user_facial_profiles").upsert({
      user_id: user.id,
      status: "VERIFIED",
      baseline_embedding: data.embedding,
      photo_url: path,
      is_photo_locked: true,
      last_photo_update: new Date().toISOString(),
    });

    await writeAudit(user.id, {
      action: "Face ID registration verified",
      target: user.id,
      category: "identity",
    });

    return { status: "VERIFIED" as const };
  });

// POST: on-demand reset of a student's Face ID back to UNREGISTERED, wiping
// their baseline and stored photo. Admin can reset any student; a lecturer
// only students enrolled in a class they teach. Replaces the old
// queue-based REJECT action — there's no review queue to reject an
// enrollment from anymore, so this is the manual override instead.
export const resetFacialProfile = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string; reason: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: me } = await db(supabase)
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (me?.role !== "admin" && me?.role !== "lecturer") throw new Error("Unauthorized");

    const admin = createAdminClient();

    if (me.role === "lecturer") {
      const { data: enrolled } = await admin
        .from("class_enrollments")
        .select("student_id, classes!inner(lecturer_id)")
        .eq("student_id", data.userId)
        .eq("classes.lecturer_id", user.id)
        .maybeSingle();
      if (!enrolled) throw new Error("Forbidden");
    }

    await admin.from("user_facial_profiles").delete().eq("user_id", data.userId);

    const { data: files } = await admin.storage
      .from(FACIAL_PROFILES_BUCKET)
      .list(data.userId, { limit: 1000 });
    if (files && files.length > 0) {
      await admin.storage
        .from(FACIAL_PROFILES_BUCKET)
        .remove(files.map((f: any) => `${data.userId}/${f.name}`))
        .catch(() => {});
    }

    await writeAudit(user.id, {
      action: `Reset Face ID for ${data.userId}: ${data.reason}`,
      target: data.userId,
      category: "identity",
    });

    await pushNotification(supabase, {
      userId: data.userId,
      type: "face_id_reset",
      title: "Face ID reset",
      body: "Your Face ID was reset by a reviewer — please re-register.",
    }).catch(() => {});

    return { ok: true as const };
  });
```

- [ ] **Step 3: Update `signedFacialProfileUrls` for the new filename**

Change this line inside `signedFacialProfileUrls` (originally around line 278):

```ts
  const passportName = names.find((n: string) => n === "passport.jpg");
```

to:

```ts
  const passportName = names.find((n: string) => n === "enrollment.jpg");
```

(The local variable name `passportName`/`photoUrl` naming is left as-is — it's an internal detail of this one helper and renaming it isn't required for correctness; leave it to avoid unnecessary churn.)

- [ ] **Step 4: Delete `getFacialReviewQueue` and `reviewFacialProfile`**

Delete the entire `getFacialReviewQueue` function and the entire `reviewFacialProfile` function (originally the two functions between `signedFacialProfileUrls` and the `CheckInExamResult` type comment).

- [ ] **Step 5: Add `studentId` to `getCheckinQueue`'s returned rows**

In `getCheckinQueue`, change the `.map` return (originally):

```ts
      return {
        submissionId: r.id as string,
        studentName: r.profiles?.name ?? "Unknown",
        examTitle: r.exams?.title ?? "Untitled exam",
        score: r.check_in_score as number | null,
        photoUrl,
        snapshotUrl,
      };
```

to:

```ts
      return {
        submissionId: r.id as string,
        studentId: r.student_id as string,
        studentName: r.profiles?.name ?? "Unknown",
        examTitle: r.exams?.title ?? "Untitled exam",
        score: r.check_in_score as number | null,
        photoUrl,
        snapshotUrl,
      };
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `face-id.ts` (pre-existing unrelated errors elsewhere in the repo, if any, are not this task's concern — only confirm nothing new appears in this file).

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/face-id.ts
git commit -m "$(cat <<'EOF'
feat(face-id): replace passport-match enrollment with single live capture

registerPassportPhoto + verifyEnrolment become enrollFace; the
PENDING_REVIEW manual-review queue (getFacialReviewQueue,
reviewFacialProfile) is replaced by an on-demand resetFacialProfile.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018qdNmHJTqnxaivtMfBhZEW
EOF
)"
```

---

## Task 5: Rewrite the enrollment component

**Files:**
- Modify: `src/components/brand/face-id-enroll.tsx`

**Interfaces:**
- Consumes: `loadHuman`, `extractEmbedding` from `@/lib/face-id/embedding` (unchanged); `runLivenessCheck` from `@/lib/face-id/liveness` (unchanged); `checkFaceFraming` from `@/lib/face-id/quality` (Task 2); `enrollFace` from `@/lib/supabase/face-id` (Task 4).
- Produces: `FaceIdEnroll({ onDone: () => void })` — a self-contained webcam enrollment flow with no more `passportEmbedding` prop and no more `PENDING_REVIEW`/"failed" terminal state (unlimited retries).

- [ ] **Step 1: Replace the entire file contents**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman, extractEmbedding } from "@/lib/face-id/embedding";
import { runLivenessCheck } from "@/lib/face-id/liveness";
import { checkFaceFraming } from "@/lib/face-id/quality";
import { enrollFace } from "@/lib/supabase/face-id";
import { toast } from "sonner";

interface Props {
  onDone: () => void;
}

export function FaceIdEnroll({ onDone }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "checking" | "retry">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
        }
      })
      .catch((err: any) => {
        setCameraError(
          err?.name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera in your browser's address bar, then reload this page."
            : "We couldn't start your camera. Check that no other app is using it, then reload this page.",
        );
      });
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  async function runCheck() {
    const video = videoRef.current;
    if (!video) return;
    setState("checking");
    setMessage(null);
    try {
      const human = await loadHuman();
      const liveness = await runLivenessCheck(human, video);
      const face = await extractEmbedding(human, video);
      if (!face) {
        setState("retry");
        setMessage("No face detected — position yourself in front of the camera.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const snapshotBase64 = canvas.toDataURL("image/jpeg", 0.6);

      const snapshotImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = snapshotBase64;
      });
      const framing = await checkFaceFraming(human, snapshotImage);

      const result = await enrollFace({
        data: {
          embedding: face.embedding,
          livenessPassed: liveness.passed,
          qualityPassed: framing.ok,
          snapshotBase64,
        },
      });

      if (result.status === "VERIFIED") {
        toast.success("Face ID registered!");
        onDone();
        return;
      }

      setState("retry");
      setMessage(result.reason);
    } catch (err: any) {
      setState("retry");
      setMessage(err?.message ?? "Something went wrong. Try again.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="aspect-video rounded-2xl border-2 border-ink bg-secondary overflow-hidden">
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
      </div>
      {cameraError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-pink/10 border-2 border-pink text-sm">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-pink" />
          {cameraError}
        </div>
      )}
      {message && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber/10 border-2 border-amber text-sm">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          {message}
        </div>
      )}
      <WakeoutButton
        variant="primary"
        size="default"
        disabled={state === "checking" || !!cameraError}
        onClick={runCheck}
        className="w-full"
      >
        {state === "checking" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
          </>
        ) : (
          "Start live verification"
        )}
      </WakeoutButton>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `face-id-enroll.tsx` (it will still show errors from `student/face-id.tsx` and `passport-upload.tsx` since those aren't updated until Task 6 — that's expected and resolved there).

- [ ] **Step 3: Commit**

```bash
git add src/components/brand/face-id-enroll.tsx
git commit -m "$(cat <<'EOF'
feat(face-id): make FaceIdEnroll a self-contained webcam-only flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018qdNmHJTqnxaivtMfBhZEW
EOF
)"
```

---

## Task 6: Update the student Face ID page and delete the upload component

**Files:**
- Delete: `src/components/brand/passport-upload.tsx`
- Modify: `src/routes/_authenticated/student/face-id.tsx`

**Interfaces:**
- Consumes: `FaceIdEnroll` (Task 5), `getMyFacialProfile`/`requestPhotoChange` (Task 4), `MyFacialProfile` (Task 4, status now only `"UNREGISTERED" | "VERIFIED"`).

- [ ] **Step 1: Delete the passport upload component**

```bash
git rm src/components/brand/passport-upload.tsx
```

- [ ] **Step 2: Replace `student/face-id.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { PageHeader, Card } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { FaceIdEnroll } from "@/components/brand/face-id-enroll";
import { requestPhotoChange, getMyFacialProfile } from "@/lib/supabase/face-id";
import { FACE_ID } from "@/lib/constants";
import { fmtMY } from "@/lib/datetime";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/student/face-id")({
  head: () => ({ meta: [{ title: "Face ID — Aura" }] }),
  component: FaceIdPage,
});

function FaceIdPage() {
  const queryClient = useQueryClient();
  // "done" is a local override so a freshly finished enrollment doesn't
  // flicker back to the enroll step while the refetch is in flight; null
  // means follow the server status.
  const [step, setStep] = useState<"done" | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-facial-profile"],
    queryFn: () => getMyFacialProfile(),
  });

  async function handleRequestChange() {
    setUnlocking(true);
    try {
      await requestPhotoChange();
      toast.success("Unlocked — you can register again.");
      await queryClient.invalidateQueries({ queryKey: ["my-facial-profile"] });
      setStep(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't unlock your Face ID. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  function body() {
    if (isLoading) {
      return (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your Face ID status…
        </p>
      );
    }

    if (step === "done") {
      return <p className="text-sm text-muted-foreground">Registration complete.</p>;
    }

    if (profile?.status === "VERIFIED") {
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            {profile.photoUrl && (
              <img
                src={profile.photoUrl}
                alt=""
                className="w-16 h-16 rounded-xl border-2 border-ink object-cover shrink-0"
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-lime-600 shrink-0" />
                <div className="font-display font-bold text-lg">Registered</div>
              </div>
              {profile.lastPhotoUpdate && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Registered {fmtMY(profile.lastPhotoUpdate, { dateStyle: "medium" })}
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Your Face ID is verified and locked. To re-register you must request a photo
                change — allowed once every {FACE_ID.COOLDOWN_DAYS} days, and never within{" "}
                {FACE_ID.FREEZE_HOURS} hours of a scheduled exam.
              </p>
            </div>
          </div>
          {!profile.photoChangeEligible && profile.photoChangeReason && (
            <p className="text-sm text-amber-600 flex items-center gap-1.5">
              <Clock className="w-4 h-4 shrink-0" />
              {profile.photoChangeReason}
            </p>
          )}
          <WakeoutButton
            variant="secondary"
            size="default"
            disabled={unlocking || !profile.photoChangeEligible}
            onClick={handleRequestChange}
          >
            {unlocking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Requesting…
              </>
            ) : (
              "Request photo change"
            )}
          </WakeoutButton>
        </div>
      );
    }

    return (
      <FaceIdEnroll
        onDone={() => {
          setStep("done");
          queryClient.invalidateQueries({ queryKey: ["my-facial-profile"] });
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        badge="Identity"
        badgeColor="bg-sky"
        title="Face ID"
        subtitle="Register your identity for exams"
      />
      <Card className="max-w-lg">{body()}</Card>
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `student/face-id.tsx` or `passport-upload.tsx` (the latter no longer exists).

- [ ] **Step 4: Commit**

```bash
git add -A src/components/brand/passport-upload.tsx src/routes/_authenticated/student/face-id.tsx
git commit -m "$(cat <<'EOF'
feat(face-id): drop the upload step from the student Face ID page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018qdNmHJTqnxaivtMfBhZEW
EOF
)"
```

---

## Task 7: Update the admin Face ID review page

**Files:**
- Modify: `src/routes/_authenticated/admin/face-id-review.tsx`

**Interfaces:**
- Consumes: `getCheckinQueue`, `reviewCheckin`, `resetFacialProfile` (Task 4); `FacialReviewCard` (unchanged); `ConfirmModal`, `WakeoutButton` (unchanged, existing components).

- [ ] **Step 1: Replace the entire file contents**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/brand/page";
import { FacialReviewCard } from "@/components/brand/facial-review-card";
import { ConfirmModal } from "@/components/brand/confirm-modal";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getCheckinQueue, reviewCheckin, resetFacialProfile } from "@/lib/supabase/face-id";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/face-id-review")({
  head: () => ({ meta: [{ title: "Face ID Review — Aura" }] }),
  component: FaceIdReviewPage,
});

function FaceIdReviewPage() {
  const queryClient = useQueryClient();
  const [resetTarget, setResetTarget] = useState<{ userId: string; name: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const { data: rows } = useQuery({
    queryKey: ["checkin-queue"],
    queryFn: () => getCheckinQueue(),
    // A student can pass check-in on their own retry while this page is
    // open — poll so they drop off the list without a manual refresh.
    refetchInterval: 15_000,
  });

  async function runReset() {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await resetFacialProfile({
        data: { userId: resetTarget.userId, reason: "Manual reset by admin" },
      });
      toast.success(`${resetTarget.name}'s Face ID was reset`);
      queryClient.invalidateQueries({ queryKey: ["checkin-queue"] });
      setResetTarget(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't reset Face ID. Try again.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <PageHeader
        badge="Review"
        badgeColor="bg-lime"
        title="Face ID Review"
        subtitle="Exam check-ins awaiting manual verification"
      />
      <div className="grid md:grid-cols-2 gap-4">
        {(rows ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No students waiting on check-in review.</p>
        )}
        {(rows ?? []).map((row) => (
          <div key={row.submissionId} className="space-y-2">
            <FacialReviewCard
              name={row.studentName}
              subtitle={row.examTitle}
              photoUrl={row.photoUrl}
              snapshotUrl={row.snapshotUrl}
              score={row.score}
              onApprove={async () => {
                await reviewCheckin({ data: { submissionId: row.submissionId, action: "clear" } });
                queryClient.invalidateQueries({ queryKey: ["checkin-queue"] });
              }}
              onReject={async (reason) => {
                await reviewCheckin({
                  data: { submissionId: row.submissionId, action: "reject", reason },
                });
                queryClient.invalidateQueries({ queryKey: ["checkin-queue"] });
              }}
            />
            <WakeoutButton
              variant="ghost"
              size="sm"
              onClick={() => setResetTarget({ userId: row.studentId, name: row.studentName })}
            >
              Reset Face ID
            </WakeoutButton>
          </div>
        ))}
      </div>
      <ConfirmModal
        open={resetTarget !== null}
        title="Reset Face ID?"
        message={`"${resetTarget?.name}" will need to re-register their Face ID from scratch before their next exam.`}
        confirmLabel="Reset"
        danger
        loading={resetting}
        onConfirm={runReset}
        onClose={() => {
          if (!resetting) setResetTarget(null);
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `admin/face-id-review.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/admin/face-id-review.tsx
git commit -m "$(cat <<'EOF'
feat(face-id): drop Registrations tab, add Reset Face ID on admin review page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018qdNmHJTqnxaivtMfBhZEW
EOF
)"
```

---

## Task 8: Update the lecturer Face ID review page

**Files:**
- Modify: `src/routes/_authenticated/lecturer/face-id-review.tsx`

**Interfaces:**
- Consumes: identical to Task 7 — same server functions, same components. Only visual difference from the admin page is the accent color (`bg-violet` instead of `bg-lime`, matching this repo's existing per-role color convention documented in `CLAUDE.md`) and the reset reason text.

- [ ] **Step 1: Replace the entire file contents**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/brand/page";
import { FacialReviewCard } from "@/components/brand/facial-review-card";
import { ConfirmModal } from "@/components/brand/confirm-modal";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getCheckinQueue, reviewCheckin, resetFacialProfile } from "@/lib/supabase/face-id";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lecturer/face-id-review")({
  head: () => ({ meta: [{ title: "Face ID Review — Aura" }] }),
  component: FaceIdReviewPage,
});

function FaceIdReviewPage() {
  const queryClient = useQueryClient();
  const [resetTarget, setResetTarget] = useState<{ userId: string; name: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const { data: rows } = useQuery({
    queryKey: ["checkin-queue"],
    queryFn: () => getCheckinQueue(),
    // A student can pass check-in on their own retry while this page is
    // open — poll so they drop off the list without a manual refresh.
    refetchInterval: 15_000,
  });

  async function runReset() {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await resetFacialProfile({
        data: { userId: resetTarget.userId, reason: "Manual reset by lecturer" },
      });
      toast.success(`${resetTarget.name}'s Face ID was reset`);
      queryClient.invalidateQueries({ queryKey: ["checkin-queue"] });
      setResetTarget(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't reset Face ID. Try again.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <PageHeader
        badge="Review"
        badgeColor="bg-violet"
        title="Face ID Review"
        subtitle="Exam check-ins awaiting manual verification"
      />
      <div className="grid md:grid-cols-2 gap-4">
        {(rows ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No students waiting on check-in review.</p>
        )}
        {(rows ?? []).map((row) => (
          <div key={row.submissionId} className="space-y-2">
            <FacialReviewCard
              name={row.studentName}
              subtitle={row.examTitle}
              photoUrl={row.photoUrl}
              snapshotUrl={row.snapshotUrl}
              score={row.score}
              onApprove={async () => {
                await reviewCheckin({ data: { submissionId: row.submissionId, action: "clear" } });
                queryClient.invalidateQueries({ queryKey: ["checkin-queue"] });
              }}
              onReject={async (reason) => {
                await reviewCheckin({
                  data: { submissionId: row.submissionId, action: "reject", reason },
                });
                queryClient.invalidateQueries({ queryKey: ["checkin-queue"] });
              }}
            />
            <WakeoutButton
              variant="ghost"
              size="sm"
              onClick={() => setResetTarget({ userId: row.studentId, name: row.studentName })}
            >
              Reset Face ID
            </WakeoutButton>
          </div>
        ))}
      </div>
      <ConfirmModal
        open={resetTarget !== null}
        title="Reset Face ID?"
        message={`"${resetTarget?.name}" will need to re-register their Face ID from scratch before their next exam.`}
        confirmLabel="Reset"
        danger
        loading={resetting}
        onConfirm={runReset}
        onClose={() => {
          if (!resetting) setResetTarget(null);
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `lecturer/face-id-review.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/lecturer/face-id-review.tsx
git commit -m "$(cat <<'EOF'
feat(face-id): drop Registrations tab, add Reset Face ID on lecturer review page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018qdNmHJTqnxaivtMfBhZEW
EOF
)"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests PASS, including the updated `face-id-quality.test.ts` and `face-id-business-rules.test.ts`.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: no errors (in particular, no unused-import warnings for the deleted `PassportUpload`, `registerPassportPhoto`, `verifyEnrolment`, `getFacialReviewQueue`, `reviewFacialProfile`, `nextRegistrationOutcome`, `RegistrationOutcome` symbols — confirms no stray references were left behind).

- [ ] **Step 3: Full production build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Confirm no remaining references to removed symbols**

Run: `Select-String -Path "src\**\*.ts","src\**\*.tsx" -Pattern "registerPassportPhoto|verifyEnrolment|getFacialReviewQueue|reviewFacialProfile|PassportUpload|passportEmbedding|nextRegistrationOutcome|checkPassportPhoto" -Recurse`
Expected: no matches anywhere in `src/`.

- [ ] **Step 5: Manual browser check**

Use the `run` skill to start the dev server (`npm run dev`) and, as a student account, walk through: Face ID page shows the enroll step (no upload button anywhere) → webcam capture completes → status flips to "Registered" with a photo shown. Then as a lecturer or admin, open Face ID Review and confirm the page shows only the check-in queue (no Registrations tab) and that the "Reset Face ID" button on a row (if any test data exists) opens the confirm modal.

- [ ] **Step 6: Final commit if any fixes were needed during verification**

If Steps 1-5 required any fixes, stage and commit them:

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(face-id): address issues found during verification

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018qdNmHJTqnxaivtMfBhZEW
EOF
)"
```
