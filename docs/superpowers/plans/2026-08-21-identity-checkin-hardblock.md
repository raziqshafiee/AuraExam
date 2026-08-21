# Identity Check-In Hard Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the exam-lobby identity check from fail-soft to a hard block with a supervisor-reviewable queue and bounded auto-admit timeout, plus two smaller additive items (aggregate trust score, stricter profile-photo framing).

**Architecture:** New `identity_checkin_queue` table gates the `startExam` submission-insert path. `faceVerify`'s lobby-failure branch queues instead of fail-soft-passing. Lecturer/admin get a Clear/Reject queue UI; the student gets a polling waiting screen. Trust score is computed client-side, purely, from data already loaded on the monitor page — no schema change needed for it.

**Tech Stack:** TanStack Start server functions, Supabase/Postgres (pg driver in migration scripts), React, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-identity-checkin-hardblock-design.md`

## Global Constraints

- Applies only to exams with `require_identity_verification = true`.
- Applies only to `context: "lobby"` in `faceVerify` — in-exam/submit re-checks stay fail-soft, unchanged.
- No new session-token/JWT mechanism — Supabase auth session remains the only session.
- No pg_cron / background job for the auto-admit timeout — evaluate lazily on read, matching this codebase's existing `syncExamStatuses`-style client-triggered-fallback convention.
- Worktree: `C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match` (branch `worktree-face-match`). Run `npx tsc --noEmit`, `npm run test` (vitest), targeted `eslint`, and `npm run build` after each task; fix any new error before moving on (diff against a `git stash`/`git stash pop` baseline run if a lint/tsc error looks pre-existing, matching the process used earlier in this branch's history — the `db()`-cast-to-`any` and `catch (err: any)` patterns throughout `face.ts`/`exams.ts` are intentional per CLAUDE.md, not bugs to fix).

---

### Task 1: Trust-score pure function

**Files:**
- Create: `src/lib/proctor/trust-score.ts`
- Test: `src/tests/lib/trust-score.test.ts`

**Interfaces:**
- Produces: `computeTrustScore(flagReasons: { type: string }[]): number` — returns an integer 0–100, used by Task 8 (client-side, from data the monitor page already loads).

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/lib/trust-score.test.ts
import { describe, it, expect } from "vitest";
import { computeTrustScore } from "@/lib/proctor/trust-score";

describe("computeTrustScore", () => {
  it("returns 100 for no flags at all", () => {
    expect(computeTrustScore([])).toBe(100);
  });

  it("subtracts 15 per hard flag (tab-switch, copy-paste, fullscreen-exit, multiple-faces)", () => {
    expect(computeTrustScore([{ type: "tab-switch" }])).toBe(85);
    expect(computeTrustScore([{ type: "copy-paste" }, { type: "fullscreen-exit" }])).toBe(70);
  });

  it("subtracts 5 per advisory flag (face-missing, camera-lost, gaze-away, head-turned)", () => {
    expect(computeTrustScore([{ type: "gaze-away" }])).toBe(95);
    expect(computeTrustScore([{ type: "face-missing" }, { type: "camera-lost" }, { type: "head-turned" }])).toBe(85);
  });

  it("subtracts 10 for a time-window (late submission) flag", () => {
    expect(computeTrustScore([{ type: "time-window" }])).toBe(90);
  });

  it("subtracts 5 for an unrecognized flag type (safe default, never crashes)", () => {
    expect(computeTrustScore([{ type: "some-future-flag-type" }])).toBe(95);
  });

  it("clamps at 0 rather than going negative", () => {
    const many = Array.from({ length: 10 }, () => ({ type: "tab-switch" }));
    expect(computeTrustScore(many)).toBe(0);
  });

  it("mixes flag types correctly", () => {
    expect(
      computeTrustScore([{ type: "tab-switch" }, { type: "gaze-away" }, { type: "time-window" }]),
    ).toBe(100 - 15 - 5 - 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx vitest run src/tests/lib/trust-score.test.ts`
Expected: FAIL — `Cannot find module '@/lib/proctor/trust-score'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/proctor/trust-score.ts
//
// Pure, client-computable trust score for lecturer/admin review screens —
// additive to (not a replacement of) the existing flags/flag_reasons
// 3-strike mechanic. No I/O: the monitor/results pages already load
// per-submission flagReasons, so this is computed from data already in
// memory, no new server function or schema needed.

const HARD_FLAG_TYPES = new Set(["tab-switch", "copy-paste", "fullscreen-exit", "multiple-faces"]);
const ADVISORY_FLAG_TYPES = new Set(["face-missing", "camera-lost", "gaze-away", "head-turned"]);

const HARD_WEIGHT = 15;
const ADVISORY_WEIGHT = 5;
const TIME_WINDOW_WEIGHT = 10;
const DEFAULT_WEIGHT = 5; // unrecognized future flag types — never crash, never ignore

function weightFor(type: string): number {
  if (HARD_FLAG_TYPES.has(type)) return HARD_WEIGHT;
  if (ADVISORY_FLAG_TYPES.has(type)) return ADVISORY_WEIGHT;
  if (type === "time-window") return TIME_WINDOW_WEIGHT;
  return DEFAULT_WEIGHT;
}

export function computeTrustScore(flagReasons: { type: string }[]): number {
  const penalty = flagReasons.reduce((sum, f) => sum + weightFor(f.type), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx vitest run src/tests/lib/trust-score.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match"
git add src/lib/proctor/trust-score.ts src/tests/lib/trust-score.test.ts
git commit -m "feat: add pure trust-score computation for lecturer/admin review"
```

