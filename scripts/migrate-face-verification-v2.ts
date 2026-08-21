// scripts/migrate-face-verification-v2.ts
//
// Additive follow-up to migrate-face-verification.ts for the upload-based
// enrollment redesign: matric card + profile photo upload (replacing live
// card-holding), OCR'd name/matric cross-check, and lecturer-routed review
// for OCR failures (separate from the existing admin review queue).
import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running face-verification-v2 migration…");

  // 1. New evidence paths — separate card photo and profile photo storage
  // objects, replacing the old single co-presence evidence_path for new
  // enrollments (evidence_path stays for legacy rows / facePurge continues
  // to sweep it too).
  await pool.query(`
    ALTER TABLE face_enrollments
      ADD COLUMN IF NOT EXISTS card_image_path text,
      ADD COLUMN IF NOT EXISTS profile_image_path text,
      ADD COLUMN IF NOT EXISTS profile_live_score double precision,
      ADD COLUMN IF NOT EXISTS ocr_name_extracted text,
      ADD COLUMN IF NOT EXISTS ocr_matric_extracted text,
      ADD COLUMN IF NOT EXISTS pending_reason text;
  `);
  await pool.query(
    `ALTER TABLE face_enrollments DROP CONSTRAINT IF EXISTS face_enrollments_pending_reason_check;`,
  );
  await pool.query(`
    ALTER TABLE face_enrollments ADD CONSTRAINT face_enrollments_pending_reason_check
      CHECK (pending_reason IS NULL OR pending_reason IN ('face_score','ocr_mismatch'));
  `);
  console.log(
    "OK  face_enrollments gained card_image_path, profile_image_path, profile_live_score, ocr_name_extracted, ocr_matric_extracted, pending_reason",
  );

  // 2. Index so the new lecturer review queue (pending_reason = 'ocr_mismatch',
  // scoped to the lecturer's classes via class_enrollments) doesn't need a
  // full scan of face_enrollments.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS face_enrollments_pending_reason_idx
      ON face_enrollments (pending_reason, created_at) WHERE status = 'pending';
  `);
  console.log("OK  face_enrollments_pending_reason_idx created");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
