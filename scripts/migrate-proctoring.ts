import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running proctoring migration…");

  // 1. Heartbeat anchor — refreshed by the client every few seconds while the
  //    exam is in progress. A stale last_seen_at tells a lecturer the tab was
  //    closed / the student disconnected.
  await pool.query(`
    ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
  `);
  console.log("✓  submissions.last_seen_at added");

  // 2. Private bucket for periodic face snapshots. NOT public — access is only
  //    via signed URLs minted server-side for the owning lecturer/student.
  await pool.query(`
    INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
    VALUES ('proctor-snapshots', 'proctor-snapshots', false, now(), now())
    ON CONFLICT (id) DO UPDATE SET public = false, updated_at = now();
  `);
  console.log("✓  proctor-snapshots bucket created (private)");

  // 3. Storage RLS. Object path convention: "{submission_id}/{timestamp}.jpg",
  //    so the first path segment identifies the submission it belongs to.

  // Student may upload snapshots only into their own in-progress submission's folder.
  await pool.query(`
    DROP POLICY IF EXISTS "proctor-snapshots student upload" ON storage.objects;
    CREATE POLICY "proctor-snapshots student upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'proctor-snapshots'
        AND EXISTS (
          SELECT 1 FROM submissions s
          WHERE s.id::text = (storage.foldername(name))[1]
            AND s.student_id = auth.uid()
        )
      );
  `);

  // Student may read their own snapshots; lecturers may read snapshots for
  // submissions belonging to exams in classes they own.
  await pool.query(`
    DROP POLICY IF EXISTS "proctor-snapshots owner+lecturer read" ON storage.objects;
    CREATE POLICY "proctor-snapshots owner+lecturer read" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'proctor-snapshots'
        AND EXISTS (
          SELECT 1 FROM submissions s
          JOIN exams e ON e.id = s.exam_id
          JOIN classes c ON c.id = e.class_id
          WHERE s.id::text = (storage.foldername(name))[1]
            AND (s.student_id = auth.uid() OR c.lecturer_id = auth.uid())
        )
      );
  `);
  console.log("✓  proctor-snapshots storage policies set");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
