import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function migrate() {
  console.log("Running audit-log registration trigger migration…");

  await pool.query(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_name TEXT := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1));
      v_role TEXT := CASE WHEN NEW.raw_user_meta_data->>'role' = 'lecturer' THEN 'lecturer' ELSE 'student' END;
      v_status TEXT := CASE WHEN v_role = 'lecturer' THEN 'pending' ELSE 'active' END;
    BEGIN
      -- Self-registration may only produce 'student' or 'lecturer'. 'admin' (and any
      -- other value) is never trusted from client-supplied raw_user_meta_data —
      -- admin accounts are granted exclusively via the seed:admin script.
      INSERT INTO public.profiles (id, name, role, status)
      VALUES (NEW.id, v_name, v_role, v_status)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.audit_log (actor_id, action, target, category)
      VALUES (NEW.id, 'Registered account', v_name || ' (' || v_role || ')', 'user_management');

      RETURN NEW;
    END;
    $$;
  `);
  console.log("✓  handle_new_user() function updated (now logs registrations to audit_log)");

  await pool.query(`DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;`);
  await pool.query(`
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  `);
  console.log("✓  on_auth_user_created trigger re-created");

  await pool.query(`GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;`);
  console.log("✓  granted EXECUTE to supabase_auth_admin");

  console.log("\nMigration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
