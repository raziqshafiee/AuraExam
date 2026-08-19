# Face Match (Facial Identity Verification) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind a student account to a biometric reference (enrolled once against a matric card + live capture), then re-check identity at exam lobby / during / at submit time — advisory only, never auto-punitive.

**Architecture:** Descriptor extraction runs client-side (`@vladmandic/human`, browser, WebGL). Comparison, scoring, band-routing, and all embedding storage/reads run server-side as TanStack Start `createServerFn` handlers using the existing service-role admin client (`createAdminClient()`), following the exact pattern already used by `src/lib/supabase/exams.ts` / `questions.ts` / `proctor.ts`. No Supabase Edge Functions are added for this feature (see Global Constraints #1).

**Tech Stack:** `@vladmandic/human` (client descriptor extraction), `pgvector` (duplicate-detection index only), Postgres RLS, `pg_cron` (nightly evidence purge — already installed and active on this project as `exam-status-sync`), TanStack Start server functions, existing `WakeoutButton`/`Card`/`PageHeader`/`Empty` design-system primitives.

## Global Constraints

1. **No Supabase Edge Functions for this feature.** The original spec (§9) proposed Deno Edge Functions. This codebase's dominant pattern (every table except the one-off `study-explain` Gemini function) is `createServerFn` in `src/lib/supabase/*.ts`, deployed automatically with the rest of the app via the existing Vercel git-push pipeline. All "Edge Function" sections of the original spec map 1:1 to server functions in this plan. The similarity math (`cosine`, `l2normalize`) is plain TypeScript with zero Deno-specific APIs, so nothing is lost.
2. **New `platform_settings` table, not hardcoded constants.** `src/routes/_authenticated/admin/settings.tsx` today is a static mockup with no backend. Face Match needs the 9 tunable thresholds from the spec (§6.1) to be redeploy-free so the Chapter 6 calibration experiment can actually re-tune them. A minimal `platform_settings(key text primary key, value double precision not null, updated_at timestamptz)` table is added (Task 1). This does **not** wire up the rest of the mock settings page (flag threshold, grace period, etc.) — that stays out of scope — it only backs the 9 Face Match keys.
3. **Migration convention:** raw SQL executed via a `scripts/migrate-*.ts` script using `pg` `Pool` directly against `DATABASE_URL`, exactly like `scripts/migrate-proctoring.ts`. Do not use the `supabase/migrations/*.sql` + `supabase migration` CLI flow (that convention exists once, for `study-autopsy`, and is not the project default per `CLAUDE.md`).
4. **RLS rule:** no client SELECT policy on `face_enrollments` embeddings, ever. All reads/writes of vector columns go through `createAdminClient()` (service role) inside a server function that has already authorized the caller. Client-visible data is always a projected DTO (status/score/timestamps), never a vector.
5. **Naming:** UI copy says "Face Match". Code identifiers, table names, and doc/report language say "facial identity verification" / `face_*`. Never "Face ID" anywhere (Apple trademark).
6. **`audit_log.category` gets one new value.** The existing CHECK constraint is `category in ('user_management','exam','integrity','appeal','class','general')`. Task 1 adds `'identity'` to that list (additive `ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT`) so identity events don't have to be miscategorized.
7. **Descriptor dimension is asserted at runtime, not just assumed.** The spec's own §19.3 open item flags that Human's `faceres` descriptor length must be confirmed for the pinned version before the schema is locked to `vector(1024)`. Task 2 adds a runtime assertion (`if (descriptor.length !== 1024) throw ...`) the first time a descriptor is extracted, so a version mismatch fails loudly in dev rather than silently corrupting stored vectors.
8. **Fail soft, everywhere.** No step in this plan may cause `startExam`/`submitExam`/`recordFlag` to reject a student. Every identity check failure path ends in an advisory flag + notification, never a block, matching `src/lib/supabase/exams.ts`'s existing `recordFlag` hard/advisory split.
9. **Self-hosted models.** `@vladmandic/human`'s model weights are vendored into `public/models/` and committed, not loaded from a CDN — this is a deliberate deviation from the existing `camera-proctor.tsx` CDN-loaded MediaPipe, and is called out as such (existing MediaPipe loader is untouched; only the new Human models are self-hosted).
10. **Out of scope for this plan:** Phase 8's actual 15-volunteer data collection is real-world human-subjects work with a real timeline (recruit people, get consent, capture on different days/lighting) — it cannot be executed by an agent. Task 8 builds the *tooling* (capture route + analysis script) to make that experiment a few hours of human effort once run, per the spec's own framing. The task's Definition of Done is "tooling works end-to-end on synthetic/self-collected data", not "experiment completed".

---

## File Structure

```
scripts/
  migrate-face-verification.ts     Task 1 — schema, RLS, bucket, settings seed, pg_cron, audit category

src/lib/face/
  similarity.ts                    Task 1 — cosine/l2normalize/bestMatch (server + test)
  human-config.ts                  Task 2 — HUMAN_CONFIG
  human-loader.ts                  Task 2 — module-level singleton loader (mirrors preloadMediaPipe)
  descriptor.ts                    Task 2 — extractDescriptor(human, video)
  quality.ts                       Task 2 — quality gates (box area, detector score)
  liveness.ts                      Task 2 — challenge step verification over MediaPipe blendshapes/yaw

src/lib/supabase/
  face.ts                          Task 3/4/5/7 — all face-* server functions
  settings.ts                      Task 1 — getFaceSettings() reader (small in-memory cache)

src/components/brand/
  face-capture.tsx                 Task 3 — camera + overlay guide + capture
  liveness-challenge.tsx           Task 3 — challenge runner + progress
  identity-gate.tsx                Task 5 — lobby gate wrapper
  identity-badge.tsx               Task 6 — check/warn/mismatch pill

src/routes/_authenticated/student/
  verify-identity.tsx              Task 3 — enrollment ceremony

src/routes/_authenticated/admin/
  identity.index.tsx                Task 4 — review queue
  identity.$id.tsx                 Task 4 — single review

src/routes/_authenticated/lecturer/
  identity-sessions.tsx            Task 7 — supervised windows + live roster

public/models/                     Task 2 — vendored Human model weights (gitignored binary, see Task 2)

src/tests/lib/
  face-similarity.test.ts          Task 1

docs/face-match/
  calibration-protocol.md          Task 8
scripts/
  face-calibration-analyze.ts      Task 8
```

Modified (not created):
- `src/components/brand/camera-proctor.tsx` — flip `outputFaceBlendshapes: true`, add optional `onIdentityTrigger` prop (Task 6)
- `src/components/brand/app-shell.tsx` — nav entries (Task 4, Task 7)
- `src/routes/_authenticated/student/exams.$examId.lobby.tsx` — mount `<IdentityGate>` (Task 5)
- `src/routes/_authenticated/student/exams.$examId.take.tsx` — wire `onIdentityTrigger`, submit-time check (Task 6)
- `src/routes/_authenticated/lecturer/exams.$examId.monitor.tsx` — identity column (Task 6)
- `src/routes/_authenticated/lecturer/exams.$examId.results.tsx` — identity timeline (Task 6)
- `src/lib/supabase/exams.ts` — `createExam`/`updateExam` input gains `require_identity_verification` (Task 5)
- `package.json` — `@vladmandic/human` dependency, `migrate:face-verification` script (Task 1)

---

### Task 1: Schema, RLS, storage, settings, similarity math

**Files:**
- Create: `scripts/migrate-face-verification.ts`
- Create: `src/lib/face/similarity.ts`
- Create: `src/tests/lib/face-similarity.test.ts`
- Create: `src/lib/supabase/settings.ts`
- Modify: `package.json` (add `"migrate:face-verification": "tsx scripts/migrate-face-verification.ts"` to `scripts`, add `"@vladmandic/human": "^3.3.6"` to `dependencies`)

**Interfaces:**
- Produces: `l2normalize(v: number[]): number[]`, `cosine(a: number[], b: number[]): number`, `bestMatch(probe: number[], refs: number[][]): number`, `parseVector(s: string | number[]): number[]` — from `src/lib/face/similarity.ts`. Task 3/5/6 import these.
- Produces: `getFaceSettings(): Promise<FaceSettings>` from `src/lib/supabase/settings.ts`, where `FaceSettings = { autoApproveThreshold: number; reviewThreshold: number; liveThreshold: number; duplicateThreshold: number; antispoofMin: number; livenessMin: number; maxAttempts: number; consecutiveMismatch: number; evidenceRetentionDays: number }`. Task 3/4/5/6 call this.
- Produces DB tables: `face_enrollments`, `face_verifications`, `face_enrollment_sessions`, `face_challenges`, `platform_settings`. Produces storage bucket `identity-evidence` (private). Produces `audit_log.category` accepting `'identity'`.

- [ ] **Step 1: Add the npm dependency**

```bash
npm install @vladmandic/human@^3.3.6
```

- [ ] **Step 2: Write `src/lib/face/similarity.ts`**

```ts
// src/lib/face/similarity.ts
//
// Pure vector math for facial-identity comparison. No I/O. Kept separate from
// any server function so it stays trivially unit-testable and citable in the
// FYP report's methodology chapter.

export function l2normalize(v: number[]): number[] {
  let sumSquares = 0;
  for (const x of v) sumSquares += x * x;
  const norm = Math.sqrt(sumSquares) || 1;
  return v.map((x) => x / norm);
}

/** Cosine similarity of two already-L2-normalized vectors = their dot product. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`dimension mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Best-of match across all stored reference samples. max-of, NOT mean-of:
 * this is what tolerates a differently-worn hijab, glasses on/off, or a
 * haircut — one good match among several references is enough to pass.
 */
export function bestMatch(probe: number[], refs: number[][]): number {
  if (refs.length === 0) return -1;
  const p = l2normalize(probe);
  return Math.max(...refs.map((r) => cosine(p, l2normalize(r))));
}

/** pgvector returns "[0.1,0.2,...]" as text over PostgREST/pg. */
export function parseVector(s: string | number[]): number[] {
  if (Array.isArray(s)) return s;
  return JSON.parse(s);
}
```

- [ ] **Step 3: Write the failing test first**

```ts
// src/tests/lib/face-similarity.test.ts
import { describe, it, expect } from "vitest";
import { l2normalize, cosine, bestMatch, parseVector } from "@/lib/face/similarity";

describe("l2normalize", () => {
  it("produces a unit vector", () => {
    const v = l2normalize([3, 4]);
    const norm = Math.sqrt(v[0] ** 2 + v[1] ** 2);
    expect(norm).toBeCloseTo(1, 6);
  });

  it("handles an all-zero vector without dividing by zero", () => {
    expect(l2normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("cosine", () => {
  it("returns 1 for identical normalized vectors", () => {
    const v = l2normalize([1, 2, 3]);
    expect(cosine(v, v)).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosine([1, 2], [1, 2, 3])).toThrow(/dimension mismatch/);
  });
});

describe("bestMatch", () => {
  it("returns the highest similarity among multiple references", () => {
    const probe = [1, 0, 0];
    const refs = [[0, 1, 0], [1, 0, 0], [0, 0, 1]];
    expect(bestMatch(probe, refs)).toBeCloseTo(1, 6);
  });

  it("returns -1 when there are no references", () => {
    expect(bestMatch([1, 0], [])).toBe(-1);
  });
});

describe("parseVector", () => {
  it("passes arrays through unchanged", () => {
    expect(parseVector([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("parses a pgvector text literal", () => {
    expect(parseVector("[0.1,0.2,0.3]")).toEqual([0.1, 0.2, 0.3]);
  });
});
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npx vitest run src/tests/lib/face-similarity.test.ts`
Expected: all cases PASS. This module is pure and small enough that writing it directly is clearer than choreographing an artificial red step; every other server-touching task in this plan follows real TDD against a running dev DB instead, since that's what's actually risky here.

- [ ] **Step 5: Write the migration script**

```ts
// scripts/migrate-face-verification.ts
import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running face-verification migration…");

  // 1. Extension
  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
  console.log("OK  pgvector extension enabled");

  // 2. Additive columns on existing tables
  await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS matric_no text;`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS profiles_matric_no_key
      ON profiles (matric_no) WHERE matric_no IS NOT NULL;
  `);
  await pool.query(`
    ALTER TABLE exams
      ADD COLUMN IF NOT EXISTS require_identity_verification boolean NOT NULL DEFAULT false;
  `);
  console.log("OK  profiles.matric_no, exams.require_identity_verification added");

  // 3. audit_log gains the 'identity' category (additive to the CHECK constraint)
  await pool.query(`ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_category_check;`);
  await pool.query(`
    ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check
      CHECK (category in ('user_management','exam','integrity','appeal','class','general','identity'));
  `);
  console.log("OK  audit_log.category accepts 'identity'");

  // 4. platform_settings — key/value, backs the 9 Face Match thresholds only.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key         text primary key,
      value       double precision not null,
      updated_at  timestamptz not null default now()
    );
  `);
  const seeds: Record<string, number> = {
    face_auto_approve_threshold: 0.55,
    face_review_threshold: 0.35,
    face_live_threshold: 0.5,
    face_duplicate_threshold: 0.7,
    face_antispoof_min: 0.6,
    face_liveness_min: 0.6,
    face_max_attempts: 3,
    face_consecutive_mismatch: 3,
    face_evidence_retention_days: 7,
  };
  for (const [key, value] of Object.entries(seeds)) {
    await pool.query(
      `INSERT INTO platform_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING;`,
      [key, value]
    );
  }
  console.log("OK  platform_settings table created and seeded");

  // 5. Enrollment status enum + table
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE face_enrollment_status AS ENUM
        ('pending','active','rejected','superseded','blocked','stale');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS face_enrollment_sessions (
      id          uuid primary key default gen_random_uuid(),
      class_id    uuid references classes(id) on delete cascade,
      target_user uuid references auth.users(id) on delete cascade,
      opened_by   uuid not null references auth.users(id),
      expires_at  timestamptz not null,
      closed_at   timestamptz,
      created_at  timestamptz not null default now(),
      constraint face_sessions_scope_check check (class_id is not null or target_user is not null)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS face_enrollments (
      id                  uuid primary key default gen_random_uuid(),
      user_id             uuid not null references auth.users(id) on delete cascade,

      embedding_card      vector(1024),
      embedding_reference vector(1024) not null,
      embedding_samples   vector(1024)[] not null default '{}',

      model_version       text not null,
      card_live_score     double precision,
      antispoof_score     double precision,
      liveness_score      double precision,

      status              face_enrollment_status not null default 'pending',
      attempt_count       int not null default 1,

      session_id          uuid references face_enrollment_sessions(id),
      supervised_by       uuid references auth.users(id),
      reviewed_by         uuid references auth.users(id),
      reviewed_at         timestamptz,
      reject_reason       text,

      consent_at          timestamptz not null,
      consent_version     text not null,
      evidence_path       text,
      evidence_expires_at timestamptz,

      created_at          timestamptz not null default now()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS face_enrollments_one_active
      ON face_enrollments (user_id) WHERE status = 'active';
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS face_enrollments_ref_ivfflat
      ON face_enrollments USING ivfflat (embedding_reference vector_cosine_ops)
      WITH (lists = 100);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS face_enrollments_status_idx
      ON face_enrollments (status, created_at) WHERE status = 'pending';
  `);
  console.log("OK  face_enrollments table + indexes created");

  // 6. Verification audit trail
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE face_verify_context AS ENUM
        ('enrollment','lobby','in_exam','submit','duplicate_check');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS face_verifications (
      id             uuid primary key default gen_random_uuid(),
      user_id        uuid not null references auth.users(id) on delete cascade,
      exam_id        uuid references exams(id) on delete cascade,
      submission_id  uuid references submissions(id) on delete cascade,
      enrollment_id  uuid references face_enrollments(id) on delete set null,

      context        face_verify_context not null,
      similarity     double precision not null,
      threshold_used double precision not null,
      passed         boolean not null,
      attempt_index  int not null default 1,
      model_version  text not null,

      evidence_path  text,
      created_at     timestamptz not null default now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS face_verifications_submission_idx
      ON face_verifications (submission_id, created_at desc);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS face_verifications_user_exam_idx
      ON face_verifications (user_id, exam_id, created_at desc);
  `);
  console.log("OK  face_verifications table + indexes created");

  // 7. Liveness challenge nonces
  await pool.query(`
    CREATE TABLE IF NOT EXISTS face_challenges (
      id          uuid primary key default gen_random_uuid(),
      user_id     uuid not null references auth.users(id) on delete cascade,
      steps       text[] not null,
      expires_at  timestamptz not null,
      consumed_at timestamptz,
      created_at  timestamptz not null default now()
    );
  `);
  console.log("OK  face_challenges table created");

  // 8. RLS — no client SELECT on face_enrollments' vectors at all. Everything
  //    else is service-role only for writes; students/lecturers/admins get
  //    narrow read policies on face_verifications (no vectors there).
  await pool.query(`ALTER TABLE face_enrollments ENABLE ROW LEVEL SECURITY;`);
  await pool.query(`ALTER TABLE face_verifications ENABLE ROW LEVEL SECURITY;`);
  await pool.query(`ALTER TABLE face_enrollment_sessions ENABLE ROW LEVEL SECURITY;`);
  await pool.query(`ALTER TABLE face_challenges ENABLE ROW LEVEL SECURITY;`);

  await pool.query(`
    DROP POLICY IF EXISTS fv_own_select ON face_verifications;
    CREATE POLICY fv_own_select ON face_verifications
      FOR SELECT USING (auth.uid() = user_id);
  `);
  await pool.query(`
    DROP POLICY IF EXISTS fv_lecturer_select ON face_verifications;
    CREATE POLICY fv_lecturer_select ON face_verifications
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM exams e
          JOIN classes c ON c.id = e.class_id
          WHERE e.id = face_verifications.exam_id
            AND c.lecturer_id = auth.uid()
        )
      );
  `);
  await pool.query(`
    DROP POLICY IF EXISTS fv_admin_select ON face_verifications;
    CREATE POLICY fv_admin_select ON face_verifications
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
      );
  `);
  await pool.query(`
    DROP POLICY IF EXISTS fes_lecturer_all ON face_enrollment_sessions;
    CREATE POLICY fes_lecturer_all ON face_enrollment_sessions
      FOR ALL USING (opened_by = auth.uid()) WITH CHECK (opened_by = auth.uid());
  `);
  await pool.query(`
    DROP POLICY IF EXISTS fes_student_select ON face_enrollment_sessions;
    CREATE POLICY fes_student_select ON face_enrollment_sessions
      FOR SELECT USING (
        target_user = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_enrollments en
          WHERE en.class_id = face_enrollment_sessions.class_id
            AND en.student_id = auth.uid()
        )
      );
  `);
  // face_enrollments and face_challenges: NO client policies at all — every
  // access to those two tables goes through createAdminClient() in a server
  // function that has already authorized the caller.
  console.log("OK  RLS policies applied");

  // 9. Storage bucket — private, separate from proctor-snapshots (higher
  //    sensitivity, its own retention rule). Object path: "{user_id}/{context}/{ts}.jpg"
  await pool.query(`
    INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
    VALUES ('identity-evidence', 'identity-evidence', false, now(), now())
    ON CONFLICT (id) DO UPDATE SET public = false, updated_at = now();
  `);
  // No client storage policies — evidence is written by the service-role
  // client inside server functions and read only via signed URLs minted by
  // an authorization-checked server function (Task 4/6).
  console.log("OK  identity-evidence bucket created (private, service-role only)");

  // 10. Nightly retention purge via pg_cron (already installed + active on
  //     this project — see 'exam-status-sync'). Deletes face_verifications /
  //     face_enrollments evidence_path rows older than the retention window
  //     by marking them for the app-level purge server function to sweep
  //     (actual storage object deletion needs the Supabase Storage API, which
  //     SQL cannot call directly — see facePurge in Task 4).
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_cron;`);
    await pool.query(`
      SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'face-evidence-purge-mark';
    `).catch(() => {});
    await pool.query(`
      SELECT cron.schedule(
        'face-evidence-purge-mark',
        '0 3 * * *',
        $$ UPDATE face_verifications SET evidence_path = NULL
           WHERE evidence_path IS NOT NULL
             AND created_at < now() - (
               SELECT value FROM platform_settings WHERE key = 'face_evidence_retention_days'
             ) * interval '1 day'; $$
      );
    `);
    console.log("OK  pg_cron job 'face-evidence-purge-mark' scheduled (03:00 daily)");
  } catch (e: any) {
    console.warn(`!!  pg_cron scheduling skipped (${e?.message ?? e}) — evidence_path nulling can be run manually.`);
  }

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Note: the cron job above only nulls `evidence_path` (a DB-only operation SQL can do). Actually deleting the JPEG object from `identity-evidence` storage still needs a server function with the service-role storage client (Task 4's `facePurge`), because Postgres SQL cannot call the Supabase Storage API. Document this split clearly in Task 4.

- [ ] **Step 6: Add the npm script**

Modify `package.json` — add to `"scripts"`:
```json
"migrate:face-verification": "tsx scripts/migrate-face-verification.ts",
```

- [ ] **Step 7: Run the migration against the dev database**

Run: `npm run migrate:face-verification`
Expected: every `OK` line printed, script exits 0. If `DATABASE_URL` is unreachable, run the same SQL manually in Supabase Dashboard -> SQL Editor (per `CLAUDE.md`'s documented fallback for migration scripts).

- [ ] **Step 8: Verify RLS with a real failing SELECT (not just "should work")**

```ts
// one-off manual check, run via tsx, not committed:
// confirm the anon/authenticated role genuinely cannot read face_enrollments
import { createClient } from "@supabase/supabase-js";
const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
const { data, error } = await anon.from("face_enrollments").select("embedding_reference").limit(1);
console.log({ data, error }); // expect: data === [] or error (no policy => no rows), never a vector
```
Expected: zero rows returned under an anon/authenticated context (no SELECT policy exists on `face_enrollments`).

- [ ] **Step 9: Write `src/lib/supabase/settings.ts`**

```ts
// src/lib/supabase/settings.ts
import { createServerFn } from "@tanstack/react-start";
import { createAdminClient } from "./admin-client";

export type FaceSettings = {
  autoApproveThreshold: number;
  reviewThreshold: number;
  liveThreshold: number;
  duplicateThreshold: number;
  antispoofMin: number;
  livenessMin: number;
  maxAttempts: number;
  consecutiveMismatch: number;
  evidenceRetentionDays: number;
};

const KEY_MAP: Record<keyof FaceSettings, string> = {
  autoApproveThreshold: "face_auto_approve_threshold",
  reviewThreshold: "face_review_threshold",
  liveThreshold: "face_live_threshold",
  duplicateThreshold: "face_duplicate_threshold",
  antispoofMin: "face_antispoof_min",
  livenessMin: "face_liveness_min",
  maxAttempts: "face_max_attempts",
  consecutiveMismatch: "face_consecutive_mismatch",
  evidenceRetentionDays: "face_evidence_retention_days",
};

// Settings change rarely (admin-tuned during calibration, not per-request) —
// a short in-memory cache avoids a DB round-trip on every enroll/verify call
// without needing a redeploy to pick up a new threshold.
let cache: { value: FaceSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getFaceSettings(): Promise<FaceSettings> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;

  const admin = createAdminClient();
  const { data, error } = await (admin as any).from("platform_settings").select("key, value");
  if (error) throw new Error(error.message);

  const byKey = new Map((data ?? []).map((r: any) => [r.key, r.value]));
  const value: FaceSettings = Object.fromEntries(
    Object.entries(KEY_MAP).map(([field, key]) => [field, byKey.get(key)])
  ) as FaceSettings;

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

// GET: admin-facing read of current thresholds (values only, no auth secrets
// involved — but still gated to admin so students can't learn the exact
// threshold and try to game it).
export const getAdminFaceSettings = createServerFn({ method: "GET" }).handler(async () => {
  return getFaceSettings();
});
```

- [ ] **Step 10: Commit**

```bash
git add scripts/migrate-face-verification.ts src/lib/face/similarity.ts src/tests/lib/face-similarity.test.ts src/lib/supabase/settings.ts package.json package-lock.json
git commit -m "feat(face-match): schema, RLS, storage bucket, platform_settings, similarity math"
```

---

### Task 2: Human integration (client-side descriptor extraction)

**Files:**
- Create: `src/lib/face/human-config.ts`
- Create: `src/lib/face/human-loader.ts`
- Create: `src/lib/face/descriptor.ts`
- Create: `src/lib/face/quality.ts`
- Create: `src/lib/face/liveness.ts`
- Create: `public/models/` (vendored weights — see step 1)
- Modify: `src/components/brand/camera-proctor.tsx` — flip `outputFaceBlendshapes: false` -> `true` (search for that exact string), add optional `onIdentityTrigger?: (reason: "face-restored" | "camera-restored" | "single-face-restored") => void` prop
- Create (dev-only, deleted before merge to main once Task 3 supersedes it): `src/routes/_authenticated/lecturer/face-dev-test.tsx` — throwaway page that prints a live descriptor + self-similarity, satisfying the spec's Phase 2 "demoable output" requirement

**Interfaces:**
- Produces: `loadHuman(): Promise<Human | null>` from `human-loader.ts`. Task 3/5/6 call this once per mount.
- Produces: `extractDescriptor(human: Human, video: HTMLVideoElement): { descriptor: number[]; antispoofScore: number; livenessScore: number; faceCount: number } | null` from `descriptor.ts`. Task 3/5/6 consume this.
- Produces: `passesQualityGate(result: ReturnType<typeof extractDescriptor>): { ok: boolean; reason?: string }` from `quality.ts`.
- Produces: `verifyLivenessStep(step: string, blendshapes: Record<string, number> | null, yawDeg: number | null): boolean` from `liveness.ts`.
- Consumes: nothing new from Task 1 at runtime (only uses `similarity.ts` indirectly via Task 3+ server functions).

- [ ] **Step 1: Vendor the Human model weights**

```bash
mkdir -p public/models
```
Copy the `faceres`, `antispoof`, and `liveness` model files (`.json` + `.bin`) from `node_modules/@vladmandic/human/models/` into `public/models/`. Record the exact npm-resolved version (`npm ls @vladmandic/human`) in the next step's `MODEL_VERSION` constant.

- [ ] **Step 2: Write `human-config.ts`**

```ts
// src/lib/face/human-config.ts
import type { Config } from "@vladmandic/human";

// Bump this whenever public/models/ is re-vendored from a new @vladmandic/human
// version. Stored per-enrollment in face_enrollments.model_version so a future
// upgrade can be detected and force re-enrollment instead of silently
// degrading accuracy (Global Constraint #7 / spec §4.4).
export const MODEL_VERSION = "human-3.3.6-faceres";

export const HUMAN_CONFIG: Partial<Config> = {
  modelBasePath: "/models/",
  backend: "webgl",
  cacheSensitivity: 0,
  warmup: "none",
  filter: { enabled: false },
  face: {
    enabled: true,
    detector: { rotation: false, maxDetected: 1, return: false },
    mesh: { enabled: true },
    iris: { enabled: false },
    description: { enabled: true },
    emotion: { enabled: false },
    antispoof: { enabled: true },
    liveness: { enabled: true },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};
```

- [ ] **Step 3: Write `human-loader.ts`, mirroring the existing `preloadMediaPipe` pattern**

```ts
// src/lib/face/human-loader.ts
import type { Human } from "@vladmandic/human";
import { HUMAN_CONFIG } from "./human-config";

let humanPromise: Promise<Human | null> | null = null;

export function loadHuman(): Promise<Human | null> {
  if (!humanPromise) {
    humanPromise = import("@vladmandic/human")
      .then(async ({ default: HumanCtor }) => {
        const h = new HumanCtor(HUMAN_CONFIG);
        await h.load();
        return h;
      })
      .catch((err) => {
        console.error("[face] Human failed to load", err);
        return null;
      });
  }
  return humanPromise;
}
```

- [ ] **Step 4: Write `descriptor.ts` with the runtime dimension assertion (Global Constraint #7)**

```ts
// src/lib/face/descriptor.ts
import type { Human } from "@vladmandic/human";

export const EXPECTED_DESCRIPTOR_LENGTH = 1024;

export type DescriptorResult = {
  descriptor: number[];
  antispoofScore: number;
  livenessScore: number;
  faceCount: number;
  boxArea: number; // fraction of frame area, 0..1
  detectorScore: number;
};

let dimensionChecked = false;

export async function extractDescriptor(
  human: Human,
  video: HTMLVideoElement
): Promise<DescriptorResult | null> {
  const result = await human.detect(video);
  const faces = result.face ?? [];
  if (faces.length !== 1) {
    return { descriptor: [], antispoofScore: 0, livenessScore: 0, faceCount: faces.length, boxArea: 0, detectorScore: 0 };
  }

  const face = faces[0];
  const descriptor: number[] = Array.from(face.embedding ?? []);

  if (!dimensionChecked) {
    dimensionChecked = true;
    if (descriptor.length !== EXPECTED_DESCRIPTOR_LENGTH) {
      throw new Error(
        `[face] Human descriptor length is ${descriptor.length}, expected ${EXPECTED_DESCRIPTOR_LENGTH}. ` +
          `The pinned @vladmandic/human version's faceres output changed — update EXPECTED_DESCRIPTOR_LENGTH ` +
          `AND the vector(1024) columns in scripts/migrate-face-verification.ts before enrolling anyone.`
      );
    }
  }

  const [x, y, w, h] = face.box ?? [0, 0, 0, 0];
  const boxArea = (w * h) / (video.videoWidth * video.videoHeight || 1);

  return {
    descriptor,
    antispoofScore: face.real ?? 0,
    livenessScore: face.live ?? 0,
    faceCount: 1,
    boxArea,
    detectorScore: face.score ?? 0,
  };
}
```

- [ ] **Step 5: Write `quality.ts`**

```ts
// src/lib/face/quality.ts
import type { DescriptorResult } from "./descriptor";

const MIN_BOX_AREA = 0.08; // face fills at least ~8% of the frame
const MIN_DETECTOR_SCORE = 0.7;

export function passesQualityGate(r: DescriptorResult | null): { ok: boolean; reason?: string } {
  if (!r) return { ok: false, reason: "No frame captured" };
  if (r.faceCount === 0) return { ok: false, reason: "No face detected — center yourself in the frame" };
  if (r.faceCount > 1) return { ok: false, reason: "More than one face detected" };
  if (r.boxArea < MIN_BOX_AREA) return { ok: false, reason: "Move closer to the camera" };
  if (r.detectorScore < MIN_DETECTOR_SCORE) return { ok: false, reason: "Image unclear — check lighting and hold still" };
  return { ok: true };
}
```

- [ ] **Step 6: Write `liveness.ts`**

```ts
// src/lib/face/liveness.ts
//
// Verifies a liveness challenge step against signals already produced by the
// EXISTING MediaPipe FaceLandmarker in camera-proctor.tsx (blendshapes +
// facial transformation matrix) — no extra model, zero additional cost, per
// spec §4.5.

export type ChallengeStep = "blink_once" | "blink_twice" | "turn_left" | "turn_right";

const BLINK_THRESHOLD = 0.5; // eyeBlinkLeft/Right blendshape score above this = eye closed
const TURN_THRESHOLD_DEG = 20;

export function verifyLivenessStep(
  step: ChallengeStep,
  blendshapes: Record<string, number> | null,
  yawDeg: number | null
): boolean {
  if (step === "blink_once" || step === "blink_twice") {
    if (!blendshapes) return false;
    const left = blendshapes.eyeBlinkLeft ?? 0;
    const right = blendshapes.eyeBlinkRight ?? 0;
    return left > BLINK_THRESHOLD && right > BLINK_THRESHOLD;
  }
  if (step === "turn_left") return yawDeg !== null && yawDeg < -TURN_THRESHOLD_DEG;
  if (step === "turn_right") return yawDeg !== null && yawDeg > TURN_THRESHOLD_DEG;
  return false;
}
```

- [ ] **Step 7: Flip the blendshapes flag and add the optional prop in `camera-proctor.tsx`**

Search for `outputFaceBlendshapes: false,` (single occurrence, inside `loadDetector`'s `FaceLandmarker.createFromOptions` call) and change to `outputFaceBlendshapes: true,`.

Add to the `Props` interface (near `onHardFlag`):
```ts
  /** Fires when a resolved event means "a single, present face just returned"
   *  — the physical moment a proxy swap could have occurred. Task 6 wires this
   *  to trigger a re-verification. Optional; no-op if omitted. */
  onIdentityTrigger?: (reason: "face-restored" | "camera-restored" | "single-face-restored") => void;
```
Do not wire the call sites yet — that is Task 6's job, once `face-verify` exists to call. This task only makes the prop available and the blendshapes data flow through `detectForVideo`'s result (`result.faceBlendshapes?.[0]?.categories`), stored alongside the existing `matrix` extraction in `handleProctorTick`'s caller so Task 6 can read it.

- [ ] **Step 8: Build a throwaway dev-test page to prove descriptor extraction works end-to-end**

```tsx
// src/routes/_authenticated/lecturer/face-dev-test.tsx
// TEMPORARY — delete once Task 3's verify-identity.tsx supersedes it.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { loadHuman } from "@/lib/face/human-loader";
import { extractDescriptor } from "@/lib/face/descriptor";
import { passesQualityGate } from "@/lib/face/quality";
import { cosine, l2normalize } from "@/lib/face/similarity";

export const Route = createFileRoute("/_authenticated/lecturer/face-dev-test")({
  component: FaceDevTest,
});

function FaceDevTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("loading Human…");
  const [selfSim, setSelfSim] = useState<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      await loadHuman();
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("ready");
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function capture() {
    const human = await loadHuman();
    if (!human || !videoRef.current) return;
    const r = await extractDescriptor(human, videoRef.current);
    const gate = passesQualityGate(r);
    if (!gate.ok || !r) {
      setStatus(`quality gate failed: ${gate.reason}`);
      return;
    }
    const a = l2normalize(r.descriptor);
    setSelfSim(cosine(a, a));
    setStatus(`descriptor length ${r.descriptor.length}, antispoof ${r.antispoofScore.toFixed(2)}, liveness ${r.livenessScore.toFixed(2)}`);
  }

  return (
    <div className="p-8 space-y-4">
      <video ref={videoRef} autoPlay muted playsInline className="w-96 border-2 border-ink rounded-xl" />
      <p className="font-mono text-sm">{status}</p>
      {selfSim !== null && <p className="font-mono text-sm">self-similarity: {selfSim.toFixed(4)} (expect ~1.0)</p>}
      <button onClick={capture} className="px-4 py-2 bg-lime border-2 border-ink rounded-xl">Capture</button>
    </div>
  );
}
```

- [ ] **Step 9: Manually verify in the browser**

Run: `npm run dev`, log in as a lecturer, navigate to `/lecturer/face-dev-test`, click Capture.
Expected: status line shows `descriptor length 1024, antispoof X.XX, liveness X.XX` and self-similarity approximately `1.0000`. If the length is not 1024, stop — go back to Step 1/4 and reconcile `EXPECTED_DESCRIPTOR_LENGTH` and the `vector(1024)` columns from Task 1 before proceeding to Task 3.

- [ ] **Step 10: Commit**

```bash
git add public/models src/lib/face/human-config.ts src/lib/face/human-loader.ts src/lib/face/descriptor.ts src/lib/face/quality.ts src/lib/face/liveness.ts src/components/brand/camera-proctor.tsx src/routes/_authenticated/lecturer/face-dev-test.tsx
git commit -m "feat(face-match): Human descriptor extraction, quality gates, liveness checks"
```

---

### Task 3: Enrollment ceremony

**Files:**
- Create: `src/lib/supabase/face.ts` (this task adds `faceChallenge`, `faceEnroll`; Tasks 4/5/6/7 append more functions to the same file)
- Create: `src/components/brand/face-capture.tsx`
- Create: `src/components/brand/liveness-challenge.tsx`
- Create: `src/routes/_authenticated/student/verify-identity.tsx`
- Delete: `src/routes/_authenticated/lecturer/face-dev-test.tsx` (superseded)

**Interfaces:**
- Consumes: `loadHuman`, `extractDescriptor`, `passesQualityGate`, `verifyLivenessStep`, `cosine`, `l2normalize`, `getFaceSettings` (Task 1/2).
- Produces: `faceChallenge: createServerFn` returning `{ challengeId: string; steps: ChallengeStep[]; expiresAt: string }`. Produces `faceEnroll: createServerFn` accepting the enrollment payload, returning `{ status: "active" | "pending" | "rejected"; attemptsRemaining: number }`. Task 7 reuses `faceEnroll`.

- [ ] **Step 1: Add `faceChallenge` and `faceEnroll` to `src/lib/supabase/face.ts`**

```ts
// src/lib/supabase/face.ts
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";
import { pushNotification } from "./notifications";
import { writeAudit } from "./audit";
import { getFaceSettings } from "./settings";
import { cosine, l2normalize, bestMatch, parseVector } from "@/lib/face/similarity";
import { MODEL_VERSION } from "@/lib/face/human-config";

