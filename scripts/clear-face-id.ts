/**
 * Wipes all Face ID enrollment data so every user re-registers under the
 * current flow — use after a Face ID method change.
 * Run: npm run clear:face-id
 */
import pkg from "pg";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

const BUCKET = "facial-profiles";

async function clear() {
  await pool.query(`DELETE FROM user_facial_profiles`);
  console.log("✓  user_facial_profiles cleared");
  await pool.end();

  // Direct SQL deletes on storage.objects are rejected by Supabase — clearing
  // stored photos has to go through the Storage API instead.
  const admin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: userFolders, error: listError } = await admin.storage.from(BUCKET).list("", {
    limit: 10000,
  });
  if (listError) throw new Error(`List failed: ${listError.message}`);

  let removed = 0;
  for (const folder of userFolders ?? []) {
    const { data: files, error: filesError } = await admin.storage
      .from(BUCKET)
      .list(folder.name, { limit: 10000 });
    if (filesError) throw new Error(`List failed for ${folder.name}: ${filesError.message}`);
    if (!files || files.length === 0) continue;

    const paths = files.map((f) => `${folder.name}/${f.name}`);
    const { error: removeError } = await admin.storage.from(BUCKET).remove(paths);
    if (removeError) throw new Error(`Remove failed for ${folder.name}: ${removeError.message}`);
    removed += paths.length;
  }
  console.log(`✓  ${removed} file(s) removed from "${BUCKET}" across ${userFolders?.length ?? 0} user folder(s)`);

  console.log("\nDone — everyone is back to UNREGISTERED. Exam check-in history untouched.");
}

clear().catch((err) => {
  console.error("Clear failed:", err.message);
  process.exit(1);
});