---

### Task 2: Profile-photo framing quality gate

**Files:**
- Modify: `src/lib/face/quality.ts`
- Modify: `src/components/brand/photo-upload.tsx`
- Test: `src/tests/lib/face-quality-framing.test.ts`

**Interfaces:**
- Consumes: `DescriptorResult` type from `src/lib/face/descriptor.ts` (unchanged — has `boxArea: number`, `faceCount: number`, `detectorScore: number`).
- Produces: `passesProfilePhotoQualityGate(r: DescriptorResult | null): { ok: boolean; reason?: string }` — new export from `quality.ts`, used only by the profile-photo upload step. The existing `passesQualityGate` (used by card-photo upload and live-capture) is untouched — a card's printed photo is naturally much smaller within the frame and would never pass a 50–70%-height bound.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/lib/face-quality-framing.test.ts
import { describe, it, expect } from "vitest";
import { passesProfilePhotoQualityGate } from "@/lib/face/quality";
import type { DescriptorResult } from "@/lib/face/descriptor";

function makeResult(overrides: Partial<DescriptorResult>): DescriptorResult {
  return {
    descriptor: [1, 2, 3],
    antispoofScore: 0.9,
    livenessScore: 0.9,
    faceCount: 1,
    boxArea: 0.3,
    detectorScore: 0.9,
    ...overrides,
  };
}

