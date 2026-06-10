import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "@/components/brand/notifications-page";
import { getNotifications } from "@/lib/supabase/notifications";

export const Route = createFileRoute("/_authenticated/student/notifications")({
  head: () => ({ meta: [{ title: "Inbox — Aura" }] }),
  loader: () => getNotifications(),
  component: function StudentNotifications() {
    const notifications = Route.useLoaderData();
    return <NotificationsPage initialNotifications={notifications as any} />;
  },
});
