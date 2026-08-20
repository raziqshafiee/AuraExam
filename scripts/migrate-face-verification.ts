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

  // 10. Final-review Finding 8: this pg_cron job was found to RACE with
  //     facePurge (the admin server function in src/lib/supabase/face.ts).
  //     The job nulled face_verifications.evidence_path directly via SQL,
  //     but facePurge filters .not("evidence_path", "is", null) to find rows
  //     whose storage object it still needs to delete. If the cron job nulled
  //     the column first, the storage path was lost forever and the JPEG
  //     became a permanently orphaned object in the private bucket — a real
  //     retention/PDPA correctness bug for biometric evidence.
  //
  //     Fix: remove this SQL-only job entirely and let facePurge own the
  //     whole sweep — it already correctly deletes the storage object THEN
  //     nulls the column, atomically per-row, for BOTH face_enrollments and
  //     face_verifications. Two independent, uncoordinated purge mechanisms
  //     touching the same column was the actual root cause, not a timing
  //     tweak. facePurge is a proper admin-gated server function; it can be
  //     triggered manually or wired to a real scheduled trigger later
  //     (mirroring the syncExamStatuses fallback pattern already used for
  //     exam lifecycle) — it does NOT need pg_cron.
  //
  //     This unschedule call actively removes the job from cron.job in the
  //     live database if Task 1's original run already scheduled it there —
  //     merely not re-scheduling it here would leave a stale prior run
  //     active. Do NOT re-add a cron.schedule(...) call for this job.
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_cron;`);
    await pool.query(`
      SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'face-evidence-purge-mark';
    `).catch(() => {});
    console.log("OK  pg_cron job 'face-evidence-purge-mark' unscheduled (facePurge now owns the whole sweep)");
  } catch (e: any) {
    console.warn(`!!  pg_cron unschedule skipped (${e?.message ?? e}) — check cron.job manually if pg_cron is enabled.`);
  }

  // 11. pgvector duplicate-scan helper — SQL function so the 1:N cosine-distance
  //     scan runs inside Postgres using the ivfflat index, not row-by-row in JS.
  //     (Added while implementing Task 3 — schema addition discovered during
  //     enrollment-flow work, hence appended here rather than in Task 1.)
  await pool.query(`
    CREATE OR REPLACE FUNCTION face_find_duplicates(probe vector(1024), exclude_user uuid, threshold double precision)
    RETURNS TABLE(user_id uuid, similarity double precision) AS $$
      SELECT user_id, 1 - (embedding_reference <=> probe) AS similarity
      FROM face_enrollments
      WHERE status = 'active'
        AND user_id != exclude_user
        AND 1 - (embedding_reference <=> probe) >= threshold
    $$ LANGUAGE sql STABLE;
  `);
  console.log("OK  face_find_duplicates() function created");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
