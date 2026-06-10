import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";
import { createAdminClient } from "./admin-client";

const db = (s: any) => s as any;

export type AuditCategory =
  | "user_management"
  | "exam"
  | "integrity"
  | "appeal"
  | "class"
  | "general";

// Called inside server functions — never throws, audit failures must not
// break the primary operation.
export async function writeAudit(
  actorId: string,
  payload: { action: string; target: string; category: AuditCategory },
) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: actorId,
      action: payload.action,
      target: payload.target,
      category: payload.category,
    });
  } catch {}
}

export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  target: string;
  category: AuditCategory;
  created_at: string;
};

export const getAuditLog = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuditEntry[]> => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await db(supabase)
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") throw new Error("Unauthorized");

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("audit_log")
      .select("*, actor:profiles!actor_id(name)")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    return (data ?? []).map((e: any) => ({
      id: e.id,
      actor: e.actor?.name ?? "System",
      action: e.action,
      target: e.target,
      category: (e.category ?? "general") as AuditCategory,
      created_at: e.created_at,
    }));
  },
);
