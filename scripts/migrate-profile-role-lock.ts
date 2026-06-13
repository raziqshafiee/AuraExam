import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

// C-1 fix: lock profiles.role / profiles.status against self-escalation.
//
// The "profiles: update own" RLS policy allows a user to update their own row
// (auth.uid() = id) with NO column restriction — so a student could set
// role='admin' and then pass every server-side role gate. This trigger blocks
// any change to role/status unless the caller is the service role
// (auth.uid() IS NULL — used by trusted admin server functions like banUser) or
// an existing admin. Name changes and other self-edits are unaffected.
async function migrate() {
  console.log("Locking profiles.role / profiles.status against self-escalation…");

  await pool.query(`
    create or replace function public.enforce_profile_role_lock()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $$
    begin
      if (new.role is distinct from old.role)
         or (new.status is distinct from old.status) then
        if auth.uid() is not null
           and not exists (
             select 1 from public.profiles where id = auth.uid() and role = 'admin'
           ) then
          raise exception 'Not authorized to modify role or status';
        end if;
      end if;
      return new;
    end;
    $$;
  `);
  console.log("✓  enforce_profile_role_lock() created");

  await pool.query(`
    drop trigger if exists trg_enforce_profile_role_lock on public.profiles;
    create trigger trg_enforce_profile_role_lock
      before update on public.profiles
      for each row execute function public.enforce_profile_role_lock();
  `);
  console.log("✓  trg_enforce_profile_role_lock attached");

  await pool.end();
  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
