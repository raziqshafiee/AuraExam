import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS class_grade_config (
        id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        class_id    uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL UNIQUE,
        items       jsonb NOT NULL DEFAULT '[]',
        updated_at  timestamptz DEFAULT now()
      );

      ALTER TABLE class_grade_config ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "grade_config: lecturer write" ON class_grade_config;
      CREATE POLICY "grade_config: lecturer write" ON class_grade_config
        USING (
          EXISTS (SELECT 1 FROM classes WHERE id = class_id AND lecturer_id = auth.uid())
        )
        WITH CHECK (
          EXISTS (SELECT 1 FROM classes WHERE id = class_id AND lecturer_id = auth.uid())
        );

      DROP POLICY IF EXISTS "grade_config: student read" ON class_grade_config;
      CREATE POLICY "grade_config: student read" ON class_grade_config FOR SELECT
        USING (
          EXISTS (SELECT 1 FROM class_enrollments WHERE class_id = class_grade_config.class_id AND student_id = auth.uid())
          OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND lecturer_id = auth.uid())
          OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        );
    `);
    console.log("✓ class_grade_config table created");
  } finally {
    await client.end();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
