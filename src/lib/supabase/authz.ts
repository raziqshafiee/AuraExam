import { createClient } from "./server";

export type AppRole = "student" | "lecturer" | "admin";

export type AuthContext = {
  user: NonNullable<Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]>>["data"]["user"]>;
  role: AppRole | null;
  status: string | null;
};

/**
 * Resolve the caller and their role from the `profiles` table — the single
 * source of truth for authorization.
 *
 * SECURITY: never gate authorization on `user.user_metadata.role`. user_metadata
 * is writable by the user via `supabase.auth.updateUser({ data: { role } })`, so
 * it is attacker-controlled and must never decide access. `profiles.role` is
 * locked against self-escalation by the `enforce_profile_role_lock` trigger
 * (see scripts/migrate-profile-role-lock.ts), which makes it the only
 * trustworthy role source.
 *
 * Throws "Unauthorized" when there is no signed-in user.
 */
export async function requireUser(
  supabase: ReturnType<typeof createClient>
): Promise<AuthContext> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  return {
    user,
    role: (profile?.role ?? null) as AppRole | null,
    status: (profile?.status ?? null) as string | null,
  };
}

/**
 * Require the caller to be signed in AND hold one of `roles`. Throws
 * "Unauthorized" when not signed in, or `message` (default "Forbidden") when the
 * role does not match. Pass the existing request-scoped `supabase` client so the
 * session cookie is reused.
 */
export async function requireRole(
  roles: AppRole | AppRole[],
  supabase: ReturnType<typeof createClient>,
  message = "Forbidden"
): Promise<AuthContext> {
  const allow = Array.isArray(roles) ? roles : [roles];
  const ctx = await requireUser(supabase);
  if (!ctx.role || !allow.includes(ctx.role)) throw new Error(message);
  return ctx;
}