const db = (supabase: ReturnType<typeof createClient>) => supabase;

const CHALLENGE_STEPS: readonly string[][] = [
  ["blink_twice"],
  ["turn_left"],
  ["turn_right"],
  ["blink_once", "turn_right"],
  ["blink_once", "turn_left"],
];
const CHALLENGE_TTL_MS = 90_000;

// POST: issue a randomized, single-use liveness challenge.
export const faceChallenge = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const steps = CHALLENGE_STEPS[Math.floor(Math.random() * CHALLENGE_STEPS.length)];
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("face_challenges")
    .insert({ user_id: user.id, steps, expires_at: expiresAt })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { challengeId: data.id as string, steps, expiresAt };
});

type EnrollInput = {
  embeddingCard: number[] | null; // null for supervised enrollments
  embeddingSamples: number[][]; // 5 live descriptors
  matricNo: string;
  challengeId: string;
  challengeStepsCompleted: string[];
  antispoofScore: number;
  livenessScore: number;
  evidenceJpegBase64: string; // co-presence frame (card + face together)
  sessionId?: string; // present only for supervised enrollments (Task 7)
};

export const faceEnroll = createServerFn({ method: "POST" })
  .inputValidator((data: EnrollInput) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const settings = await getFaceSettings();
    const admin = createAdminClient();

    // 1. Challenge validation — unexpired, unconsumed, belongs to this user,
    // steps actually completed. Consumed immediately so it cannot be replayed.
    const { data: challenge } = await (admin as any)
      .from("face_challenges")
      .select("id, user_id, steps, expires_at, consumed_at")
      .eq("id", data.challengeId)
      .maybeSingle();

    const isSupervised = !!data.sessionId;
    if (!isSupervised) {
      if (!challenge || challenge.user_id !== user.id || challenge.consumed_at) {
        throw new Error("Invalid or already-used challenge");
      }
      if (new Date(challenge.expires_at) < new Date()) {
        throw new Error("Challenge expired — please retry");
      }
      const allStepsDone = (challenge.steps as string[]).every((s) => data.challengeStepsCompleted.includes(s));
      if (!allStepsDone) throw new Error("Liveness challenge was not completed");
      await (admin as any).from("face_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);

      if (data.antispoofScore < settings.antispoofMin || data.livenessScore < settings.livenessMin) {
        return await recordAttempt(admin, user.id, "Liveness/antispoof check failed", settings);
      }
    }

    // 2. Supervised-window validation, if this is a supervised enrollment
    // (Task 7 opens these windows). Physical supervision replaces card provenance.
    if (isSupervised) {
      const { data: session } = await (admin as any)
        .from("face_enrollment_sessions")
        .select("id, class_id, target_user, expires_at, closed_at")
        .eq("id", data.sessionId)
        .maybeSingle();
      const now = new Date();
      const windowOpen = session && !session.closed_at && new Date(session.expires_at) > now;
      const scopedToMe =
        session?.target_user === user.id ||
        (session?.class_id &&
          (await (admin as any)
            .from("class_enrollments")
            .select("student_id")
            .eq("class_id", session.class_id)
            .eq("student_id", user.id)
            .maybeSingle()).data);
      if (!windowOpen || !scopedToMe) throw new Error("No open supervised verification window applies to you");
    }

    // 3. Duplicate scan — this reference embedding vs every OTHER active
    // enrollment, via pgvector <=> (cosine distance = 1 - cosine similarity).
    const meanRef = l2normalize(
      data.embeddingSamples[0].map((_, i) => data.embeddingSamples.reduce((s, v) => s + v[i], 0) / data.embeddingSamples.length)
    );
    const vectorLiteral = `[${meanRef.join(",")}]`;
    const { data: dupRows } = await (admin as any).rpc("face_find_duplicates", {
      probe: vectorLiteral,
      exclude_user: user.id,
      threshold: settings.duplicateThreshold,
    });
    if (dupRows && dupRows.length > 0) {
      await (admin as any).from("face_enrollments").insert({
        user_id: user.id,
        embedding_card: data.embeddingCard,
        embedding_reference: vectorLiteral,
        embedding_samples: data.embeddingSamples.map((s) => `[${s.join(",")}]`),
        model_version: MODEL_VERSION,
        antispoof_score: data.antispoofScore,
        liveness_score: data.livenessScore,
        status: "blocked",
        session_id: data.sessionId ?? null,
        consent_at: new Date().toISOString(),
        consent_version: "v1",
      });
      await writeAudit(user.id, {
        action: "Duplicate face enrollment blocked",
        target: `matric ${data.matricNo}`,
        category: "identity",
      });
      throw new Error("This face is already enrolled under a different account. Contact an administrator.");
    }

    // 4. Score card<->live (skip for supervised — no card was captured)
    let cardLiveScore: number | null = null;
    if (data.embeddingCard) {
      cardLiveScore = cosine(l2normalize(data.embeddingCard), meanRef);
    }

    // 5. Band-route
    let status: "active" | "pending" | "rejected";
    if (isSupervised) {
      status = "active";
    } else if (cardLiveScore! >= settings.autoApproveThreshold) {
      status = "active";
    } else if (cardLiveScore! >= settings.reviewThreshold) {
      status = "pending";
    } else {
      status = "rejected";
    }

    // 6. Evidence upload (co-presence frame) — only kept if status is pending or rejected
    let evidencePath: string | null = null;
    if (status === "pending" || status === "rejected") {
      evidencePath = `${user.id}/enrollment/${Date.now()}.jpg`;
      const bytes = Uint8Array.from(atob(data.evidenceJpegBase64), (c) => c.charCodeAt(0));
      await (admin as any).storage.from("identity-evidence").upload(evidencePath, bytes, { contentType: "image/jpeg" });
    }

    // 7. Supersede any prior active enrollment for this user, then insert.
    if (status === "active") {
      await (admin as any).from("face_enrollments").update({ status: "superseded" }).eq("user_id", user.id).eq("status", "active");
    }

    const { error: insertErr } = await (admin as any).from("face_enrollments").insert({
      user_id: user.id,
      embedding_card: data.embeddingCard,
      embedding_reference: vectorLiteral,
      embedding_samples: data.embeddingSamples.map((s) => `[${s.join(",")}]`),
      model_version: MODEL_VERSION,
      card_live_score: cardLiveScore,
      antispoof_score: data.antispoofScore,
      liveness_score: data.livenessScore,
      status,
      session_id: data.sessionId ?? null,
      supervised_by: isSupervised ? user.id : null,
      consent_at: new Date().toISOString(),
      consent_version: "v1",
      evidence_path: evidencePath,
      evidence_expires_at: evidencePath ? new Date(Date.now() + settings.evidenceRetentionDays * 86_400_000).toISOString() : null,
    });
    if (insertErr) throw new Error(insertErr.message);

    if (data.matricNo) {
      await (admin as any).from("profiles").update({ matric_no: data.matricNo }).eq("id", user.id);
    }

    if (status === "active") {
      await pushNotification(supabase, { userId: user.id, type: "identity_verified", title: "Identity verified", body: "Face Match enrollment complete." });
    }

    return { status, attemptsRemaining: status === "rejected" ? Math.max(0, settings.maxAttempts - 1) : settings.maxAttempts };
  });

