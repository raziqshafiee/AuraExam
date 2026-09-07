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
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
