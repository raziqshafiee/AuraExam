import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running assignments migration…");

  await pool.query(`DROP TABLE IF EXISTS student_file_submissions CASCADE;`);
  console.log("✓  student_file_submissions dropped");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_assignments (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id     UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      lecturer_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT,
      file_url     TEXT,
      file_name    TEXT,
      file_type    TEXT CHECK (file_type IN ('pdf', 'image', 'file')),
      start_at     TIMESTAMPTZ NOT NULL,
      end_at       TIMESTAMPTZ NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log("✓  class_assignments created");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id UUID NOT NULL REFERENCES class_assignments(id) ON DELETE CASCADE,
      class_id      UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      file_url      TEXT NOT NULL,
      file_name     TEXT NOT NULL,
      file_type     TEXT NOT NULL CHECK (file_type IN ('pdf', 'image', 'file')),
      status        TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (assignment_id, student_id)
    );
  `);
  console.log("✓  assignment_submissions created");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS class_assignments_class_id_idx    ON class_assignments (class_id);
    CREATE INDEX IF NOT EXISTS assignment_subs_assignment_id_idx ON assignment_submissions (assignment_id);
    CREATE INDEX IF NOT EXISTS assignment_subs_student_id_idx    ON assignment_submissions (student_id);
  `);
  console.log("✓  indexes created");

  await pool.query(`ALTER TABLE class_assignments      ENABLE ROW LEVEL SECURITY;`);
  await pool.query(`ALTER TABLE assignment_submissions  ENABLE ROW LEVEL SECURITY;`);

  await pool.query(`
    DROP POLICY IF EXISTS "lecturers manage own assignments" ON class_assignments;
    CREATE POLICY "lecturers manage own assignments" ON class_assignments
      USING (lecturer_id = auth.uid())
      WITH CHECK (lecturer_id = auth.uid());
  `);
  await pool.query(`
    DROP POLICY IF EXISTS "students view assignments" ON class_assignments;
    CREATE POLICY "students view assignments" ON class_assignments
      FOR SELECT USING (
        class_id IN (SELECT class_id FROM class_enrollments WHERE student_id = auth.uid())
      );
  `);

  await pool.query(`
    DROP POLICY IF EXISTS "students manage own assignment subs" ON assignment_submissions;
    CREATE POLICY "students manage own assignment subs" ON assignment_submissions
      USING (student_id = auth.uid())
      WITH CHECK (student_id = auth.uid());
  `);
  await pool.query(`
    DROP POLICY IF EXISTS "lecturers view assignment subs" ON assignment_submissions;
    CREATE POLICY "lecturers view assignment subs" ON assignment_submissions
      FOR SELECT USING (
        assignment_id IN (SELECT id FROM class_assignments WHERE lecturer_id = auth.uid())
      );
  `);
  await pool.query(`
    DROP POLICY IF EXISTS "lecturers update assignment subs" ON assignment_submissions;
    CREATE POLICY "lecturers update assignment subs" ON assignment_submissions
      FOR UPDATE USING (
        assignment_id IN (SELECT id FROM class_assignments WHERE lecturer_id = auth.uid())
      );
  `);

  console.log("✓  RLS policies applied");
  console.log("\nMigration complete.");
  console.log("Remember to create storage buckets in Supabase dashboard:");
  console.log("  - student-submissions (public)");
  console.log("  - class-materials (public)");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