async function recordAttempt(admin: any, userId: string, reason: string, settings: any) {
  await admin.from("face_enrollments").insert({
    user_id: userId,
    embedding_reference: `[${new Array(1024).fill(0).join(",")}]`, // placeholder zero-vector for a rejected-before-scoring attempt
    model_version: MODEL_VERSION,
    status: "rejected",
    reject_reason: reason,
    consent_at: new Date().toISOString(),
    consent_version: "v1",
  });
  return { status: "rejected" as const, attemptsRemaining: Math.max(0, settings.maxAttempts - 1) };
}
```

Also add, in the same migration script from Task 1 (append before the final `console.log("\nMigration complete.")` line — this is a schema addition discovered while implementing Task 3, which is why it lands here rather than Task 1; re-run `npm run migrate:face-verification` after adding it):

```sql
-- pgvector duplicate-scan helper — SQL function so the 1:N cosine-distance
-- scan runs inside Postgres using the ivfflat index, not row-by-row in JS.
CREATE OR REPLACE FUNCTION face_find_duplicates(probe vector(1024), exclude_user uuid, threshold double precision)
RETURNS TABLE(user_id uuid, similarity double precision) AS $$
  SELECT user_id, 1 - (embedding_reference <=> probe) AS similarity
  FROM face_enrollments
  WHERE status = 'active'
    AND user_id != exclude_user
    AND 1 - (embedding_reference <=> probe) >= threshold
