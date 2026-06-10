import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running notifications migration…");

  await pool.query(`DROP TABLE IF EXISTS notifications CASCADE;`);

  await pool.query(`
    CREATE TABLE notifications (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      type         TEXT NOT NULL,
      title        TEXT NOT NULL,
      body         TEXT,
      link         TEXT,
      read_at      TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log("✓  notifications table created");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);
    CREATE INDEX IF NOT EXISTS notifications_read_at_idx ON notifications (user_id, read_at);
  `);
  console.log("✓  indexes created");

  await pool.query(`ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;`);

  await pool.query(`
    DROP POLICY IF EXISTS "notifications: user select own" ON notifications;
    CREATE POLICY "notifications: user select own" ON notifications
      FOR SELECT USING (user_id = auth.uid());
  `);

  await pool.query(`
    DROP POLICY IF EXISTS "notifications: authenticated insert" ON notifications;
    CREATE POLICY "notifications: authenticated insert" ON notifications
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  `);

  await pool.query(`
    DROP POLICY IF EXISTS "notifications: user update own" ON notifications;
    CREATE POLICY "notifications: user update own" ON notifications
      FOR UPDATE USING (user_id = auth.uid());
  `);

  console.log("✓  RLS policies applied");
  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
