import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

// The Face ID module writes audit_log rows with category='identity', but the
// original audit_log CHECK constraint (defined in supabase/schema.sql) only
// allowed ('user_management','exam','integrity','appeal','class','general').
// Every Face ID audit insert was silently rejected by the DB — and writeAudit
// swallows errors by design, so the trail vanished. Widen the constraint.
async function migrate() {
  console.log("Widening audit_log category to allow 'identity'…");

  await pool.query(`
    ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_category_check;
    ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check
      CHECK (category = ANY (ARRAY[
        'user_management'::text,
        'exam'::text,
        'integrity'::text,
        'appeal'::text,
        'class'::text,
        'general'::text,
        'identity'::text
      ]));
  `);
  console.log("✓  audit_log.category now accepts 'identity'");

  await pool.end();
  console.log("\nMigration complete.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
