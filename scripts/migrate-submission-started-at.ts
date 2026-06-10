import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Adding started_at to submissions…");

  await pool.query(`
    ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS started_at timestamptz;
  `);

  // Backfill: existing in-progress attempts anchor to their created_at so the
  // server can compute a sensible remaining-time window for them.
  const { rowCount } = await pool.query(`
    UPDATE submissions
       SET started_at = created_at
     WHERE started_at IS NULL
       AND status = 'in-progress';
  `);

  console.log(`✓  column added (backfilled ${rowCount ?? 0} in-progress rows)`);
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
