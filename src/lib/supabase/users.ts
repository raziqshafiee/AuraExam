import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";
import { fmtMY } from "@/lib/datetime";
import { writeAudit } from "./audit";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "student" | "lecturer" | "admin";
  status: "active" | "banned" | "pending";
  joined: string;
};

async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (user.user_metadata as any)?.role !== "admin") {
    throw new Error("Unauthorized");
  }
  return user;
}

export const getAllUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminUser[]> => {
    await assertAdmin();
    const admin = createAdminClient();

    const { data: authData, error: authError } =
      await admin.auth.admin.listUsers({ perPage: 1000 });
    if (authError) throw authError;

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, name, role, status, created_at")
      .order("created_at", { ascending: false });
    if (profilesError) throw profilesError;

    const emailMap = new Map(
      authData.users.map((u) => [u.id, u.email ?? ""]),
    );

    return profiles.map((p) => ({
      id: p.id,
      name: p.name,
      email: emailMap.get(p.id) ?? "",
      role: p.role as AdminUser["role"],
      status: p.status as AdminUser["status"],
      joined: fmtMY(p.created_at, { dateStyle: "short" }),
    }));
  },
);

export const banUser = createServerFn({ method: "POST" })
  .inputValidator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const actor = await assertAdmin();
    const admin = createAdminClient();
    const { data: target } = await admin
      .from("profiles")
      .select("name")
      .eq("id", userId)
      .single();
    const { error } = await admin
      .from("profiles")
      .update({ status: "banned" })
      .eq("id", userId);
    if (error) throw error;
    await writeAudit(actor.id, {
      action: "Banned user",
      target: target?.name ?? userId,
      category: "user_management",
    });
    return { success: true };
  });

export const unbanUser = createServerFn({ method: "POST" })
  .inputValidator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const actor = await assertAdmin();
    const admin = createAdminClient();
    const { data: target } = await admin
      .from("profiles")
      .select("name")
      .eq("id", userId)
      .single();
    const { error } = await admin
      .from("profiles")
      .update({ status: "active" })
      .eq("id", userId);
    if (error) throw error;
    await writeAudit(actor.id, {
      action: "Unbanned user",
      target: target?.name ?? userId,
      category: "user_management",
    });
    return { success: true };
  });

