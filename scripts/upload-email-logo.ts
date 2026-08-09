import pkg from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const { Pool } = pkg;
const BUCKET = "email-assets";
const OBJECT_PATH = "logo.svg";
const LOCAL_FILE = path.resolve(process.cwd(), "public/email-logo.svg");

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
  });

  await pool.query(
    `INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
     VALUES ($1, $1, true, now(), now())
     ON CONFLICT (id) DO UPDATE SET public = true, updated_at = now();`,
    [BUCKET]
  );
  console.log(`✓  bucket "${BUCKET}" created/updated (public)`);

  await pool.query(`
    DROP POLICY IF EXISTS "email-assets public read" ON storage.objects;
    CREATE POLICY "email-assets public read" ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = '${BUCKET}');
  `);
  console.log(`✓  public read policy set for "${BUCKET}"`);
  await pool.end();

  const admin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const fileBuffer = fs.readFileSync(LOCAL_FILE);
  const { error } = await admin.storage.from(BUCKET).upload(OBJECT_PATH, fileBuffer, {
    contentType: "image/svg+xml",
    upsert: true,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = admin.storage.from(BUCKET).getPublicUrl(OBJECT_PATH);
  console.log(`✓  logo uploaded`);
  console.log(`\nPublic URL (use this in the email template <img src>):\n${data.publicUrl}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
