import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

const ADMIN_EMAIL = "admin@aura.edu";
const ADMIN_PASSWORD = "Admin123!";
const ADMIN_NAME = "Admin";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function seed() {
  // Ensure pgcrypto is available for password hashing
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  // Check if user already exists in auth.users
  const { rows: existing } = await pool.query(
    `SELECT id FROM auth.users WHERE email = $1`,
    [ADMIN_EMAIL]
  );

  const meta = JSON.stringify({ name: ADMIN_NAME, role: "admin" });
  const appMeta = JSON.stringify({ provider: "email", providers: ["email"] });

  let adminId: string;

  if (existing.length > 0) {
    adminId = existing[0].id;
    // Promote existing user to admin
    await pool.query(
      `UPDATE auth.users
       SET raw_user_meta_data = $1::jsonb,
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
       WHERE id = $2`,
      [meta, adminId]
    );
    console.log(`↑  Promoted existing user to admin (${ADMIN_EMAIL})`);
  } else {
    // Create brand-new admin user directly in auth.users
    const { rows } = await pool.query(
      `INSERT INTO auth.users (
         instance_id, id, aud, role, email,
         encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at,
         confirmation_token, recovery_token,
         email_change, email_change_token_new, email_change_token_current,
         is_sso_user
       ) VALUES (
         '00000000-0000-0000-0000-000000000000',
         gen_random_uuid(),
         'authenticated', 'authenticated',
         $1,
         crypt($2, gen_salt('bf')),
         now(),
         $3::jsonb, $4::jsonb,
         now(), now(),
         '', '', '', '', '',
         false
       ) RETURNING id`,
      [ADMIN_EMAIL, ADMIN_PASSWORD, appMeta, meta]
    );
    adminId = rows[0].id;
    console.log(`✓  Created admin user`);
    console.log(`   Email    : ${ADMIN_EMAIL}`);
    console.log(`   Password : ${ADMIN_PASSWORD}`);
  }

  // Upsert profile row
  await pool.query(
    `INSERT INTO profiles (id, name, role, status)
     VALUES ($1, $2, 'admin', 'active')
     ON CONFLICT (id) DO UPDATE SET role = 'admin', status = 'active', name = $2`,
    [adminId, ADMIN_NAME]
  );

  console.log(`✓  Profile row upserted (id: ${adminId})`);
  console.log(`\nDone. Log in at /login with the credentials above.`);

  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
