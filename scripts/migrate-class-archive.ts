import { Client } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function run() {
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE classes ADD COLUMN IF NOT EXISTS archived_at timestamptz;

      ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "classes: lecturer update own" ON classes;
      CREATE POLICY "classes: lecturer update own" ON classes FOR UPDATE
        USING (lecturer_id = auth.uid())
        WITH CHECK (lecturer_id = auth.uid());

      DROP POLICY IF EXISTS "classes: admin update" ON classes;
      CREATE POLICY "classes: admin update" ON classes FOR UPDATE
        USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
        WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

      DROP POLICY IF EXISTS "classes: lecturer delete own empty" ON classes;
      CREATE POLICY "classes: lecturer delete own empty" ON classes FOR DELETE
        USING (
          lecturer_id = auth.uid()
          AND NOT EXISTS (SELECT 1 FROM class_enrollments WHERE class_id = classes.id)
        );
    `);
    console.log("✓ classes.archived_at added; lecturer update/delete-when-empty RLS policies in place");
  } finally {
    await client.end();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
