import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running exam-lifecycle migration…");

  // 1. Widen the status CHECK to include the new 'closed' state.
  //    draft → upcoming → live → closed → graded
  await pool.query(`ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_status_check;`);
  await pool.query(`
    ALTER TABLE exams
      ADD CONSTRAINT exams_status_check
      CHECK (status IN ('draft','upcoming','live','closed','graded'));
  `);
  console.log("✓  exams.status CHECK now allows 'closed'");

  // 2. The state machine, server-side and authoritative. Runs every minute via
  //    pg_cron (below) so an exam's status reflects reality even with zero app
  //    traffic. SECURITY DEFINER so the scheduled run bypasses RLS for updates.
  await pool.query(`
    CREATE OR REPLACE FUNCTION sync_exam_statuses()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      -- upcoming -> live : start time reached
      UPDATE exams
         SET status = 'live'
       WHERE status = 'upcoming'
         AND start_time <= now();

      -- live -> closed : end time reached
      UPDATE exams
         SET status = 'closed'
       WHERE status = 'live'
         AND end_time <= now();

      -- live -> closed : every enrolled student already has a terminal submission
      UPDATE exams e
         SET status = 'closed'
       WHERE e.status = 'live'
         AND EXISTS (SELECT 1 FROM class_enrollments ce WHERE ce.class_id = e.class_id)
         AND NOT EXISTS (
           SELECT 1 FROM class_enrollments ce
            WHERE ce.class_id = e.class_id
              AND NOT EXISTS (
                SELECT 1 FROM submissions s
                 WHERE s.exam_id = e.id
                   AND s.student_id = ce.student_id
                   AND s.status IN ('submitted','graded','flagged')
              )
         );

      -- closed -> graded : has submissions and no essay answer is still ungraded
      UPDATE exams e
         SET status = 'graded'
       WHERE e.status = 'closed'
         AND EXISTS (
           SELECT 1 FROM submissions s
            WHERE s.exam_id = e.id
              AND s.status IN ('submitted','graded','flagged')
         )
         AND NOT EXISTS (
           SELECT 1 FROM essay_answers ea
             JOIN submissions s ON s.id = ea.submission_id
            WHERE s.exam_id = e.id
              AND ea.score IS NULL
         );
    END
    $fn$;
  `);
  console.log("✓  sync_exam_statuses() created");

  // 3. Schedule it every minute with pg_cron. Best-effort: if the extension is
  //    not available on this project, the migration still succeeds and the
  //    syncExamStatuses() server function can be triggered externally instead.
  let cronScheduled = false;
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_cron;`);
    await pool.query(`
      DO $do$
      BEGIN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'exam-status-sync') THEN
          PERFORM cron.unschedule('exam-status-sync');
        END IF;
      END
      $do$;
    `);
    await pool.query(
      `SELECT cron.schedule('exam-status-sync', '* * * * *', $$ SELECT sync_exam_statuses(); $$);`
    );
    cronScheduled = true;
    console.log("✓  pg_cron job 'exam-status-sync' scheduled (every minute)");
  } catch (e: any) {
    console.warn(
      `!  pg_cron not scheduled (${e?.message ?? e}). Enable the pg_cron extension and re-run, ` +
        `or trigger syncExamStatuses() from an external scheduler.`
    );
  }

  // 4. Correct existing rows immediately so nothing lingers in a stale state.
  await pool.query(`SELECT sync_exam_statuses();`);
  console.log("✓  ran an initial sync over existing exams");

  console.log(cronScheduled ? "\nMigration complete." : "\nMigration complete (manual scheduling required).");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
