import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Adding grade + feedback columns to assignment_submissions…");

  await pool.query(`
    ALTER TABLE assignment_submissions
      ADD COLUMN IF NOT EXISTS grade    NUMERIC,
      ADD COLUMN IF NOT EXISTS feedback TEXT;
  `);
  console.log("✓  grade and feedback columns added");

  await pool.end();
  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
