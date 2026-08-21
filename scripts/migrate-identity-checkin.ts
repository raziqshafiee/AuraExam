// scripts/migrate-identity-checkin.ts
//
// Adds the identity_checkin_queue table for the exam-lobby hard-block
// redesign — see docs/superpowers/specs/2026-08-21-identity-checkin-hardblock-design.md.
import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running identity-checkin migration…");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS identity_checkin_queue (
      id            uuid primary key default gen_random_uuid(),
      user_id       uuid not null references auth.users(id) on delete cascade,
      exam_id       uuid not null references exams(id) on delete cascade,
      queued_at     timestamptz not null default now(),
      status        text not null default 'waiting'
                      check (status in ('waiting','cleared','auto_admitted','rejected')),
      cleared_by    uuid references auth.users(id),
      cleared_at    timestamptz,
      reject_reason text,
      unique (user_id, exam_id)
    );
  `);
  console.log("OK  identity_checkin_queue table created");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS identity_checkin_queue_exam_status_idx
      ON identity_checkin_queue (exam_id, status);
  `);
  console.log("OK  identity_checkin_queue_exam_status_idx created");

  await pool.query(`ALTER TABLE identity_checkin_queue ENABLE ROW LEVEL SECURITY;`);
  // No client policies at all — every access goes through createAdminClient()
  // inside an authorization-checked server function, same pattern as
  // face_enrollments/face_challenges.
  console.log("OK  RLS enabled, no client policies (service-role only)");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
