import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Adding reviewed_at/reviewed_by to submissions…");

  await pool.query(`
    ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
  `);

  console.log("✓  submissions.reviewed_at / reviewed_by added");

  // Backfill: appeals resolved before this column existed never marked their
  // submission reviewed, so those flagged submissions are stuck on the
  // "needs attention" queues forever even though a lecturer already decided
  // them. appeals has no resolved-by column, so reviewed_by stays NULL here.
  const { rowCount } = await pool.query(`
    UPDATE submissions s
    SET reviewed_at = a.decided_at
    FROM appeals a
    WHERE a.submission_id = s.id
      AND a.status IN ('approved', 'rejected')
      AND a.decided_at IS NOT NULL
      AND s.reviewed_at IS NULL;
  `);
  console.log(`✓  backfilled reviewed_at for ${rowCount} submission(s) with an already-resolved appeal`);

  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
