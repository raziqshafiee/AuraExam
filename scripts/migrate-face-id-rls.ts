import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Locking down Face ID biometric data…");

  // 1. user_facial_profiles shipped with RLS disabled, which left every
  //    student's biometric row readable AND writable by any authenticated
  //    caller through PostgREST. Enable RLS.
  await pool.query(`ALTER TABLE user_facial_profiles ENABLE ROW LEVEL SECURITY;`);
  console.log("✓  RLS enabled on user_facial_profiles");

  // 2. Exactly one policy: a user may read their own row. There is
  //    deliberately NO INSERT/UPDATE/DELETE policy — every write goes through
  //    the service-role admin client (which bypasses RLS), so a student can
  //    never self-verify by writing status='VERIFIED' directly.
  await pool.query(`
    DROP POLICY IF EXISTS "facial profile owner read" ON user_facial_profiles;
    CREATE POLICY "facial profile owner read" ON user_facial_profiles
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  `);
  console.log("✓  owner-only SELECT policy created (no client-side writes)");

  // 3. The submissions RLS policy legitimately lets a student UPDATE their own
  //    row (answers, status, flags…). That must stay, but the check-in and
  //    trust-score columns are security decisions the server owns — a student
  //    must not be able to PATCH checkin_status='verified' onto their own row.
  //
  //    Postgres note: a bare `REVOKE UPDATE (col) … FROM authenticated` is a
  //    no-op while the role still holds a *table-level* UPDATE grant (the table
  //    grant implies every column). The only way to express "all columns except
  //    these five" is to drop the table grant and grant the allowed columns
  //    back explicitly.
  //
  //    MAINTENANCE: any NEW column added to `submissions` later must be added
  //    to the GRANT list below, or client-context updates to it will fail.
  await pool.query(`
    REVOKE UPDATE ON submissions FROM authenticated, anon;
    GRANT UPDATE (
      id, exam_id, student_id, status, score, total, flags, appeal_required,
      submitted_at, created_at, auto_score, started_at, last_seen_at
    ) ON submissions TO authenticated, anon;
  `);
  console.log("✓  checkin_status/check_in_score/checkin_attempts/checked_in_at/trust_score");
  console.log("   are no longer UPDATE-able by authenticated or anon");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