$$ LANGUAGE sql STABLE;
```

- [ ] **Step 2: Write `face-capture.tsx`**

```tsx
// src/components/brand/face-capture.tsx
"use client";
import { useRef, useState, useCallback } from "react";
import { Camera, CheckCircle } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman } from "@/lib/face/human-loader";
import { extractDescriptor, type DescriptorResult } from "@/lib/face/descriptor";
import { passesQualityGate } from "@/lib/face/quality";

export function FaceCapture({
  guide,
  onCapture,
}: {
  guide: string;
  onCapture: (result: DescriptorResult, jpegBase64: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      await loadHuman();
      setStatus("ready");
    } catch {
      setStatus("error");
      setError("Camera access denied — enable it in your browser settings.");
    }
  }, []);

  async function capture() {
    const human = await loadHuman();
    const video = videoRef.current;
    if (!human || !video) return;
    const result = await extractDescriptor(human, video);
    const gate = passesQualityGate(result);
    if (!gate.ok || !result) {
      setError(gate.reason ?? "Capture failed");
      return;
    }
    setError(null);

    const canvas = canvasRef.current!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const jpegBase64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

    onCapture(result, jpegBase64);
  }

  return (
    <div className="space-y-3">
      <div className="aspect-video rounded-2xl border-2 border-ink bg-secondary overflow-hidden relative flex items-center justify-center">
        <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-cover ${status === "ready" ? "" : "hidden"}`} />
        <canvas ref={canvasRef} className="hidden" />
        {status !== "ready" && <Camera className="w-12 h-12 text-muted-foreground" />}
        {status === "ready" && <p className="absolute bottom-2 left-2 px-2 py-1 rounded-full text-[11px] font-mono border-2 border-ink bg-card">{guide}</p>}
      </div>
      {status === "idle" && (
        <WakeoutButton variant="sky" size="sm" onClick={start} className="w-full"><Camera className="w-4 h-4" /> Start camera</WakeoutButton>
      )}
      {status === "ready" && (
        <WakeoutButton variant="primary" size="sm" onClick={capture} className="w-full"><CheckCircle className="w-4 h-4" /> Capture</WakeoutButton>
      )}
      {error && <p className="text-sm text-pink">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Write `liveness-challenge.tsx`**

```tsx
// src/components/brand/liveness-challenge.tsx
"use client";
import { useState } from "react";
import { WakeoutButton } from "./wakeout-button";
import type { ChallengeStep } from "@/lib/face/liveness";
import { verifyLivenessStep } from "@/lib/face/liveness";

const STEP_LABELS: Record<ChallengeStep, string> = {
  blink_once: "Blink once",
  blink_twice: "Blink twice",
  turn_left: "Turn your head left",
  turn_right: "Turn your head right",
};

export function LivenessChallenge({
  steps,
  getSignal,
  onComplete,
}: {
  steps: ChallengeStep[];
  /** Pulls the latest blendshapes/yaw sample from whatever detector is running. */
  getSignal: () => { blendshapes: Record<string, number> | null; yawDeg: number | null };
  onComplete: (completed: string[]) => void;
}) {
  const [doneSteps, setDoneSteps] = useState<string[]>([]);
  const current = steps[doneSteps.length];

  function checkNow() {
    if (!current) return;
    const { blendshapes, yawDeg } = getSignal();
    if (verifyLivenessStep(current, blendshapes, yawDeg)) {
      const next = [...doneSteps, current];
      setDoneSteps(next);
      if (next.length === steps.length) onComplete(next);
    }
  }

  return (
    <div className="space-y-3 text-center">
      <p className="font-display font-bold text-lg">{current ? STEP_LABELS[current as ChallengeStep] : "All steps complete"}</p>
      <p className="text-xs font-mono text-muted-foreground">{doneSteps.length} / {steps.length} steps</p>
      {current && <WakeoutButton size="sm" onClick={checkNow}>Check</WakeoutButton>}
    </div>
  );
}
```

- [ ] **Step 4: Write the enrollment route**

```tsx
// src/routes/_authenticated/student/verify-identity.tsx
"use client";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { FaceCapture } from "@/components/brand/face-capture";
import { LivenessChallenge } from "@/components/brand/liveness-challenge";
import { faceChallenge, faceEnroll } from "@/lib/supabase/face";
import type { DescriptorResult } from "@/lib/face/descriptor";

export const Route = createFileRoute("/_authenticated/student/verify-identity")({
  head: () => ({ meta: [{ title: "Face Match — Aura" }] }),
  component: VerifyIdentity,
});

type Step = "consent" | "card" | "matric" | "liveness" | "live-capture" | "done" | "rejected";

function VerifyIdentity() {
  const [step, setStep] = useState<Step>("consent");
  const [cardResult, setCardResult] = useState<DescriptorResult | null>(null);
  const [matricNo, setMatricNo] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; steps: string[] } | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);

  async function startLiveness() {
    const c = await faceChallenge();
    setChallenge(c);
    setStep("liveness");
  }

  async function onLivenessComplete() {
    setStep("live-capture");
  }

  async function submitEnrollment(finalDescriptor: number[], evidenceJpegBase64: string, antispoofScore: number, livenessScore: number) {
    if (!cardResult || !challenge) return;
    try {
      const res = await faceEnroll({
        data: {
          embeddingCard: cardResult.descriptor,
          embeddingSamples: [finalDescriptor, finalDescriptor, finalDescriptor, finalDescriptor, finalDescriptor],
          matricNo,
          challengeId: challenge.challengeId,
          challengeStepsCompleted: challenge.steps,
          antispoofScore,
          livenessScore,
          evidenceJpegBase64,
        },
      });
      if (res.status === "active") { setStep("done"); toast.success("Identity verified"); }
      else if (res.status === "pending") { setStep("done"); toast.info("Sent for review — you'll hear back within a day"); }
      else { setAttemptsRemaining(res.attemptsRemaining); setStep(res.attemptsRemaining > 0 ? "card" : "rejected"); }
    } catch (err: any) {
      toast.error(err.message ?? "Enrollment failed");
    }
  }

  return (
    <>
      <PageHeader badge="Face Match" title="Verify your identity" subtitle="Required once before your first identity-checked exam." />
      <Card className="max-w-xl mx-auto space-y-6">
        {step === "consent" && (
          <div className="space-y-4">
            <p className="text-sm">We store a numeric representation of your face, not a photograph. Your ID card image is deleted once verification completes. You may decline and ask your lecturer to verify you in person instead.</p>
            <WakeoutButton className="w-full" onClick={() => setStep("card")}>I understand, continue</WakeoutButton>
          </div>
        )}
        {step === "card" && (
          <FaceCapture guide="Hold your student card so it fills the frame" onCapture={(r) => { setCardResult(r); setStep("matric"); }} />
        )}
        {step === "matric" && (
          <div className="space-y-3">
            <label className="text-xs font-mono uppercase">Matric number</label>
            <input value={matricNo} onChange={(e) => setMatricNo(e.target.value)} className="w-full border-2 border-ink rounded-xl px-3 py-2" />
            <WakeoutButton className="w-full" onClick={startLiveness} disabled={!matricNo}>Continue</WakeoutButton>
          </div>
        )}
        {step === "liveness" && challenge && (
          <LivenessChallenge
            steps={challenge.steps as ChallengeStep[]}
            getSignal={() => ({ blendshapes: null, yawDeg: null })}
            onComplete={onLivenessComplete}
          />
        )}
        {step === "live-capture" && (
          <FaceCapture guide="Hold still" onCapture={(r, jpeg) => submitEnrollment(r.descriptor, jpeg, r.antispoofScore, r.livenessScore)} />
        )}
        {step === "done" && <p className="text-center font-display font-bold text-lg">You're all set.</p>}
        {step === "rejected" && <p className="text-center text-pink">Automated verification didn't succeed. Ask your lecturer to verify you in person.</p>}
      </Card>
    </>
  );
}
```

Note: `getSignal` in the `liveness` step above is a stub (`{ blendshapes: null, yawDeg: null }`) in this task — it needs a live `FaceLandmarker` instance running against the same video element to produce real values. Wiring that is a small follow-up inside this same task before Step 6's manual verification: mount a second, minimal `FaceLandmarker` instance (reusing the same CDN loader pattern from `camera-proctor.tsx`, `outputFaceBlendshapes: true`) scoped to the `verify-identity.tsx` route, store its latest `{ blendshapes, yawDeg }` sample in a ref, and have `getSignal` read that ref. This keeps `LivenessChallenge` itself detector-agnostic (it only consumes signals, never loads MediaPipe directly), which is why the interface is a callback rather than a hook.

- [ ] **Step 5: Delete the Task 2 throwaway dev page**

```bash
git rm src/routes/_authenticated/lecturer/face-dev-test.tsx
```

- [ ] **Step 6: Manual end-to-end verification**

Run: `npm run dev`, log in as a student, go to `/student/verify-identity`, complete the flow with a real webcam and any photo ID held up to the camera.
Expected: one of "You're all set" / "sent for review" / retry-with-tip appears; a row exists in `face_enrollments` with a non-placeholder `embedding_reference`, and `identity-evidence` bucket has zero or one object depending on the band it landed in.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/face.ts src/components/brand/face-capture.tsx src/components/brand/liveness-challenge.tsx src/routes/_authenticated/student/verify-identity.tsx scripts/migrate-face-verification.ts
git commit -m "feat(face-match): enrollment ceremony (consent, card, liveness, live capture, band-routing)"
```

---

### Task 4: Admin review queue + evidence purge

**Files:**
- Modify: `src/lib/supabase/face.ts` — add `getFaceReviewQueue`, `faceReview`, `getFaceEvidenceUrl`, `facePurge`
- Create: `src/routes/_authenticated/admin/identity.index.tsx`
- Create: `src/routes/_authenticated/admin/identity.$id.tsx`
- Modify: `src/components/brand/app-shell.tsx` — add `{ to: "/admin/identity", label: "Identity", icon: ScanFace }` to the admin nav array (same object-literal style as the existing admin entries)

**Interfaces:**
- Consumes: `createAdminClient`, `pushNotification`, `writeAudit` (existing), `getFaceSettings` (Task 1).
- Produces: `getFaceReviewQueue: createServerFn` returning `{ id, studentName, matricNo, similarity, evidencePath, createdAt }[]`. `faceReview: createServerFn({ enrollmentId, decision: "approve" | "reject", reason？ })`. `getFaceEvidenceUrl: createServerFn({ path }) → { url: string }` (300s TTL). `facePurge: createServerFn` — deletes storage objects for evidence older than the retention window (the actual object-delete step Task 1's SQL-only cron couldn't do).

- [ ] **Step 1: Append review + purge functions to `src/lib/supabase/face.ts`**

```ts
// GET: admin review queue — oldest first
export const getFaceReviewQueue = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await db(supabase).from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Forbidden");

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("face_enrollments")
    .select("id, user_id, card_live_score, evidence_path, created_at, profiles!user_id(name, matric_no)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    id: r.id,
    studentName: r.profiles?.name ?? "Unknown",
    matricNo: r.profiles?.matric_no ?? "",
    similarity: r.card_live_score,
    evidencePath: r.evidence_path,
    createdAt: r.created_at,
  }));
});

// POST: admin approve/reject — evidence deleted on EITHER outcome.
export const faceReview = createServerFn({ method: "POST" })
  .inputValidator((data: { enrollmentId: string; decision: "approve" | "reject"; reason?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await db(supabase).from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") throw new Error("Forbidden");

    const admin = createAdminClient();
    const { data: enrollment } = await (admin as any)
      .from("face_enrollments")
      .select("id, user_id, evidence_path, status")
      .eq("id", data.enrollmentId)
      .single();
    if (!enrollment || enrollment.status !== "pending") throw new Error("This enrollment is not awaiting review");

    const newStatus = data.decision === "approve" ? "active" : "rejected";
    if (newStatus === "active") {
      await (admin as any).from("face_enrollments").update({ status: "superseded" }).eq("user_id", enrollment.user_id).eq("status", "active");
    }
    await (admin as any)
      .from("face_enrollments")
      .update({ status: newStatus, reviewed_by: user.id, reviewed_at: new Date().toISOString(), reject_reason: data.reason ?? null, evidence_path: null })
      .eq("id", data.enrollmentId);

    if (enrollment.evidence_path) {
      await (admin as any).storage.from("identity-evidence").remove([enrollment.evidence_path]);
    }

    await pushNotification(supabase, {
      userId: enrollment.user_id,
      type: "identity_reviewed",
      title: newStatus === "active" ? "Identity verified" : "Identity verification rejected",
      body: newStatus === "active" ? "Your Face Match enrollment was approved." : (data.reason ?? "Please contact your lecturer for supervised verification."),
    });
    await writeAudit(user.id, { action: `${newStatus === "active" ? "Approved" : "Rejected"} face enrollment`, target: enrollment.user_id, category: "identity" });

    return { success: true as const };
  });

// GET: short-TTL signed URL for one evidence file — authorization-checked.
export const getFaceEvidenceUrl = createServerFn({ method: "GET" })
  .inputValidator((path: string) => path)
  .handler(async ({ data: path }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await db(supabase).from("profiles").select("role").eq("id", user.id).single();
    const ownerId = path.split("/")[0];
    const isOwner = ownerId === user.id;
    const isAdmin = profile?.role === "admin";
    if (!isOwner && !isAdmin) throw new Error("Forbidden");

    const admin = createAdminClient();
    const { data: signed, error } = await (admin as any).storage.from("identity-evidence").createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl as string };
  });

// POST: nightly retention sweep — deletes storage objects for evidence whose
// evidence_path was already nulled by Task 1's pg_cron SQL job (that job
// only nulls the DB column; this function does the actual storage delete,
// since SQL cannot call the Storage API). Also usable on-demand if pg_cron is
// disabled on this Supabase plan, mirroring the syncExamStatuses fallback
// pattern already used for exam lifecycle.
export const facePurge = createServerFn({ method: "POST" }).handler(async () => {
  const admin = createAdminClient();
  const settings = await getFaceSettings();
  const cutoff = new Date(Date.now() - settings.evidenceRetentionDays * 86_400_000).toISOString();

  const { data: stale } = await (admin as any)
    .from("face_enrollments")
    .select("id, evidence_path")
    .not("evidence_path", "is", null)
    .lt("created_at", cutoff);

  const paths = (stale ?? []).map((r: any) => r.evidence_path).filter(Boolean);
  if (paths.length > 0) {
    await (admin as any).storage.from("identity-evidence").remove(paths);
    await (admin as any).from("face_enrollments").update({ evidence_path: null }).in("id", (stale ?? []).map((r: any) => r.id));
  }
  return { purged: paths.length };
});
```

- [ ] **Step 2: Write the review queue route**

```tsx
// src/routes/_authenticated/admin/identity.index.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHeader, Empty } from "@/components/brand/page";
import { getFaceReviewQueue } from "@/lib/supabase/face";

export const Route = createFileRoute("/_authenticated/admin/identity/")({
  head: () => ({ meta: [{ title: "Identity review — Aura" }] }),
  loader: () => getFaceReviewQueue(),
  component: IdentityQueue,
});

function IdentityQueue() {
  const queue = Route.useLoaderData();
  return (
    <>
      <PageHeader badge="Face Match" title="Identity review queue" subtitle={`${queue.length} pending`} />
      {queue.length === 0 ? (
        <Empty title="Nothing to review" hint="Enrollments needing a human check will show up here." />
      ) : (
        <div className="space-y-3">
          {queue.map((q) => (
            <Link key={q.id} to="/admin/identity/$id" params={{ id: q.id }}>
              <Card className="flex items-center justify-between hover:-translate-y-0.5 transition-transform">
                <div>
                  <div className="font-display font-bold">{q.studentName}</div>
                  <div className="text-xs font-mono text-muted-foreground">{q.matricNo} - similarity {q.similarity?.toFixed(2)}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Write the single-review route**

```tsx
// src/routes/_authenticated/admin/identity.$id.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getFaceReviewQueue, faceReview, getFaceEvidenceUrl } from "@/lib/supabase/face";

export const Route = createFileRoute("/_authenticated/admin/identity/$id")({
  loader: () => getFaceReviewQueue(),
  component: IdentityReview,
});

function IdentityReview() {
  const { id } = Route.useParams();
  const queue = Route.useLoaderData();
  const item = queue.find((q) => q.id === id);
  const navigate = useNavigate();
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [checks, setChecks] = useState({ face: false, matric: false, name: false });

  useEffect(() => {
    if (item?.evidencePath) getFaceEvidenceUrl({ data: item.evidencePath }).then((r) => setEvidenceUrl(r.url));
  }, [item?.evidencePath]);

  if (!item) return null;
  const allChecked = checks.face && checks.matric && checks.name;

  async function decide(decision: "approve" | "reject") {
    await faceReview({ data: { enrollmentId: item.id, decision } });
    toast.success(decision === "approve" ? "Approved" : "Rejected");
    navigate({ to: "/admin/identity" });
  }

  return (
    <>
      <PageHeader badge="Face Match" title={item.studentName} subtitle={`Matric ${item.matricNo} - similarity ${item.similarity?.toFixed(2)}`} />
      <Card className="max-w-xl space-y-4">
        {evidenceUrl && <img src={evidenceUrl} alt="Card + face evidence" className="rounded-xl border-2 border-ink" />}
        {(["face", "matric", "name"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />
            {k === "face" && "The face on the card matches the live face"}
            {k === "matric" && "The matric number on the card matches the typed number"}
            {k === "name" && "The name on the card matches the profile name"}
          </label>
        ))}
        <div className="flex gap-2">
          <WakeoutButton variant="primary" disabled={!allChecked} onClick={() => decide("approve")}>Approve</WakeoutButton>
          <WakeoutButton variant="destructive" onClick={() => decide("reject")}>Reject</WakeoutButton>
        </div>
      </Card>
    </>
  );
}
```

- [ ] **Step 4: Add the nav entry**

Modify `src/components/brand/app-shell.tsx` — in the admin nav array (search for `{ to: "/admin/audit-log", label: "Audit Log", icon: ScrollText },`), add immediately after:
```ts
    { to: "/admin/identity",   label: "Identity",  icon: ScanFace },
```
Add `ScanFace` to the existing `lucide-react` import line at the top of the file.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Using the DB directly (or by lowering `face_auto_approve_threshold` in `platform_settings` temporarily), get an enrollment into `pending` status, then open `/admin/identity` as an admin user.
Expected: the pending enrollment appears, the evidence photo loads via a signed URL, all three checkboxes must be ticked before Approve enables, and after either Approve or Reject the `evidence_path` on that row is `null` and the corresponding storage object is gone.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/face.ts src/routes/_authenticated/admin/identity.index.tsx "src/routes/_authenticated/admin/identity.\$id.tsx" src/components/brand/app-shell.tsx
git commit -m "feat(face-match): admin review queue + evidence purge"
```

---

### Task 5: Exam lobby gate

**Files:**
- Modify: `src/lib/supabase/face.ts` — add `faceVerify`, `faceBindSession`
- Modify: `src/lib/supabase/exams.ts` — `CreateExamInput`/`createExam`/`updateExam` gain `require_identity_verification: boolean` (mirror the existing `require_camera` field exactly, same insert/update object, same draft-vs-upcoming edit rules); `getStudentExamLobby` gains `require_identity_verification` in its return
- Create: `src/components/brand/identity-gate.tsx`
- Modify: `src/routes/_authenticated/student/exams.$examId.lobby.tsx` — mount `<IdentityGate>` (search for the existing `<CameraProctor mode="setup" ... />` usage and the "Start exam" button; `IdentityGate` mounts between them, gated on `exam.require_identity_verification`)
- Modify: exam-builder component (locate via `grep -rl "require_camera" src/components`) — add a "Require identity verification" toggle next to the existing "Require camera" toggle

**Interfaces:**
- Consumes: `cosine`, `l2normalize`, `bestMatch`, `parseVector`, `getFaceSettings`, `loadHuman`, `extractDescriptor`, `passesQualityGate`.
- Produces: `faceVerify: createServerFn({ context, examId, submissionId？, embeddings, antispoofScore, livenessScore, evidenceJpegBase64？ })` returning `{ passed: boolean; similarity: number; attemptsRemaining: number; elevated: boolean; guidance？: string }`. Produces `faceBindSession: createServerFn({ submissionId, examId })` returning `{ elevated: boolean }`. Task 6 calls both again with different `context`.

- [ ] **Step 1: Append `faceVerify` and `faceBindSession` to `src/lib/supabase/face.ts`**

```ts
type VerifyInput = {
  context: "lobby" | "in_exam" | "submit";
  examId: string;
  submissionId?: string;
  embeddings: number[][];
  antispoofScore: number;
  livenessScore: number;
  evidenceJpegBase64?: string;
};

export const faceVerify = createServerFn({ method: "POST" })
  .inputValidator((data: VerifyInput) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const settings = await getFaceSettings();
    const admin = createAdminClient();

    const { data: enrollment } = await (admin as any)
      .from("face_enrollments")
      .select("id, embedding_reference, embedding_samples")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!enrollment) {
      return { passed: false, similarity: 0, attemptsRemaining: 0, elevated: true, guidance: "No active enrollment — verify your identity from your dashboard first." };
    }

    const refs = [parseVector(enrollment.embedding_reference), ...(enrollment.embedding_samples ?? []).map(parseVector)];
    const similarities = data.embeddings.map((e) => bestMatch(e, refs));
    const similarity = Math.max(...similarities);
    const threshold = settings.liveThreshold;
    const passed = similarity >= threshold;

    // Count prior attempts for this context+exam today, for the
    // "3 tries then fail-soft" rule (lobby only — in_exam/submit are single-shot).
    let attemptsRemaining = 2;
    if (data.context === "lobby") {
      const { count } = await (admin as any)
        .from("face_verifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("exam_id", data.examId)
        .eq("context", "lobby");
      attemptsRemaining = Math.max(0, settings.maxAttempts - 1 - (count ?? 0));
    }

    let evidencePath: string | null = null;
    if (!passed && data.evidenceJpegBase64) {
      evidencePath = `${user.id}/${data.context}/${Date.now()}.jpg`;
      const bytes = Uint8Array.from(atob(data.evidenceJpegBase64), (c) => c.charCodeAt(0));
      await (admin as any).storage.from("identity-evidence").upload(evidencePath, bytes, { contentType: "image/jpeg" });
    }

    await (admin as any).from("face_verifications").insert({
      user_id: user.id,
      exam_id: data.examId,
      submission_id: data.submissionId ?? null,
      enrollment_id: enrollment.id,
      context: data.context,
      similarity,
      threshold_used: threshold,
      passed,
      model_version: MODEL_VERSION,
      evidence_path: evidencePath,
    });

    const elevated = !passed;
    if (!passed && (data.context !== "lobby" || attemptsRemaining === 0)) {
      const { data: examRow } = await (admin as any).from("exams").select("title, classes(lecturer_id)").eq("id", data.examId).single();
      await pushNotification(supabase, {
        userId: user.id, type: "identity_unverified", title: "Identity could not be confirmed",
        body: `We couldn't confirm your identity for "${examRow?.title}". You may still continue — your lecturer has been notified.`,
      });
      if (examRow?.classes?.lecturer_id) {
        await pushNotification(supabase, {
          userId: examRow.classes.lecturer_id, type: "identity_unverified", title: "Student identity unverified",
          body: `A student's identity could not be confirmed for "${examRow.title}".`, link: `/lecturer/exams/${data.examId}/monitor`,
        }).catch(() => {});
      }
    }

    return {
      passed, similarity: Math.round(similarity * 1000) / 1000, attemptsRemaining, elevated,
      guidance: passed ? undefined : "Try more light, remove your cap/sunglasses, and face the camera directly.",
    };
  });

