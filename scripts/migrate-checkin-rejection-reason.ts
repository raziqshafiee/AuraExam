import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

// reviewCheckin accepts a `reason` on 'reject' but had nowhere to persist it,
// so the student could never see why their check-in was rejected. Add a
// server-owned column to carry that reason into the student lobby.
async function migrate() {
  console.log("Adding submissions.checkin_rejection_reason…");

  await pool.query(`
    ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS checkin_rejection_reason TEXT;
  `);
  console.log("✓  submissions.checkin_rejection_reason added");

  await pool.end();
  console.log("\nMigration complete.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