describe("passesProfilePhotoQualityGate", () => {
  it("passes a well-framed face (boxArea within 0.50-0.70)", () => {
    expect(passesProfilePhotoQualityGate(makeResult({ boxArea: 0.6 })).ok).toBe(true);
  });

  it("rejects a face that's too small in frame (below 0.50)", () => {
    const r = passesProfilePhotoQualityGate(makeResult({ boxArea: 0.2 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/closer|zoom/i);
  });

  it("rejects a face that's too large/cropped in frame (above 0.70)", () => {
    const r = passesProfilePhotoQualityGate(makeResult({ boxArea: 0.85 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/back|far/i);
  });

  it("still rejects zero or multiple faces the same way the base gate does", () => {
    expect(passesProfilePhotoQualityGate(makeResult({ faceCount: 0, boxArea: 0.6 })).ok).toBe(false);
    expect(passesProfilePhotoQualityGate(makeResult({ faceCount: 2, boxArea: 0.6 })).ok).toBe(false);
  });

  it("still rejects a low detector-confidence frame the same way the base gate does", () => {
    expect(passesProfilePhotoQualityGate(makeResult({ boxArea: 0.6, detectorScore: 0.5 })).ok).toBe(false);
  });

  it("rejects a null result", () => {
    expect(passesProfilePhotoQualityGate(null).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx vitest run src/tests/lib/face-quality-framing.test.ts`
Expected: FAIL — `passesProfilePhotoQualityGate is not a function` / not exported

- [ ] **Step 3: Write minimal implementation**

Read the current `src/lib/face/quality.ts` first (it's short — `passesQualityGate` plus two constants). Add below the existing function, without changing it:

```typescript
// Stricter framing bound for the profile-photo upload step specifically —
// this photo becomes the primary biometric reference (see verify-identity.tsx),
// so "too small/zoomed-out" and "too large/cropped" both matter here in a way
// they don't for the card photo (whose printed face is naturally tiny within
// the frame) or live-capture (already gated by MIN_BOX_AREA/MIN_DETECTOR_SCORE
// via the base gate above, which this reuses for everything except the area check).
const PROFILE_MIN_BOX_AREA = 0.5;
const PROFILE_MAX_BOX_AREA = 0.7;

export function passesProfilePhotoQualityGate(r: DescriptorResult | null): { ok: boolean; reason?: string } {
  if (!r) return { ok: false, reason: "No frame captured" };
  if (r.faceCount === 0) return { ok: false, reason: "No face detected — center yourself in the frame" };
  if (r.faceCount > 1) return { ok: false, reason: "More than one face detected" };
  if (r.detectorScore < MIN_DETECTOR_SCORE)
    return { ok: false, reason: "Image unclear — check lighting and hold still" };
  if (r.boxArea < PROFILE_MIN_BOX_AREA) return { ok: false, reason: "Move closer or zoom in — your face is too small in the frame" };
  if (r.boxArea > PROFILE_MAX_BOX_AREA) return { ok: false, reason: "Move back slightly — your face is too close/cropped in the frame" };
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx vitest run src/tests/lib/face-quality-framing.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Wire into the profile-photo upload step**

In `src/components/brand/photo-upload.tsx`, the component currently calls the shared `passesQualityGate` for every use (both card and profile steps call the same `<PhotoUpload>`). Add a `strictFraming?: boolean` prop, defaulting to `false`, and branch the gate call:

```typescript
import { passesQualityGate, passesProfilePhotoQualityGate } from "@/lib/face/quality";
```

In the props type, add `strictFraming?: boolean;` next to `accept?: string;`. In `handleFile`, replace:

```typescript
      const gate = passesQualityGate(result);
```

with:

```typescript
      const gate = strictFraming ? passesProfilePhotoQualityGate(result) : passesQualityGate(result);
```

(destructure `strictFraming = false` in the function's parameter list alongside `accept = "image/*"`.)

In `src/routes/_authenticated/student/verify-identity.tsx`, the `upload-profile` step's `<PhotoUpload>` call gains `strictFraming`:

```tsx
            <PhotoUpload
              guide="Your profile photo"
              strictFraming
              onCapture={(result, jpeg) => {
```

The `upload-card` step's `<PhotoUpload>` call is unchanged (no `strictFraming` prop — defaults to `false`, keeps using the base gate).

- [ ] **Step 6: Typecheck and lint**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx tsc --noEmit 2>&1 | grep -Ei "quality.ts|photo-upload|verify-identity"`
Expected: no output (clean)

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx eslint src/lib/face/quality.ts src/components/brand/photo-upload.tsx`
Expected: clean (or only the pre-existing `catch (err: any)` pattern, unrelated to this task)

- [ ] **Step 7: Commit**

```bash
cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match"
git add src/lib/face/quality.ts src/components/brand/photo-upload.tsx src/routes/_authenticated/student/verify-identity.tsx src/tests/lib/face-quality-framing.test.ts
git commit -m "feat: require stricter framing (50-70% box area) on profile-photo upload"
```

---

### Task 3: `identity_checkin_queue` migration + core server functions

**Files:**
- Create: `scripts/migrate-identity-checkin.ts`
- Modify: `package.json` (add `migrate:identity-checkin` script)
- Modify: `src/lib/supabase/face.ts`

**Interfaces:**
- Consumes: `createAdminClient` from `./admin-client`, `createClient` from `./server`, `pushNotification` from `./notifications`, `writeAudit` from `./audit` (all already imported in `face.ts`).
- Produces:
  - `getIdentityCheckinStatus({ data: { examId: string } })` → `{ status: "waiting" | "cleared" | "auto_admitted" | "rejected" | null }` (student-facing GET).
  - `getIdentityCheckinQueue()` → `{ id: string; studentName: string; matricNo: string; queuedAt: string }[]` (lecturer/admin GET).
  - `decideIdentityCheckin({ data: { queueId: string; decision: "clear" | "reject"; reason?: string } })` → `{ success: true }` (lecturer/admin POST).
  - `faceVerify`'s existing return type gains an optional `queued?: boolean` field when `context === "lobby"` and attempts are exhausted (Task 5 consumes this).

- [ ] **Step 1: Write the migration**

```typescript
// scripts/migrate-identity-checkin.ts
//
// Adds the identity_checkin_queue table for the exam-lobby hard-block
// redesign — see docs/superpowers/specs/2026-08-21-identity-checkin-hardblock-design.md.
import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running identity-checkin migration…");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS identity_checkin_queue (
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
  `);
  console.log("OK  identity_checkin_queue table created");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS identity_checkin_queue_exam_status_idx
      ON identity_checkin_queue (exam_id, status);
  `);
  console.log("OK  identity_checkin_queue_exam_status_idx created");

  await pool.query(`ALTER TABLE identity_checkin_queue ENABLE ROW LEVEL SECURITY;`);
  // No client policies at all — every access goes through createAdminClient()
  // inside an authorization-checked server function, same pattern as
  // face_enrollments/face_challenges.
  console.log("OK  RLS enabled, no client policies (service-role only)");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Register the npm script**

In `package.json`, add after the `"migrate:face-verification-v2"` line:

```json
    "migrate:identity-checkin": "tsx scripts/migrate-identity-checkin.ts",
```

- [ ] **Step 3: Run the migration**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npm run migrate:identity-checkin`
Expected: `OK` lines for both the table and index, then `Migration complete.`

- [ ] **Step 4: Change `faceVerify`'s lobby-failure branch**

Read `src/lib/supabase/face.ts` around the `faceVerify` handler first (search for `export const faceVerify`) to get exact current line numbers before editing — this file has grown across this session and line numbers drift.

Find the block that currently reads (fail-soft branch, inside the `!passed` handling):

```typescript
    if (!enrollment) {
      await notifyIdentityUnverified(supabase, admin, user.id, data.examId);
      return { passed: false, similarity: 0, attemptsRemaining: 0, elevated: true, guidance: "No active enrollment — open \"Face Match\" from the nav menu to enroll first." };
    }
```

Leave this one alone (no enrollment at all is a different case — still routes through `notifyIdentityUnverified` unchanged, per spec §4 which only discusses the *attempts-exhausted* branch, not the *no-enrollment* branch; the spec didn't call for changing this path and doing so isn't needed to hard-block entry with an active-enrollment mismatch specifically).

Find the block further down (still inside `faceVerify`, after `attemptsRemaining` is computed) that currently does something equivalent to routing `elevated: true` when `data.context === "lobby"` and `attemptsRemaining === 0` (search for `attemptsRemaining === 0` and `context !== "lobby"` near the `notifyIdentityUnverified` call at the end of the handler). Replace that lobby-exhausted branch with:

```typescript
    if (!passed && data.context === "lobby" && attemptsRemaining === 0) {
      const { data: existingQueue } = await (admin as any)
        .from("identity_checkin_queue")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("exam_id", data.examId)
        .maybeSingle();

      let queueId = existingQueue?.id;
      if (!existingQueue) {
        const { data: inserted, error: queueErr } = await (admin as any)
          .from("identity_checkin_queue")
          .insert({ user_id: user.id, exam_id: data.examId })
          .select("id")
          .single();
        if (queueErr) throw new Error(queueErr.message);
        queueId = inserted.id;
      } else if (existingQueue.status === "rejected") {
        // Terminal — do not re-queue, do not notify again.
        return { passed: false, similarity, attemptsRemaining: 0, elevated: false, queued: false, rejected: true, guidance: "Your identity could not be confirmed. Contact your lecturer." };
      }
      // Re-queuing (existingQueue.status === "waiting"/"cleared"/"auto_admitted")
      // never overwrites queued_at — only the initial insert sets it, per
      // spec §6 ("re-queuing doesn't reset the timeout").

      await notifyIdentityUnverified(supabase, admin, user.id, data.examId);

      return {
        passed: false,
        similarity: Math.round(similarity * 1000) / 1000,
        attemptsRemaining: 0,
        elevated: false,
        queued: true,
        queueId,
        guidance: "You're in the review queue — your lecturer has been notified.",
      };
    }
```

Place this branch so it runs BEFORE the existing generic `if (!passed && (data.context !== "lobby" || attemptsRemaining === 0))` notification block that calls `notifyIdentityUnverified` a second time — the lobby-exhausted case now returns early above, so that later generic block's `data.context !== "lobby"` half still fires normally for `in_exam`/`submit` (unchanged), and its `attemptsRemaining === 0` half never double-fires for lobby since this new branch already returned. Verify this by re-reading the full function after editing to confirm no double-notification path remains for `context === "lobby"`.

- [ ] **Step 5: Add `getIdentityCheckinStatus`**

Add after `faceVerify`'s closing `});` in `src/lib/supabase/face.ts`:

```typescript
// GET: student-facing poll target for the waiting screen. Also where the
// 5-minute auto-admit timeout is evaluated LAZILY (no cron) — matches this
// codebase's existing client-triggered-fallback convention.
const AUTO_ADMIT_MS = 5 * 60_000;

export const getIdentityCheckinStatus = createServerFn({ method: "GET" })
  .inputValidator((data: { examId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const admin = createAdminClient();
    const { data: row } = await (admin as any)
      .from("identity_checkin_queue")
      .select("id, status, queued_at")
      .eq("user_id", user.id)
      .eq("exam_id", data.examId)
      .maybeSingle();

    if (!row) return { status: null as null };

    if (row.status === "waiting" && Date.now() - new Date(row.queued_at).getTime() > AUTO_ADMIT_MS) {
      await (admin as any)
        .from("identity_checkin_queue")
        .update({ status: "auto_admitted", cleared_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "waiting"); // no-op if a supervisor decided concurrently
      return { status: "auto_admitted" as const };
    }

    return { status: row.status as "waiting" | "cleared" | "auto_admitted" | "rejected" };
  });
```

- [ ] **Step 6: Add `getIdentityCheckinQueue`**

```typescript
// GET: lecturer/admin-facing list of students currently waiting. Lecturer
// sees only their own classes' students (same class_enrollments join
// pattern as getLecturerFaceReviewQueue above); admin sees everyone.
export const getIdentityCheckinQueue = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await db(supabase).from("profiles").select("role").eq("id", user.id).single();

  const admin = createAdminClient();
  let studentIds: string[] | null = null; // null = no scoping (admin)

  if (profile?.role === "lecturer") {
    const { data: myClasses } = await db(supabase).from("classes").select("id").eq("lecturer_id", user.id);
    const classIds = (myClasses ?? []).map((c: any) => c.id);
    if (classIds.length === 0) return [];
    const { data: enrollments } = await db(supabase).from("class_enrollments").select("student_id").in("class_id", classIds);
    studentIds = [...new Set((enrollments ?? []).map((e: any) => e.student_id))];
    if (studentIds.length === 0) return [];
  } else if (profile?.role !== "admin") {
    throw new Error("Forbidden");
  }

  let query = (admin as any)
    .from("identity_checkin_queue")
    .select("id, user_id, queued_at")
    .eq("status", "waiting")
    .order("queued_at", { ascending: true });
  if (studentIds) query = query.in("user_id", studentIds);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const userIds = [...new Set((rows ?? []).map((r: any) => r.user_id))];
  const { data: profiles } = userIds.length
    ? await (admin as any).from("profiles").select("id, name, matric_no").in("id", userIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return (rows ?? []).map((r: any) => {
    const p = profileById.get(r.user_id);
    return {
      id: r.id,
      studentName: p?.name ?? "Unknown",
      matricNo: p?.matric_no ?? "",
      queuedAt: r.queued_at,
    };
  });
});
```

- [ ] **Step 7: Add `decideIdentityCheckin`**

```typescript
// POST: lecturer (own students only) or admin (anyone) clears or rejects a
// queued student. WHERE status = 'waiting' on the update guards against two
// supervisors deciding concurrently — the second call becomes a no-op.
export const decideIdentityCheckin = createServerFn({ method: "POST" })
  .inputValidator((data: { queueId: string; decision: "clear" | "reject"; reason?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await db(supabase).from("profiles").select("role").eq("id", user.id).single();

    const admin = createAdminClient();
    const { data: row } = await (admin as any)
      .from("identity_checkin_queue")
      .select("id, user_id, exam_id, status")
      .eq("id", data.queueId)
      .single();
    if (!row || row.status !== "waiting") throw new Error("This entry is not awaiting review");

    const isAdmin = profile?.role === "admin";
    if (!isAdmin) {
      if (profile?.role !== "lecturer") throw new Error("Forbidden");
      const { data: myClasses } = await db(supabase).from("classes").select("id").eq("lecturer_id", user.id);
      const classIds = (myClasses ?? []).map((c: any) => c.id);
      const { data: scoped } = classIds.length
        ? await (admin as any).from("class_enrollments").select("student_id").in("class_id", classIds).eq("student_id", row.user_id).maybeSingle()
        : { data: null };
      if (!scoped) throw new Error("Forbidden — this student is not enrolled in any of your classes");
    }

    const newStatus = data.decision === "clear" ? "cleared" : "rejected";
    const { error } = await (admin as any)
      .from("identity_checkin_queue")
      .update({ status: newStatus, cleared_by: user.id, cleared_at: new Date().toISOString(), reject_reason: data.decision === "reject" ? (data.reason ?? null) : null })
      .eq("id", data.queueId)
      .eq("status", "waiting");
    if (error) throw new Error(error.message);

    if (data.decision === "reject") {
      await writeAudit(user.id, { action: "Rejected exam identity check-in", target: row.user_id, category: "identity" });
    }

    await pushNotification(supabase, {
      userId: row.user_id,
      type: "identity_checkin_decided",
      title: data.decision === "clear" ? "You're cleared to start" : "Identity check-in rejected",
      body: data.decision === "clear" ? "Your identity was manually confirmed — you may now start the exam." : (data.reason ?? "Contact your lecturer."),
    });

    return { success: true as const };
  });
```

- [ ] **Step 8: Typecheck**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx tsc --noEmit 2>&1 | grep -i "face.ts"`
Expected: only pre-existing `Property 'role'/'name' does not exist on type 'never'` noise consistent with the rest of this file (the stale `database.types.ts` issue documented in CLAUDE.md) — no NEW error categories introduced by this task's additions. If unsure whether an error is pre-existing, `git stash` and re-run `tsc --noEmit` on the baseline to compare, then `git stash pop`.

- [ ] **Step 9: Commit**

```bash
cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match"
git add scripts/migrate-identity-checkin.ts package.json src/lib/supabase/face.ts
git commit -m "feat: add identity_checkin_queue table and queue server functions"
```

---

### Task 4: Gate `startExam` on queue status

**Files:**
- Modify: `src/lib/supabase/exams.ts`

**Interfaces:**
- Consumes: `identity_checkin_queue` table (Task 3).
- Produces: `startExam` throws `"Your identity check-in is still pending — please wait for it to clear."` or `"Your identity could not be confirmed for this exam. Contact your lecturer."` instead of creating a submission, when applicable.

- [ ] **Step 1: Read the current `startExam` handler**

Re-read `src/lib/supabase/exams.ts` around line 1232 (`export const startExam`) to confirm current line numbers before editing — this file may have shifted since this plan was written.

- [ ] **Step 2: Add `require_identity_verification` to the exam lookup**

Change:

```typescript
    const { data: examCheck } = await db(supabase)
      .from("exams")
      .select("status, class_id")
      .eq("id", examId)
      .single();
```

to:

```typescript
    const { data: examCheck } = await db(supabase)
      .from("exams")
      .select("status, class_id, require_identity_verification")
      .eq("id", examId)
      .single();
```

- [ ] **Step 3: Add the gate before the initial-insert branch**

The initial-insert branch is the code after `if (existing.data) { ... return ...; }` — i.e., only reached when no submission exists yet for this (student, exam). Immediately before the `const { data: pointRows } = ...` query that starts building the new submission, insert:

```typescript
    if (!existing.data && examCheck.require_identity_verification) {
      const admin = createAdminClient();
      const { data: queueRow } = await (admin as any)
        .from("identity_checkin_queue")
        .select("status")
        .eq("user_id", user.id)
        .eq("exam_id", examId)
        .maybeSingle();
      if (queueRow?.status === "waiting") {
        throw new Error("Your identity check-in is still pending — please wait for it to clear.");
      }
      if (queueRow?.status === "rejected") {
        throw new Error("Your identity could not be confirmed for this exam. Contact your lecturer.");
      }
      // No row, or status is 'cleared'/'auto_admitted' — proceed.
    }
```

Check the top of `exams.ts` for an existing `createAdminClient` import (`import { createAdminClient } from "./admin-client";` or similar) before adding a new one — this codebase already uses that client in several files, exams.ts may or may not currently import it. Add the import only if it's missing.

- [ ] **Step 4: Typecheck**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx tsc --noEmit 2>&1 | grep -i "exams.ts"`
Expected: only pre-existing noise (same caveat as Task 3 Step 8), no new categories.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match"
git add src/lib/supabase/exams.ts
git commit -m "feat: block startExam's initial submission insert on pending/rejected check-in"
```

---

### Task 5: Student waiting/rejected UI in `IdentityGate`

**Files:**
- Modify: `src/components/brand/identity-gate.tsx`

**Interfaces:**
- Consumes: `getIdentityCheckinStatus` (Task 3), `faceVerify`'s new `queued`/`rejected` response fields (Task 3 Step 4).
- Produces: `onPassed(elevated: boolean)` callback semantics are UNCHANGED for the pass/client-failsoft/server-failsoft-exhausted-without-lobby cases; the lobby-exhausted case now does NOT call `onPassed` at all (it used to call `onPassed(true)` to let the student proceed anyway) — it instead shows the waiting/rejected UI and only calls `onPassed(false)` once cleared/auto-admitted.

- [ ] **Step 1: Re-read the current file**

Re-read `src/components/brand/identity-gate.tsx` in full before editing (it's ~154 lines) to get exact current content — do not assume the version quoted earlier in this session's history is still byte-identical.

- [ ] **Step 2: Add queue polling state and the two new UI states**

Add to the imports:

```typescript
import { getIdentityCheckinStatus } from "@/lib/supabase/face";
```

Add to the `state` union (currently `"idle" | "checking" | "passed" | "retry" | "failsoft"`):

```typescript
  const [state, setState] = useState<"idle" | "checking" | "passed" | "retry" | "failsoft" | "queued" | "rejected">("idle");
```

In `runCheck`, find the branch that currently handles `res.attemptsRemaining === 0` (the `else` after `if (res.passed) {...} else if (res.attemptsRemaining > 0) {...}`) — currently something like:

```typescript
      } else {
        // Server-authoritative fail-soft: ...
        setFailsoftReason("server");
        setState("failsoft");
        onPassed(true);
      }
```

Replace with a branch on the new `res.queued`/`res.rejected` fields (from Task 3's `faceVerify` change) instead of unconditionally treating exhausted-attempts as fail-soft:

```typescript
      } else if ((res as any).rejected) {
        setState("rejected");
      } else if ((res as any).queued) {
        setState("queued");
        startPolling();
      } else {
        // Non-lobby context (or the no-enrollment case) still fail-softs exactly as before.
        setFailsoftReason("server");
        setState("failsoft");
        onPassed(true);
      }
```

Add a polling effect and function inside the component (near the other refs/state):

```typescript
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startPolling() {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await getIdentityCheckinStatus({ data: { examId } });
        if (res.status === "cleared" || res.status === "auto_admitted") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setState("passed");
          onPassed(false);
        } else if (res.status === "rejected") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setState("rejected");
        }
      } catch {
        // Transient poll failure — try again on the next tick, don't surface an error.
      }
    }, 10_000);
  }

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);
```

Add render branches alongside the existing `state === "failsoft"` block:

```tsx
      {state === "queued" && (
        <p className="text-sm text-sky flex items-center gap-1.5">
          <Loader2 className="w-4 h-4 animate-spin" /> Waiting for your lecturer to confirm your identity — you'll be let in automatically within 5 minutes even if nobody responds sooner.
        </p>
      )}
      {state === "rejected" && (
        <p className="text-sm text-pink">Your identity could not be confirmed for this exam. Contact your lecturer.</p>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx tsc --noEmit 2>&1 | grep -i "identity-gate"`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match"
git add src/components/brand/identity-gate.tsx
git commit -m "feat: replace lobby fail-soft with waiting/rejected queue states in IdentityGate"
```

---

### Task 6: Lecturer queue UI section

**Files:**
- Modify: `src/routes/_authenticated/lecturer/identity-sessions.tsx`

**Interfaces:**
- Consumes: `getIdentityCheckinQueue`, `decideIdentityCheckin` (Task 3).

- [ ] **Step 1: Re-read the current file**

Re-read `src/routes/_authenticated/lecturer/identity-sessions.tsx` in full — it already has a `ReviewRow` component pattern from the OCR-mismatch section added earlier this session; this task adds a third, parallel section rather than modifying the existing two.

- [ ] **Step 2: Add the import and loader field**

```typescript
import { getIdentityCheckinQueue, decideIdentityCheckin } from "@/lib/supabase/face";
```

Extend the `loader`'s returned object with `checkinQueue: await getIdentityCheckinQueue()`, and destructure `checkinQueue: initialCheckinQueue` alongside the existing `classes`/`reviewQueue` destructuring at the top of the component. Add `const [checkinQueue, setCheckinQueue] = useState(initialCheckinQueue);` and a `async function refreshCheckinQueue() { setCheckinQueue(await getIdentityCheckinQueue()); }`.

- [ ] **Step 3: Add the section JSX**

After the existing "Card review" `PageHeader`/`Card` block, add:

```tsx
      <PageHeader badge="Face Match" title="Exam check-in queue" subtitle="Students blocked from starting an exam until identity is confirmed." />
      <Card className="max-w-xl space-y-4">
        {checkinQueue.length === 0 ? (
          <Empty title="Nothing waiting" hint="Students stuck at exam check-in will show up here." />
        ) : (
          <div className="space-y-3">
            {checkinQueue.map((item) => (
              <CheckinRow key={item.id} item={item} onDecided={refreshCheckinQueue} />
            ))}
          </div>
        )}
      </Card>
```

Add the `CheckinRow` component at the bottom of the file, alongside `ReviewRow`:

```tsx
function CheckinRow({
  item,
  onDecided,
}: {
  item: Awaited<ReturnType<typeof getIdentityCheckinQueue>>[number];
  onDecided: () => void;
}) {
  async function decide(decision: "clear" | "reject") {
    await decideIdentityCheckin({ data: { queueId: item.id, decision } });
    toast.success(decision === "clear" ? "Cleared" : "Rejected");
    onDecided();
  }

  return (
    <div className="border-2 border-ink rounded-xl p-3 space-y-2">
      <div className="font-display font-bold">{item.studentName}</div>
      <div className="text-xs font-mono text-muted-foreground">
        {item.matricNo} · waiting since {new Date(item.queuedAt).toLocaleTimeString()}
      </div>
      <div className="flex gap-2">
        <WakeoutButton variant="primary" size="sm" onClick={() => decide("clear")}>Clear</WakeoutButton>
        <WakeoutButton variant="destructive" size="sm" onClick={() => decide("reject")}>Reject</WakeoutButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx tsc --noEmit 2>&1 | grep -i "identity-sessions"`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match"
git add src/routes/_authenticated/lecturer/identity-sessions.tsx
git commit -m "feat: add exam check-in queue section to lecturer identity-sessions page"
```

---

### Task 7: Admin queue UI section

**Files:**
- Modify: `src/routes/_authenticated/admin/identity.index.tsx`

**Interfaces:**
- Consumes: `getIdentityCheckinQueue`, `decideIdentityCheckin` (Task 3) — same functions as Task 6; admin calling them gets the unscoped (all-students) result per Task 3's authorization logic.

- [ ] **Step 1: Re-read the current file**

Re-read `src/routes/_authenticated/admin/identity.index.tsx` in full.

- [ ] **Step 2: Extend the loader and add the section**

Same pattern as Task 6: import `getIdentityCheckinQueue, decideIdentityCheckin` from `@/lib/supabase/face`, add `checkinQueue: await getIdentityCheckinQueue()` to the route's `loader`, destructure it in the component, hold it in `useState`, add a refresh function, and render a second `PageHeader`/`Card` section below the existing enrollment-review list using the SAME `CheckinRow`-style component defined for Task 6 — copy that component's implementation into this file too (route files in this codebase are independent leaf components; there's no shared sub-component import between the two review pages for `ReviewRow` either, so this matches existing project convention rather than introducing premature sharing across two files that would otherwise need a new shared components file for one small component).

- [ ] **Step 3: Typecheck**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx tsc --noEmit 2>&1 | grep -i "identity.index"`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match"
git add src/routes/_authenticated/admin/identity.index.tsx
git commit -m "feat: add exam check-in queue section to admin identity review page"
```

---

### Task 8: Surface trust score on the lecturer monitor page

**Files:**
- Modify: `src/routes/_authenticated/lecturer/exams.$examId.monitor.tsx`

**Interfaces:**
- Consumes: `computeTrustScore` (Task 1) — called client-side with `s.flagReasons` (`FlagReason[]`, already loaded per submission by this page's existing loader — no server change needed).

- [ ] **Step 1: Add the import**

```typescript
import { computeTrustScore } from "@/lib/proctor/trust-score";
```

- [ ] **Step 2: Compute and display it per student card**

Inside the `sortedSubmissions.map((s: any) => { ... })` block, alongside the existing `const flags = s.flags ?? 0; const flagReasons: FlagReason[] = s.flagReasons ?? [];` lines, add:

```typescript
            const trustScore = computeTrustScore(flagReasons);
```

In the status panel JSX, alongside the existing "Identity" row (`<span className="text-[10px] font-mono text-muted-foreground">Identity</span> <IdentityBadge .../>`), add a trust-score row directly below it:

```tsx
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground">Trust score</span>
                      <span className={`text-xs font-mono font-bold ${trustScore >= 80 ? "text-green-700" : trustScore >= 50 ? "text-amber-700" : "text-pink"}`}>
                        {trustScore}/100
                      </span>
                    </div>
```

- [ ] **Step 3: Typecheck**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx tsc --noEmit 2>&1 | grep -i "exams.\$examId.monitor"`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match"
git add src/routes/_authenticated/lecturer/exams.\$examId.monitor.tsx
git commit -m "feat: surface computed trust score per student on the lecturer monitor page"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx vitest run`
Expected: all tests pass, including the new `trust-score.test.ts` (7 tests) and `face-quality-framing.test.ts` (6 tests) — total should be 119 (prior count) + 13 = 132.

- [ ] **Step 2: Full typecheck**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npx tsc --noEmit`
Expected: same error count/content as the pre-Task-1 baseline plus zero new categories. If unsure, `git log --oneline -12` to find the commit before Task 1, then spot-check each touched file's new tsc output against what Task-level steps already confirmed clean.

- [ ] **Step 3: Full lint on touched files**

Run:
```bash
cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match"
export NODE_OPTIONS=--max-old-space-size=8192
npx eslint src/lib/proctor/trust-score.ts src/lib/face/quality.ts src/components/brand/photo-upload.tsx src/routes/_authenticated/student/verify-identity.tsx src/lib/supabase/face.ts src/lib/supabase/exams.ts src/components/brand/identity-gate.tsx src/routes/_authenticated/lecturer/identity-sessions.tsx "src/routes/_authenticated/admin/identity.index.tsx" "src/routes/_authenticated/lecturer/exams.\$examId.monitor.tsx" src/tests/lib/trust-score.test.ts src/tests/lib/face-quality-framing.test.ts
```
Expected: only the pre-existing `@typescript-eslint/no-explicit-any` (established `(x as any)`/`catch (err: any)` convention throughout this codebase, documented in CLAUDE.md) — no other rule violations. Run `npx prettier --write <touched files>` first if formatting-only errors appear (CRLF/spacing), matching this branch's established workflow.

- [ ] **Step 4: Production build**

Run: `cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match" && npm run build`
Expected: `✓ built in <N>s`, no errors. Spot-check `.output/public` doesn't gain any unexpected large new client bundle (this task adds no new heavy client dependency).

- [ ] **Step 5: Manual smoke check via the running dev server**

The dev server for this worktree should already be running (background task from earlier in this session). Confirm `getIdentityCheckinQueue`/`decideIdentityCheckin`/`getIdentityCheckinStatus` compile and hot-reload without SSR errors by tailing its log after each Task's edits land. If the dev server isn't running, start it with `npm run dev` from this worktree and confirm `/student/exams/$examId/lobby`, `/lecturer/identity-sessions`, and `/admin/identity` all render without console errors — full end-to-end click-through (actually failing a check-in and clearing it from another role's session) requires a browser, which may not be available; note explicitly in the final report whether this step was actually exercised in a browser or only confirmed via hot-reload/no-SSR-error, per this session's established "say so explicitly rather than claiming success" standard for UI verification.

- [ ] **Step 6: Final commit (if any cleanup remains)**

```bash
cd "C:\Users\Raziq Shafiee\Desktop\Exam\.claude\worktrees\face-match"
git status
# If anything is unstaged (formatting fixes, etc.), stage and commit it:
git add -A
git commit -m "chore: formatting/lint fixups from full verification pass"
```
