import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running Face ID migration…");

  // 1. Drop the old Face Match tables/columns — replaced fresh, no data worth
  //    preserving into the new shape (see spec §2).
  await pool.query(`
    DROP TABLE IF EXISTS identity_checkin_queue CASCADE;
    DROP TABLE IF EXISTS face_challenges CASCADE;
    DROP TABLE IF EXISTS face_verifications CASCADE;
    DROP TABLE IF EXISTS face_enrollments CASCADE;
    DROP TABLE IF EXISTS face_enrollment_sessions CASCADE;
    ALTER TABLE exams DROP COLUMN IF EXISTS require_identity_verification;
    ALTER TABLE profiles DROP COLUMN IF EXISTS matric_no;
  `);
  console.log("✓  old Face Match tables/columns dropped");

  // 2. Registration & enrollment.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_facial_profiles (
      user_id                UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      status                 TEXT NOT NULL DEFAULT 'UNREGISTERED'
                               CHECK (status IN ('UNREGISTERED','VERIFIED','PENDING_REVIEW','REJECTED')),
      baseline_embedding     JSONB,
      pending_embedding      JSONB,
      photo_url              TEXT,
      is_photo_locked        BOOLEAN NOT NULL DEFAULT FALSE,
      verification_attempts  INT NOT NULL DEFAULT 0,
      last_photo_update      TIMESTAMPTZ,
      approved_by            UUID REFERENCES profiles(id),
      rejection_reason       TEXT,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log("✓  user_facial_profiles created");

  // 3. Per-exam opt-in toggle (recreated).
  await pool.query(`
    ALTER TABLE exams ADD COLUMN IF NOT EXISTS require_identity_verification BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  console.log("✓  exams.require_identity_verification added");

  // 4. Check-in + trust score on the existing submissions table.
  await pool.query(`
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS checkin_status TEXT
      CHECK (checkin_status IN ('pending','verified','checkin-pending-review','rejected'));
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS check_in_score NUMERIC;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS checkin_attempts INT NOT NULL DEFAULT 0;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS trust_score INT;
  `);
  console.log("✓  submissions check-in/trust-score columns added");

  // 5. Identity-continuity evidence on the existing flag_reasons table.
  await pool.query(`
    ALTER TABLE flag_reasons ADD COLUMN IF NOT EXISTS snapshot_url TEXT;
    ALTER TABLE flag_reasons ADD COLUMN IF NOT EXISTS confidence_score NUMERIC;
  `);
  console.log("✓  flag_reasons snapshot/confidence columns added");

  // 6. Private bucket for locked passport photos + review-evidence snapshots.
  await pool.query(`
    INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
    VALUES ('facial-profiles', 'facial-profiles', false, now(), now())
    ON CONFLICT (id) DO UPDATE SET public = false, updated_at = now();
  `);
  console.log("✓  facial-profiles bucket created (private)");

  // 7. Storage RLS. Path convention: "{user_id}/passport.jpg" and
  //    "{user_id}/review-{timestamp}.jpg".
  await pool.query(`
    DROP POLICY IF EXISTS "facial-profiles owner upload" ON storage.objects;
    CREATE POLICY "facial-profiles owner upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'facial-profiles'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  `);
  await pool.query(`
    DROP POLICY IF EXISTS "facial-profiles owner+reviewer read" ON storage.objects;
    CREATE POLICY "facial-profiles owner+reviewer read" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'facial-profiles'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('lecturer', 'admin')
          )
        )
      );
  `);
  console.log("✓  facial-profiles storage policies set");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
