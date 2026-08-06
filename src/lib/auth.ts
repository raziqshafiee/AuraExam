import { useState, useEffect } from "react";
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseClient } from "./auth-client";
import type { User } from "@supabase/supabase-js";

export type Role = "student" | "lecturer" | "admin";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export const ROLE_HOME: Record<Role, string> = {
  student: "/student",
  lecturer: "/lecturer",
  admin: "/admin",
};

function mapUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.user_metadata?.name || "",
    email: user.email || "",
    role: (user.user_metadata?.role as Role) || "student",
  };
}

const _getServerAuthUser = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("./supabase/server");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return mapUser(user);
});

export async function getAuthUser(): Promise<AuthUser | null> {
  if (typeof window === "undefined") {
    return _getServerAuthUser();
  }
  const { data: { user } } = await getSupabaseClient().auth.getUser();
  if (!user) return null;
  return mapUser(user);
}

export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSupabaseClient().auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ? mapUser(u) : null);
      setLoading(false);
    });

    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange((_, session) => {
      setUser(session?.user ? mapUser(session.user) : null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });

  if (error) {
    console.error("Sign in error:", error);
    throw new Error(error.message || "Failed to sign in");
  }
  if (!data?.user) throw new Error("Sign in failed");

  // Check ban status before the session is considered valid. If banned, revoke
  // the session immediately and surface a clear error — avoids the confusing
  // "Welcome back!" toast followed by a silent redirect back to /login.
  const { data: profile } = await getSupabaseClient()
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile?.status === "banned") {
    await getSupabaseClient().auth.signOut();
    throw new Error("Your account has been suspended. Please contact your institution.");
  }

  // Create a profiles row for legacy accounts that pre-date Supabase migration
  const mapped = mapUser(data.user);
  const { createUserProfile } = await import("./supabase/admin");
  await createUserProfile({
    data: {
      id: mapped.id,
      name: mapped.name || email.split("@")[0],
      role: mapped.role,
    },
  }).catch(() => {/* profile already exists — ignore */});

  return mapped;
}

export async function signUp(
  email: string,
  password: string,
  name: string,
  role: Role,
): Promise<{ needsVerification: boolean; role: Role }> {
  // Use admin API server-side: auto-confirms email, sends no email, no rate limit.
  const { registerUser } = await import("./supabase/admin");
  const { role: confirmedRole } = await registerUser({ data: { email, password, name, role } });

  // Establish a client session immediately after creation.
  const { error: signInError } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(signInError.message);

  return { needsVerification: false, role: confirmedRole };
}

export async function signOut(): Promise<void> {
  await getSupabaseClient().auth.signOut();
}
