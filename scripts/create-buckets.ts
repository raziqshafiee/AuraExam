import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function createBuckets() {
  const buckets = [
    { id: "class-materials", name: "class-materials" },
    { id: "student-submissions", name: "student-submissions" },
  ];

  for (const bucket of buckets) {
    await pool.query(
      `INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
       VALUES ($1, $2, true, now(), now())
       ON CONFLICT (id) DO UPDATE SET public = true, updated_at = now();`,
      [bucket.id, bucket.name]
    );
    console.log(`✓  bucket "${bucket.name}" created/updated (public)`);
  }

  // Storage RLS policies for class-materials (lecturers upload, anyone authenticated reads)
  await pool.query(`
    DROP POLICY IF EXISTS "class-materials authenticated read" ON storage.objects;
    CREATE POLICY "class-materials authenticated read" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'class-materials');
  `);
  await pool.query(`
    DROP POLICY IF EXISTS "class-materials authenticated upload" ON storage.objects;
    CREATE POLICY "class-materials authenticated upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'class-materials');
  `);
  await pool.query(`
    DROP POLICY IF EXISTS "class-materials owner delete" ON storage.objects;
    CREATE POLICY "class-materials owner delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'class-materials' AND owner = auth.uid());
  `);
  console.log("✓  class-materials storage policies set");

  // Storage RLS policies for student-submissions
  await pool.query(`
    DROP POLICY IF EXISTS "student-submissions authenticated read" ON storage.objects;
    CREATE POLICY "student-submissions authenticated read" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'student-submissions');
  `);
  await pool.query(`
    DROP POLICY IF EXISTS "student-submissions student upload" ON storage.objects;
    CREATE POLICY "student-submissions student upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'student-submissions');
  `);
  console.log("✓  student-submissions storage policies set");

  await pool.end();
  console.log("Done.");
}

createBuckets().catch((err) => {
  console.error(err);
  process.exit(1);
});
