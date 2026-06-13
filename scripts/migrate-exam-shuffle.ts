import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Adding shuffle to exams…");

  await pool.query(`
    ALTER TABLE exams
      ADD COLUMN IF NOT EXISTS shuffle boolean NOT NULL DEFAULT false;
  `);

  console.log("✓  column added (existing exams default to no shuffle)");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
