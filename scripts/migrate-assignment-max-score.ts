import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Adding max_score column to class_assignments…");

  await pool.query(`
    ALTER TABLE class_assignments
      ADD COLUMN IF NOT EXISTS max_score NUMERIC;
  `);
  console.log("✓  max_score column added");

  await pool.end();
  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
