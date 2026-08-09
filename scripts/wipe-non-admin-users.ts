import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// One-off cleanup: removes every student/lecturer account so the app starts
// clean under the new mandatory-email-confirmation flow. Admin accounts
// (profiles.role = 'admin') are untouched. Deletion goes through the
// GoTrue Admin API (not raw SQL) so sessions/refresh tokens are cleaned up
// properly; `profiles.id references auth.users(id) on delete cascade`
// removes the matching profile row automatically.

const admin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: before, error: beforeErr } = await admin
    .from("profiles")
    .select("role");
  if (beforeErr) throw new Error(beforeErr.message);

  const counts = (rows: { role: string }[]) =>
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.role] = (acc[r.role] ?? 0) + 1;
      return acc;
    }, {});

  console.log("Before:", counts(before ?? []), `(total ${before?.length ?? 0})`);

  const { data: toDelete, error: selErr } = await admin
    .from("profiles")
    .select("id, name, role")
    .in("role", ["student", "lecturer"]);
  if (selErr) throw new Error(selErr.message);

  if (!toDelete || toDelete.length === 0) {
    console.log("No student/lecturer accounts found — nothing to delete.");
    return;
  }

  console.log(`\nDeleting ${toDelete.length} non-admin user(s):`);
  for (const u of toDelete) {
    console.log(`  - ${u.name} (${u.role}) [${u.id}]`);
  }

  let deleted = 0;
  let failed = 0;
  for (const u of toDelete) {
    const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
    if (delErr) {
      console.error(`  ✗ failed to delete ${u.id}: ${delErr.message}`);
      failed++;
    } else {
      deleted++;
    }
  }

  const { data: after, error: afterErr } = await admin
    .from("profiles")
    .select("role");
  if (afterErr) throw new Error(afterErr.message);

  console.log(`\n✓  Deleted: ${deleted}   ✗ Failed: ${failed}`);
  console.log("After:", counts(after ?? []), `(total ${after?.length ?? 0})`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
