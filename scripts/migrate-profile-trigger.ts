import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running profile-creation trigger migration…");

  await pool.query(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      -- Self-registration may only produce 'student' or 'lecturer'. 'admin' (and any
      -- other value) is never trusted from client-supplied raw_user_meta_data —
      -- admin accounts are granted exclusively via the seed:admin script.
      INSERT INTO public.profiles (id, name, role, status)
      VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
        CASE WHEN NEW.raw_user_meta_data->>'role' = 'lecturer' THEN 'lecturer' ELSE 'student' END,
        CASE WHEN NEW.raw_user_meta_data->>'role' = 'lecturer' THEN 'pending' ELSE 'active' END
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $$;
  `);
  console.log("✓  handle_new_user() function created");

  await pool.query(`DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;`);
  await pool.query(`
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  `);
  console.log("✓  on_auth_user_created trigger created");

  // GoTrue's role needs EXECUTE on the trigger function to complete the auth.users insert.
  await pool.query(`GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;`);
  console.log("✓  granted EXECUTE to supabase_auth_admin");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
