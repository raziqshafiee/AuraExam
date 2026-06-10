import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Client } = pg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    ALTER TABLE classes
      ADD COLUMN IF NOT EXISTS exam_weight integer NOT NULL DEFAULT 100;

    ALTER TABLE exams
      ADD COLUMN IF NOT EXISTS subject_weight integer;

    ALTER TABLE class_assignments
      ADD COLUMN IF NOT EXISTS subject_weight integer;
  `);

  console.log("Migration complete: subject grade columns added.");
  await client.end();
}

main().catch(console.error);
