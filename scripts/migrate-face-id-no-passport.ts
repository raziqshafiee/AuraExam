import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

// The passport-photo-upload enrollment step (and its PENDING_REVIEW/REJECTED
// manual-review path) is removed — enrollment is now a single live webcam
// capture that either succeeds or the student retries. See
// docs/superpowers/specs/2026-09-09-face-id-no-passport-redesign.md.
async function migrate() {
  console.log("Dropping passport-review columns from user_facial_profiles…");

  await pool.query(`
    UPDATE user_facial_profiles SET status = 'UNREGISTERED' WHERE status IN ('PENDING_REVIEW','REJECTED');
  `);
  console.log("✓  in-flight PENDING_REVIEW/REJECTED rows collapsed to UNREGISTERED");

  await pool.query(`
    ALTER TABLE user_facial_profiles DROP CONSTRAINT IF EXISTS user_facial_profiles_status_check;
    ALTER TABLE user_facial_profiles ADD CONSTRAINT user_facial_profiles_status_check
      CHECK (status IN ('UNREGISTERED','VERIFIED'));
  `);
  console.log("✓  status constraint narrowed to UNREGISTERED/VERIFIED");

  await pool.query(`
    ALTER TABLE user_facial_profiles DROP COLUMN IF EXISTS pending_embedding;
    ALTER TABLE user_facial_profiles DROP COLUMN IF EXISTS verification_attempts;
    ALTER TABLE user_facial_profiles DROP COLUMN IF EXISTS rejection_reason;
  `);
  console.log("✓  pending_embedding, verification_attempts, rejection_reason dropped");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