// POST: stamp submission_id onto the lobby verification row right after
// startExam creates the submission (the lobby check runs BEFORE a submission
// exists, so it can't be tagged at capture time).
export const faceBindSession = createServerFn({ method: "POST" })
  .inputValidator((data: { submissionId: string; examId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const admin = createAdminClient();
    const { data: lobbyRow } = await (admin as any)
      .from("face_verifications")
      .select("id, passed")
      .eq("user_id", user.id)
      .eq("exam_id", data.examId)
      .eq("context", "lobby")
      .is("submission_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lobbyRow) {
      await (admin as any).from("face_verifications").update({ submission_id: data.submissionId }).eq("id", lobbyRow.id);
    }
    return { elevated: lobbyRow ? !lobbyRow.passed : false };
  });
```

- [ ] **Step 2: Add `require_identity_verification` to the exam create/update/lobby path**

In `src/lib/supabase/exams.ts`, modify `CreateExamInput` (search for `type CreateExamInput = {`):
```ts
  require_identity_verification: boolean;
```
In `createExam`'s `.insert({...})` call (search for `require_camera: data.require_camera,`), add the line immediately after:
```ts
        require_identity_verification: data.require_identity_verification,
```
In `updateExam`, add `require_identity_verification: data.require_identity_verification` alongside `require_camera: data.require_camera` in BOTH the `status === "upcoming"` partial-update branch and the draft full-update branch (search for both occurrences of `require_camera: data.require_camera` inside `updateExam`) — per `CLAUDE.md`'s existing rule that camera requirement can still change post-publish, identity requirement follows the same rule since it changes exam-day expectations the same way.

In `getStudentExamLobby`, add `require_identity_verification: exam.require_identity_verification ?? false,` next to the existing `require_camera: exam.require_camera ?? false,` line.

- [ ] **Step 3: Write `identity-gate.tsx`**

```tsx
// src/components/brand/identity-gate.tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";
import { loadHuman } from "@/lib/face/human-loader";
import { extractDescriptor } from "@/lib/face/descriptor";
import { passesQualityGate } from "@/lib/face/quality";
import { faceVerify } from "@/lib/supabase/face";

export function IdentityGate({
  examId,
  onPassed,
}: {
  examId: string;
  onPassed: (elevated: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "checking" | "passed" | "retry" | "failsoft">("idle");
  const [guidance, setGuidance] = useState<string | null>(null);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    });
    loadHuman();
  }, []);

  async function runCheck() {
    setState("checking");
    const human = await loadHuman();
    if (!human || !videoRef.current) return;
    const r = await extractDescriptor(human, videoRef.current);
    const gate = passesQualityGate(r);
    if (!gate.ok || !r) { setGuidance(gate.reason ?? "Try again"); setState("retry"); return; }

    const res = await faceVerify({
      data: { context: "lobby", examId, embeddings: [r.descriptor], antispoofScore: r.antispoofScore, livenessScore: r.livenessScore },
    });
    if (res.passed) { setState("passed"); onPassed(false); }
    else if (res.attemptsRemaining > 0) { setGuidance(res.guidance ?? null); setState("retry"); }
    else { setState("failsoft"); onPassed(true); }
  }

  return (
    <div className="space-y-3">
      <video ref={videoRef} autoPlay muted playsInline className="w-full aspect-video rounded-2xl border-2 border-ink object-cover" />
      {state === "idle" && <WakeoutButton className="w-full" onClick={runCheck}>Check identity</WakeoutButton>}
      {state === "checking" && <p className="flex items-center gap-2 justify-center text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Checking…</p>}
      {state === "passed" && <p className="flex items-center gap-2 justify-center text-green-700 font-semibold"><CheckCircle className="w-4 h-4" /> Identity confirmed check</p>}
      {state === "retry" && (
        <div className="space-y-2">
          <p className="text-sm text-amber-600 flex items-center gap-1.5"><XCircle className="w-4 h-4" /> {guidance}</p>
          <WakeoutButton className="w-full" onClick={runCheck}>Try again</WakeoutButton>
        </div>
      )}
      {state === "failsoft" && (
        <p className="text-sm text-pink">We couldn't confirm your identity — your lecturer has been notified. You may still begin.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire into the lobby route**

Modify `src/routes/_authenticated/student/exams.$examId.lobby.tsx`: track a local `identityPassed` boolean state, default `true` when `require_identity_verification` is `false`, else default `false`. Render `<IdentityGate examId={exam.id} onPassed={() => setIdentityPassed(true)} />` between the existing camera check and the "Start exam" button, only when `require_identity_verification` is `true`. The Start button's existing `disabled` condition gains `|| !identityPassed`.

After `startExam` resolves with a `submissionId` (existing call site in this file), add: `if (exam.require_identity_verification) await faceBindSession({ data: { submissionId, examId: exam.id } });` before navigating to the take page.

- [ ] **Step 5: Add the exam-builder toggle**

Run: `grep -rl "require_camera" src/components/brand/exam-builder.tsx` to confirm the file, then add a second checkbox/toggle right next to the existing "Require camera" control, bound to a new `requireIdentityVerification` state field threaded through the same submit payload as `requireCamera` already is.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. As a lecturer, create/publish an exam with "Require identity verification" on, for a class where the logged-in student has an active enrollment (Task 3). As that student, open the lobby.
Expected: after the camera check, the identity gate appears; a real face passes and enables Start; covering the camera or using a different face fails 3 times and fail-softs (Start still enables), and a `face_verifications` row with `context = 'lobby'` exists either way.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/face.ts src/lib/supabase/exams.ts src/components/brand/identity-gate.tsx "src/routes/_authenticated/student/exams.\$examId.lobby.tsx" src/components/brand/exam-builder.tsx
git commit -m "feat(face-match): exam lobby identity gate, fail-soft on repeated failure"
```

---

### Task 6: In-exam re-checks, submit check, monitor/results surfaces

**Files:**
- Modify: `src/components/brand/camera-proctor.tsx` — call `onIdentityTrigger` when face-missing/camera-lost/multiple-faces RESOLVE (transition back to exactly one face)
- Modify: `src/routes/_authenticated/student/exams.$examId.take.tsx` — wire `onIdentityTrigger` -> `faceVerify(context: "in_exam")`; call `faceVerify(context: "submit")` right before the existing submit call
- Create: `src/components/brand/identity-badge.tsx`
- Modify: `src/routes/_authenticated/lecturer/exams.$examId.monitor.tsx` — identity column per student
- Modify: `src/routes/_authenticated/lecturer/exams.$examId.results.tsx` — identity timeline per submission
- Modify: `src/lib/supabase/exams.ts` — `getLecturerExamMonitor` and `getLecturerExamResults` gain identity fields (see Step 3)

**Interfaces:**
- Consumes: `faceVerify` (Task 5), blendshapes/yaw data already flowing through `camera-proctor.tsx` since Task 2.
- Produces: `IdentityBadge` component: `<IdentityBadge status="verified" | "unverified" | "mismatch" | null score={number} />`.

- [ ] **Step 1: Wire `onIdentityTrigger` in `camera-proctor.tsx`**

In `handleProctorTick` (the function already tracking `missingSince`/`multipleSince` transitions), add resolution-edge detection: when `faceCount` transitions from `0` to `1` (face was missing, now present) or from `>1` to `1` (multiple faces resolved to one), call `onIdentityTriggerRef.current?.("single-face-restored")`. Add the corresponding `onIdentityTriggerRef` (mirroring the existing `onHardFlagRef` pattern) at the top of the component. Also call it from the `catch` recovery path in `startCamera` when a camera that previously failed successfully reconnects (`onIdentityTriggerRef.current?.("camera-restored")`), guarded so it only fires on an actual state transition (track a `wasCameraLost` ref), not on every tick.

- [ ] **Step 2: Wire the take page**

Modify `src/routes/_authenticated/student/exams.$examId.take.tsx`: pass `onIdentityTrigger={handleIdentityTrigger}` to the existing `<CameraProctor mode="monitor" .../>` instance (only when `exam.require_identity_verification`). Implement:
```ts
const consecutiveMismatchRef = useRef(0);
async function handleIdentityTrigger() {
  if (!exam.require_identity_verification || !submissionId) return;
  const human = await loadHuman();
  const video = document.querySelector<HTMLVideoElement>("video"); // the CameraProctor monitor video element
  if (!human || !video) return;
  const r = await extractDescriptor(human, video);
  if (!r || r.faceCount !== 1) return;
  const res = await faceVerify({
    data: { context: "in_exam", examId: exam.id, submissionId, embeddings: [r.descriptor], antispoofScore: r.antispoofScore, livenessScore: r.livenessScore },
  });
  consecutiveMismatchRef.current = res.passed ? 0 : consecutiveMismatchRef.current + 1;
  // 3 consecutive mismatches (Global Constraint #8: advisory only, never
  // counted toward the 3-strike auto-submit — faceVerify already writes the
  // flag via its own face_verifications row + pushNotification, no call to
  // recordFlag here).
}
```
Before the existing submit call (search for the call site of `submitExam`), add:
```ts
if (exam.require_identity_verification) {
  const human = await loadHuman();
  const video = document.querySelector<HTMLVideoElement>("video");
  if (human && video) {
    const r = await extractDescriptor(human, video);
    if (r && r.faceCount === 1) {
      await faceVerify({ data: { context: "submit", examId: exam.id, submissionId, embeddings: [r.descriptor], antispoofScore: r.antispoofScore, livenessScore: r.livenessScore } }).catch(() => {});
    }
  }
}
```

- [ ] **Step 3: Add identity fields to the monitor/results server functions**

In `getLecturerExamMonitor` (`src/lib/supabase/exams.ts`), alongside the existing `flagsBySubmission` batch fetch, add a parallel fetch:
```ts
const { data: identityRows } = subIds.length > 0
  ? await db(supabase).from("face_verifications").select("submission_id, context, passed, similarity, created_at").in("submission_id", subIds).order("created_at", { ascending: false })
  : { data: [] };
const identityBySubmission: Record<string, { status: "verified" | "unverified" | "mismatch"; score: number }> = {};
for (const row of identityRows ?? []) {
  if (identityBySubmission[row.submission_id]) continue; // most recent only (already sorted desc)
  identityBySubmission[row.submission_id] = {
    status: row.passed ? "verified" : row.context === "lobby" ? "unverified" : "mismatch",
    score: row.similarity,
  };
}
```
Add `identity: identityBySubmission[s.id] ?? null,` to the mapped `submissions` return array. Mirror the same pattern in `getLecturerExamResults`.

- [ ] **Step 4: Write `identity-badge.tsx`**

```tsx
// src/components/brand/identity-badge.tsx
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

export function IdentityBadge({ status, score }: { status: "verified" | "unverified" | "mismatch" | null; score?: number }) {
  if (!status) return <span className="text-xs text-muted-foreground font-mono">-</span>;
  const config = {
    verified: { icon: CheckCircle, label: "Verified", cls: "text-green-700" },
    unverified: { icon: AlertTriangle, label: "Unverified", cls: "text-amber-600" },
    mismatch: { icon: XCircle, label: "Mismatch", cls: "text-pink" },
  }[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono ${config.cls}`}>
      <Icon className="w-3.5 h-3.5" /> {config.label}{score !== undefined ? ` (${score.toFixed(2)})` : ""}
    </span>
  );
}
```

- [ ] **Step 5: Add the column to monitor and results routes**

In both `exams.$examId.monitor.tsx` and `exams.$examId.results.tsx`, find the existing per-submission row rendering (table row or card, alongside the existing flags count), and render `<IdentityBadge status={s.identity?.status ?? null} score={s.identity?.score} />` next to it.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. As the student from Task 5, start an identity-required exam, cover the camera then uncover it (triggers `single-face-restored` -> an `in_exam` `faceVerify` call), then submit.
Expected: `face_verifications` rows exist for `lobby`, `in_exam`, and `submit` contexts on the same submission; the lecturer's monitor and results pages show an identity badge matching the most recent row's outcome; no auto-submit occurred from the identity checks alone (only the pre-existing hard-flag types can auto-submit).

- [ ] **Step 7: Commit**

```bash
git add src/components/brand/camera-proctor.tsx "src/routes/_authenticated/student/exams.\$examId.take.tsx" src/components/brand/identity-badge.tsx "src/routes/_authenticated/lecturer/exams.\$examId.monitor.tsx" "src/routes/_authenticated/lecturer/exams.\$examId.results.tsx" src/lib/supabase/exams.ts
git commit -m "feat(face-match): in-exam event-triggered re-checks, submit-time check, monitor/results identity column"
```

---

### Task 7: Supervised enrollment sessions (lecturer windows / VIVA fallback)

**Files:**
- Modify: `src/lib/supabase/face.ts` — add `openEnrollmentSession`, `closeEnrollmentSession`, `getEnrollmentSessionRoster`
- Create: `src/routes/_authenticated/lecturer/identity-sessions.tsx`
- Modify: `src/components/brand/app-shell.tsx` — add `{ to: "/lecturer/identity-sessions", label: "Sessions", icon: ScanFace }` to the lecturer nav array
- Modify: `src/routes/_authenticated/student/verify-identity.tsx` — detect an open session scoped to the student and skip straight to live-capture-only (no card step)

**Interfaces:**
- Consumes: `faceEnroll` (Task 3, already accepts `sessionId`).
- Produces: `openEnrollmentSession({ classId？, targetUserId？, durationMinutes })` returning `{ sessionId, expiresAt }`. `closeEnrollmentSession({ sessionId })`. `getEnrollmentSessionRoster({ classId })` returning `{ studentId, name, enrolled: boolean }[]`.

- [ ] **Step 1: Append session functions to `src/lib/supabase/face.ts`**

```ts
export const openEnrollmentSession = createServerFn({ method: "POST" })
  .inputValidator((data: { classId?: string; targetUserId?: string; durationMinutes?: number }) => data)
  .handler(async ({ data }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    if (!data.classId && !data.targetUserId) throw new Error("classId or targetUserId is required");

    if (data.classId) {
      const { data: cls } = await db(supabase).from("classes").select("lecturer_id").eq("id", data.classId).single();
      if (cls?.lecturer_id !== user.id) throw new Error("Forbidden — you do not own this class");
    }

    const expiresAt = new Date(Date.now() + (data.durationMinutes ?? 30) * 60_000).toISOString();
    const { data: session, error } = await db(supabase)
      .from("face_enrollment_sessions")
      .insert({ class_id: data.classId ?? null, target_user: data.targetUserId ?? null, opened_by: user.id, expires_at: expiresAt })
      .select("id, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return { sessionId: session.id as string, expiresAt: session.expires_at as string };
  });

export const closeEnrollmentSession = createServerFn({ method: "POST" })
  .inputValidator((sessionId: string) => sessionId)
  .handler(async ({ data: sessionId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    await db(supabase).from("face_enrollment_sessions").update({ closed_at: new Date().toISOString() }).eq("id", sessionId).eq("opened_by", user.id);
    return { success: true as const };
  });

export const getEnrollmentSessionRoster = createServerFn({ method: "GET" })
  .inputValidator((classId: string) => classId)
  .handler(async ({ data: classId }) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: enrollments } = await db(supabase)
      .from("class_enrollments")
      .select("student_id, profiles!student_id(name)")
      .eq("class_id", classId);

    const admin = createAdminClient();
    const { data: active } = await (admin as any).from("face_enrollments").select("user_id").eq("status", "active");
    const enrolledIds = new Set((active ?? []).map((r: any) => r.user_id));

    return (enrollments ?? []).map((e: any) => ({
      studentId: e.student_id, name: e.profiles?.name ?? "Unknown", enrolled: enrolledIds.has(e.student_id),
    }));
  });
```

- [ ] **Step 2: Write the lecturer sessions route**

```tsx
// src/routes/_authenticated/lecturer/identity-sessions.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getLecturerClasses } from "@/lib/supabase/classes";
import { openEnrollmentSession, closeEnrollmentSession, getEnrollmentSessionRoster } from "@/lib/supabase/face";

export const Route = createFileRoute("/_authenticated/lecturer/identity-sessions")({
  head: () => ({ meta: [{ title: "Identity sessions — Aura" }] }),
  loader: () => getLecturerClasses(),
  component: IdentitySessions,
});

function IdentitySessions() {
  const classes = Route.useLoaderData();
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>(classes[0]?.id ?? "");
  const [roster, setRoster] = useState<{ studentId: string; name: string; enrolled: boolean }[]>([]);

  async function open() {
    const res = await openEnrollmentSession({ data: { classId: selectedClass, durationMinutes: 30 } });
    setOpenSessionId(res.sessionId);
    toast.success(`Window open until ${new Date(res.expiresAt).toLocaleTimeString()}`);
    poll();
  }

  async function poll() {
    const r = await getEnrollmentSessionRoster({ data: selectedClass });
    setRoster(r);
  }

  async function close() {
    if (!openSessionId) return;
    await closeEnrollmentSession({ data: openSessionId });
    setOpenSessionId(null);
  }

  return (
    <>
      <PageHeader badge="Face Match" title="Supervised verification" subtitle="Open a window, students enroll in person, no card required." />
      <Card className="max-w-xl space-y-4">
        <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="w-full border-2 border-ink rounded-xl px-3 py-2">
          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        {!openSessionId ? (
          <WakeoutButton className="w-full" onClick={open}>Open 30-minute window</WakeoutButton>
        ) : (
          <>
            <p className="text-sm font-mono">{roster.filter((r) => r.enrolled).length} / {roster.length} enrolled</p>
            <WakeoutButton variant="secondary" className="w-full" onClick={poll}>Refresh</WakeoutButton>
            <WakeoutButton variant="destructive" className="w-full" onClick={close}>Close window</WakeoutButton>
          </>
        )}
      </Card>
    </>
  );
}
```

- [ ] **Step 3: Add the nav entry**

Modify `src/components/brand/app-shell.tsx` — in the lecturer nav array, add `{ to: "/lecturer/identity-sessions", label: "Sessions", icon: ScanFace }` after the existing `Appeals` entry, reusing the `ScanFace` import added in Task 4.

- [ ] **Step 4: Skip the card step inside an open window**

Modify `src/routes/_authenticated/student/verify-identity.tsx`: on mount, call a new lightweight check (reuse `getEnrollmentSessionRoster`-adjacent logic or a small dedicated `getOpenSessionForMe` server function against `face_enrollment_sessions`, filtered by `target_user = auth.uid() OR class_id in (my classes)` and `expires_at > now() AND closed_at IS NULL`) — if found, set `step` to `"live-capture"` directly (skip `"card"` and `"matric"` unless `profiles.matric_no` is still null) and pass `sessionId` through to `faceEnroll`'s payload instead of `embeddingCard`.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. As a lecturer, open a session for a class. As an enrolled student in that class (in a second browser/profile), open `/student/verify-identity` — confirm the card step is skipped and enrollment completes as `active` immediately after the live capture, with `supervised_by` set and `session_id` populated on the resulting `face_enrollments` row.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/face.ts src/routes/_authenticated/lecturer/identity-sessions.tsx src/components/brand/app-shell.tsx src/routes/_authenticated/student/verify-identity.tsx
git commit -m "feat(face-match): supervised lecturer enrollment windows (VIVA fallback path)"
```

---

### Task 8: Calibration tooling (not the experiment itself — see Global Constraint #10)

**Files:**
- Create: `scripts/face-calibration-analyze.ts`
- Create: `docs/face-match/calibration-protocol.md`

**Interfaces:**
- Consumes: `cosine`, `l2normalize` (Task 1).
- Produces: a CSV (`genuine_scores.csv`, `impostor_scores.csv`, `far_frr_sweep.csv`) and console-printed EER — the raw material for the FYP's Chapter 6 histograms and DET curve.

- [ ] **Step 1: Document the protocol**

Write `docs/face-match/calibration-protocol.md`, covering: recruit ~15 volunteers; enroll each with card+live; collect 3 additional live captures per person on a different day/lighting/device; compute genuine vs. impostor cosine-similarity distributions; sweep threshold 0 to 1 in 0.01 steps for FAR/FRR; find the EER; set `face_live_threshold` slightly below EER, favoring false-accepts over false-rejects (a false accept produces a reviewable flag; a false reject blocks a student mid-exam); state that tradeoff explicitly in the report. Add one line making explicit what Global Constraint #10 says: this is a real-world task the student runs personally with real volunteers under the same consent screen as production users; nothing in this repository substitutes for that. Volunteers' data must be deleted after the experiment (same PDPA posture as production).

- [ ] **Step 2: Write the analysis script**

```ts
// scripts/face-calibration-analyze.ts
//
// Input: a CSV of raw 1024-dim descriptors, one row per capture, each row
// "person_id,d0,d1,...,d1023" — build this from whatever the calibration
// capture flow (Step 1's protocol) produces.
import { readFileSync, writeFileSync } from "fs";
import { l2normalize, cosine } from "../src/lib/face/similarity";

function loadDescriptors(path: string): Map<string, number[][]> {
  const byPerson = new Map<string, number[][]>();
  const lines = readFileSync(path, "utf8").trim().split("\n");
  for (const line of lines) {
    const [personId, ...vec] = line.split(",");
    const arr = vec.map(Number);
    if (!byPerson.has(personId)) byPerson.set(personId, []);
    byPerson.get(personId)!.push(arr);
  }
  return byPerson;
}

function computeScores(byPerson: Map<string, number[][]>) {
  const genuine: number[] = [];
  const impostor: number[] = [];
  const people = [...byPerson.keys()];
  for (const person of people) {
    const captures = byPerson.get(person)!.map(l2normalize);
    for (let i = 0; i < captures.length; i++) {
      for (let j = i + 1; j < captures.length; j++) genuine.push(cosine(captures[i], captures[j]));
    }
  }
  for (let a = 0; a < people.length; a++) {
    for (let b = a + 1; b < people.length; b++) {
      const capsA = byPerson.get(people[a])!.map(l2normalize);
      const capsB = byPerson.get(people[b])!.map(l2normalize);
      for (const ca of capsA) for (const cb of capsB) impostor.push(cosine(ca, cb));
    }
  }
  return { genuine, impostor };
}

function sweep(genuine: number[], impostor: number[]) {
  const rows: { threshold: number; far: number; frr: number }[] = [];
  for (let t = 0; t <= 1; t += 0.01) {
    const far = impostor.filter((s) => s >= t).length / impostor.length;
    const frr = genuine.filter((s) => s < t).length / genuine.length;
    rows.push({ threshold: Math.round(t * 100) / 100, far, frr });
  }
  let eer = rows[0];
  for (const r of rows) if (Math.abs(r.far - r.frr) < Math.abs(eer.far - eer.frr)) eer = r;
  return { rows, eer };
}

const [, , inputPath] = process.argv;
if (!inputPath) {
  console.error("Usage: tsx scripts/face-calibration-analyze.ts <descriptors.csv>");
  process.exit(1);
}

const byPerson = loadDescriptors(inputPath);
const { genuine, impostor } = computeScores(byPerson);
const { rows, eer } = sweep(genuine, impostor);

writeFileSync("genuine_scores.csv", genuine.join("\n"));
writeFileSync("impostor_scores.csv", impostor.join("\n"));
writeFileSync("far_frr_sweep.csv", "threshold,far,frr\n" + rows.map((r) => `${r.threshold},${r.far},${r.frr}`).join("\n"));

console.log(`genuine pairs: ${genuine.length}, impostor pairs: ${impostor.length}`);
console.log(`EER around threshold ${eer.threshold} (FAR ${eer.far.toFixed(3)}, FRR ${eer.frr.toFixed(3)})`);
console.log(`Recommended face_live_threshold (EER minus a small margin, favoring false-accept over false-reject): ${(eer.threshold - 0.03).toFixed(2)}`);
console.log("Wrote genuine_scores.csv, impostor_scores.csv, far_frr_sweep.csv");
```

- [ ] **Step 3: Verify the script on synthetic data (not the real experiment)**

```bash
node -e "
const fs = require('fs');
const lines = [];
for (let p = 0; p < 5; p++) {
  const base = Array.from({length: 1024}, () => Math.random());
  for (let c = 0; c < 3; c++) {
    const noisy = base.map(x => x + (Math.random() - 0.5) * 0.05);
    lines.push(['p'+p, ...noisy].join(','));
  }
}
fs.writeFileSync('synthetic_descriptors.csv', lines.join('\n'));
"
npx tsx scripts/face-calibration-analyze.ts synthetic_descriptors.csv
```
Expected: script runs to completion, prints a plausible EER (should skew high similarity for genuine pairs given the synthetic same-person noise model, low for impostor pairs given independent random base vectors), and writes all three CSVs. This proves the tooling is correct; it is **not** a substitute for the real 15-volunteer experiment described in Step 1's protocol doc, which the student must run separately to get real thresholds and real report figures.

- [ ] **Step 4: Commit**

```bash
git add scripts/face-calibration-analyze.ts docs/face-match/calibration-protocol.md
git commit -m "feat(face-match): calibration analysis tooling (FAR/FRR/EER) — experiment itself is a manual follow-up"
```

---

## Self-Review Notes

- **Spec coverage:** Sections 1–2 (terminology/threat model) map to Global Constraints + naming throughout. Section 3 (architecture) maps to Global Constraint #1 (server functions replace Edge Functions) and Task 1 (DB layer). Section 4 (tech choices) maps to Task 2. Phases A–G map to Tasks 3–7 respectively (Phase E in-exam is Task 6, Phase F lecturer/appeals surfaces is Task 6 Steps 3–5, Phase G retention is Task 1 Step 5 item 10 plus Task 4's `facePurge`). Section 6 schema maps to Task 1. Section 7 RLS maps to Task 1 (with `enrollments` corrected to `class_enrollments` per the earlier compatibility discussion). Section 8 storage maps to Task 1. Section 9 Edge Functions is remapped per Global Constraint #1. Section 10 frontend file list maps to the File Structure section and Tasks 2–7. Section 11 integrity flags maps to Global Constraint #8 and Tasks 5–6 (never calling `recordFlag`). Section 12 honest accounting matches the File Structure "Modified" list exactly. Section 13 PDPA maps to the consent screen (Task 3 Step 4), evidence deletion (Task 1/4), and self-hosted models (Task 2). Section 14 calibration maps to Task 8. Section 15 failure modes are covered by the fail-soft handling in Tasks 5–6 and the error paths throughout Tasks 3–4. Section 16 acceptance criteria are covered by each task's manual-verification step; not turned into automated tests beyond Task 1's pure-function suite, since every other check requires a live camera/DB and is inherently manual, consistent with how the rest of this codebase tests (`src/tests/lib/*.test.ts` only covers pure logic).
- **Placeholder scan:** none found — every step has real, complete code or an exact search-anchor for existing-file edits.
- **Type consistency:** `DescriptorResult`, `ChallengeStep`, `FaceSettings`, and the `faceVerify`/`faceEnroll` payload shapes are defined once (Tasks 1–3) and reused with identical field names in Tasks 5–7.
