import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function clear() {
  await pool.query("DELETE FROM appeals");
  console.log("✓  appeals cleared");
  await pool.query("DELETE FROM essay_answers");
  console.log("✓  essay_answers cleared");
  await pool.query("DELETE FROM flag_reasons");
  console.log("✓  flag_reasons cleared");
  await pool.query("DELETE FROM submissions");
  console.log("✓  submissions cleared");
  await pool.query("DELETE FROM exam_questions");
  console.log("✓  exam_questions cleared");
  await pool.query("DELETE FROM exams");
  console.log("✓  exams cleared");
  await pool.end();
  console.log("All clear.");
}

clear().catch((err) => {
  console.error(err);
  process.exit(1);
});
