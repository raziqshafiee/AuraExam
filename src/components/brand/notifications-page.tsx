import { useState } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import {
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from "@/lib/supabase/notifications";
import { Bell, CheckCheck } from "lucide-react";
import { fmtMY } from "@/lib/datetime";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const TYPE_LABELS: Record<string, string> = {
  appeal_submitted: "Appeal",
  appeal_approved: "Appeal",
  appeal_rejected: "Appeal",
  exam_published: "Exam",
  exam_flagged: "Exam",
  grade_published: "Grade",
  announcement: "Announcement",
  note_added: "Note",
  assignment_posted: "Assignment",
  assignment_submitted: "Assignment",
  assignment_reviewed: "Assignment",
};

function fmt(iso: string) {
  return fmtMY(iso, { dateStyle: "medium", timeStyle: "short" });
}

export function NotificationsPage({ initialNotifications }: { initialNotifications: Notification[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const qc = useQueryClient();

  async function handleMarkRead(id: string) {
    await markNotificationRead({ data: id });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    qc.invalidateQueries({ queryKey: ["unread-count"] });
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
    );
    qc.invalidateQueries({ queryKey: ["unread-count"] });
    toast.success("All marked as read");
  }

  return (
    <>
      <PageHeader
        badge="Inbox"
        badgeColor="bg-amber"
        title="Notifications"
        action={
          unreadCount > 0 ? (
            <WakeoutButton variant="secondary" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck className="w-4 h-4 mr-1" /> Mark all read
            </WakeoutButton>
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <Card className="text-center py-12 text-ink/50">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
          No notifications yet.
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`cursor-pointer transition-colors ${!n.readAt ? "bg-amber/20 border-amber" : ""}`}
              onClick={() => !n.readAt && handleMarkRead(n.id)}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {!n.readAt && (
                    <div className="w-2 h-2 rounded-full bg-amber mt-2 shrink-0" />
                  )}
                  <div className={!n.readAt ? "" : "pl-5"}>
                    <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                      {TYPE_LABELS[n.type] ?? n.type}
                    </div>
                    <div className="font-display font-bold mt-0.5">{n.title}</div>
                    {n.body && <p className="text-sm text-muted-foreground mt-1">{n.body}</p>}
                    {n.link && (
                      <a
                        href={n.link}
                        className="text-xs font-mono underline text-sky mt-1 block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View →
                      </a>
                    )}
                  </div>
                </div>
                <div className="text-xs font-mono text-muted-foreground whitespace-nowrap shrink-0">
                  {fmt(n.createdAt)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
