import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function run() {
  const { rows: users } = await pool.query(
    `SELECT id FROM auth.users WHERE email = $1`,
    ["raziqlaa11@gmail.com"]
  );
  if (!users.length) throw new Error("User raziqlaa11@gmail.com not found");
  const userId = users[0].id;
  console.log("User ID:", userId);

  const { rows: exams } = await pool.query(
    `SELECT id, title FROM public.exams WHERE title ILIKE $1 LIMIT 5`,
    ["%testing 1%"]
  );
  if (!exams.length) throw new Error('Exam matching "testing 1" not found');
  console.log("Exams found:", exams);
  const examId = exams[0].id;

  const { rows: subs } = await pool.query(
    `SELECT id, status FROM public.submissions WHERE student_id = $1 AND exam_id = $2`,
    [userId, examId]
  );
  if (!subs.length) throw new Error("No submission found for this user/exam");
  console.log("Current submission:", subs[0]);

  await pool.query(
    `UPDATE public.submissions SET status = 'retake-approved' WHERE id = $1`,
    [subs[0].id]
  );
  console.log("Updated submission", subs[0].id, "to retake-approved");

  await pool.end();
}

run().catch((err) => { console.error(err); process.exit(1); });
