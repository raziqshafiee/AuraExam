import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Adding lecturer UPDATE policy on submissions…");

  await pool.query(`
    DROP POLICY IF EXISTS "lecturers update submissions for their exams" ON submissions;
    CREATE POLICY "lecturers update submissions for their exams" ON submissions
      FOR UPDATE USING (
        exam_id IN (
          SELECT e.id FROM exams e
          JOIN classes c ON c.id = e.class_id
          WHERE c.lecturer_id = auth.uid()
        )
      );
  `);

  console.log("✓  policy created");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
