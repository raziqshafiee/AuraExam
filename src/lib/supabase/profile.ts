import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";

const db = (supabase: ReturnType<typeof createClient>) => supabase;

// Lightweight check used by the auth guard — returns true if the current
// session belongs to a banned account. Uses createServerFn so Vite keeps
// the server-only supabase/server import out of the client bundle.
export const checkBanStatus = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await db(supabase)
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.status === "banned";
});

export const getProfile = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await db(supabase)
    .from("profiles")
    .select("name, role, status")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    name: profile?.name ?? user.user_metadata?.name ?? "",
    email: user.email ?? "",
    role: (profile?.role ?? user.user_metadata?.role ?? "student") as "student" | "lecturer" | "admin",
    status: (profile?.status ?? "active") as "active" | "banned" | "pending",
  };
});

export const updateProfileName = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const name = data.name.trim();
    if (!name) throw new Error("Name cannot be empty");
    if (name.length > 100) throw new Error("Name is too long");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await db(supabase)
      .from("profiles")
      .update({ name })
      .eq("id", user.id);

    if (error) throw new Error(error.message);

    // Keep auth metadata in sync
    await supabase.auth.updateUser({ data: { name } });

    return { success: true as const };
  });
