/**
 * Wipes all data except the admin account.
 * Run: npm run clear:all
 *
 * Deletion order respects FK constraints (children before parents).
 */
import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function clearAll() {
  // ── 0. Find admin IDs to keep ─────────────────────────────────
  const { rows: admins } = await pool.query(
    `SELECT id FROM profiles WHERE role = 'admin'`
  );
  if (admins.length === 0) {
    console.error("✗  No admin profile found. Aborting to avoid total wipe.");
    process.exit(1);
  }
  const adminIds = admins.map((r: { id: string }) => r.id);
  console.log(`✓  Keeping ${adminIds.length} admin account(s): ${adminIds.join(", ")}`);

  const placeholders = adminIds.map((_: string, i: number) => `$${i + 1}`).join(", ");

  // ── 1. Transactional tables ───────────────────────────────────
  await pool.query(`DELETE FROM appeals`);
  console.log("✓  appeals cleared");

  await pool.query(`DELETE FROM essay_answers`);
  console.log("✓  essay_answers cleared");

  await pool.query(`DELETE FROM flag_reasons`);
  console.log("✓  flag_reasons cleared");

  await pool.query(`DELETE FROM submissions`);
  console.log("✓  submissions cleared");

  // ── 2. Assignment tables ──────────────────────────────────────
  await pool.query(`DELETE FROM assignment_submissions`);
  console.log("✓  assignment_submissions cleared");

  await pool.query(`DELETE FROM class_assignments`);
  console.log("✓  class_assignments cleared");

  // ── 3. Exam tables ────────────────────────────────────────────
  await pool.query(`DELETE FROM exam_questions`);
  console.log("✓  exam_questions cleared");

  await pool.query(`DELETE FROM exams`);
  console.log("✓  exams cleared");

  // ── 4. Question bank ──────────────────────────────────────────
  await pool.query(`DELETE FROM questions`);
  console.log("✓  questions cleared");

  // ── 5. Class tables ───────────────────────────────────────────
  for (const table of ["class_notes", "announcements"]) {
    try {
      await pool.query(`DELETE FROM ${table}`);
      console.log(`✓  ${table} cleared`);
    } catch {
      console.log(`→  ${table} table not found, skipping`);
    }
  }

  await pool.query(`DELETE FROM class_enrollments`);
  console.log("✓  class_enrollments cleared");

  await pool.query(`DELETE FROM classes`);
  console.log("✓  classes cleared");

  // ── 6. Notifications & audit ──────────────────────────────────
  await pool.query(`DELETE FROM notifications`);
  console.log("✓  notifications cleared");

  await pool.query(`DELETE FROM audit_log`);
  console.log("✓  audit_log cleared");

  // ── 7. Non-admin profiles ─────────────────────────────────────
  await pool.query(
    `DELETE FROM profiles WHERE id NOT IN (${placeholders})`,
    adminIds
  );
  console.log("✓  non-admin profiles cleared");

  // ── 8. Non-admin auth users ───────────────────────────────────
  await pool.query(
    `DELETE FROM auth.users WHERE id NOT IN (${placeholders})`,
    adminIds
  );
  console.log("✓  non-admin auth.users cleared");

  await pool.end();
  console.log("\nDone. Only admin account remains.");
  console.log("Admin credentials: admin@aura.edu / Admin123!");
}

clearAll().catch((err) => {
  console.error("Clear failed:", err.message);
  process.exit(1);
});
