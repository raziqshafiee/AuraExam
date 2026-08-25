import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Removing lecturer admin-approval gate…");

  // Backfill: any lecturer stuck at 'pending' (there was never an "Approve" action
  // to clear it) becomes active immediately, same as students already are.
  const backfill = await pool.query(
    `UPDATE profiles SET status = 'active' WHERE role = 'lecturer' AND status = 'pending';`
  );
  console.log(`✓  Backfilled ${backfill.rowCount} pending lecturer(s) to active`);

  // New signups: lecturers now get 'active' on signup, same as students.
  // Email confirmation (Supabase's own "Confirm email" auth setting) is the
  // only gate left before either role can sign in.
  await pool.query(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      INSERT INTO public.profiles (id, name, role, status)
      VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
        CASE WHEN NEW.raw_user_meta_data->>'role' = 'lecturer' THEN 'lecturer' ELSE 'student' END,
        'active'
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $$;
  `);
  console.log("✓  handle_new_user() no longer sets lecturers to 'pending'");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
