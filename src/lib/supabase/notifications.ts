import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./server";

const db = (supabase: ReturnType<typeof createClient>) => supabase as any;

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

// Internal helper — called from other server functions to push a notification to any user.
// Uses the caller's supabase client (INSERT policy allows any auth user to insert).
export async function pushNotification(
  supabase: ReturnType<typeof createClient>,
  params: { userId: string; type: string; title: string; body?: string; link?: string }
) {
  await db(supabase).from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    link: params.link ?? null,
  });
}

// GET: user's notifications (newest first, limit 60)
export const getNotifications = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await db(supabase)
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) throw new Error(error.message);

  return (data ?? []).map((n: any) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.read_at,
    createdAt: n.created_at,
  })) as Notification[];
});

// GET: unread count (for badge)
export const getUnreadCount = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { count: 0 };

  const { count } = await db(supabase)
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return { count: count ?? 0 };
});

// POST: mark one notification as read
export const markNotificationRead = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    await db(supabase)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    return { success: true as const };
  });

// POST: mark all as read
export const markAllNotificationsRead = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await db(supabase)
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  return { success: true as const };
});
