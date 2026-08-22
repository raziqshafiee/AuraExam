import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

// submissions.status carries a CHECK constraint defined directly in the
// Supabase Dashboard (not tracked by any migration script in this repo),
// which the Face ID plan's own grep-based check missed. It only allowed
// ('in-progress','submitted','graded','flagged','retake-approved') —
// checkInExam's 'checkin-pending' value violated it on every check-in
// attempt. Widening it here to include the new value.
async function migrate() {
  console.log("Widening submissions_status_check to allow 'checkin-pending'…");

  await pool.query(`
    ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
    ALTER TABLE submissions ADD CONSTRAINT submissions_status_check
      CHECK (status = ANY (ARRAY[
        'in-progress'::text,
        'submitted'::text,
        'graded'::text,
        'flagged'::text,
        'retake-approved'::text,
        'checkin-pending'::text
      ]));
  `);
  console.log("✓  submissions_status_check now allows 'checkin-pending'");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
