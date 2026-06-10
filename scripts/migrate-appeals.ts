import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running appeals migration…");

  await pool.query(`DROP TABLE IF EXISTS appeals CASCADE;`);

  await pool.query(`
    CREATE TABLE appeals (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      exam_id       UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      type          TEXT NOT NULL CHECK (type IN ('score', 'integrity')),
      reason        TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
      lecturer_reply TEXT,
      submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_at    TIMESTAMPTZ,
      deadline_at   TIMESTAMPTZ NOT NULL,

      -- one appeal per type per submission
      UNIQUE (submission_id, type)
    );
  `);
  console.log("✓  appeals table created");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS appeals_exam_id_idx    ON appeals (exam_id);
    CREATE INDEX IF NOT EXISTS appeals_student_id_idx ON appeals (student_id);
    CREATE INDEX IF NOT EXISTS appeals_status_idx     ON appeals (status);
  `);
  console.log("✓  indexes created");

  await pool.query(`ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;`);

  await pool.query(`
    DROP POLICY IF EXISTS "students select own appeals" ON appeals;
    CREATE POLICY "students select own appeals" ON appeals
      FOR SELECT USING (student_id = auth.uid());
  `);

  await pool.query(`
    DROP POLICY IF EXISTS "students insert appeal" ON appeals;
    CREATE POLICY "students insert appeal" ON appeals
      FOR INSERT WITH CHECK (student_id = auth.uid());
  `);

  await pool.query(`
    DROP POLICY IF EXISTS "lecturers select exam appeals" ON appeals;
    CREATE POLICY "lecturers select exam appeals" ON appeals
      FOR SELECT USING (
        exam_id IN (
          SELECT e.id FROM exams e
          JOIN classes c ON c.id = e.class_id
          WHERE c.lecturer_id = auth.uid()
        )
      );
  `);

  await pool.query(`
    DROP POLICY IF EXISTS "lecturers update exam appeals" ON appeals;
    CREATE POLICY "lecturers update exam appeals" ON appeals
      FOR UPDATE USING (
        exam_id IN (
          SELECT e.id FROM exams e
          JOIN classes c ON c.id = e.class_id
          WHERE c.lecturer_id = auth.uid()
        )
      );
  `);

  console.log("✓  RLS policies applied");
  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
