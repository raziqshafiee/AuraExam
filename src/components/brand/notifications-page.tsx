import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import {
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from "@/lib/supabase/notifications";
import { Bell, Check, CheckCheck } from "lucide-react";
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
  const [marking, setMarking] = useState<string | null>(null);
  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function handleMarkRead(id: string) {
    setMarking(id);
    try {
      await markNotificationRead({ data: id });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      qc.invalidateQueries({ queryKey: ["unread-count"] });
    } finally {
      setMarking(null);
    }
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
              className={`transition-colors ${!n.readAt ? "bg-amber/20 border-amber" : ""}`}
            >
              <div className="flex items-start gap-3">
                {/* Unread dot */}
                <div className="shrink-0 mt-1.5">
                  {!n.readAt
                    ? <div className="w-2 h-2 rounded-full bg-amber" />
                    : <div className="w-2 h-2" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                        {TYPE_LABELS[n.type] ?? n.type}
                      </div>
                      <div className="font-display font-bold mt-0.5">{n.title}</div>
                      {n.body && <p className="text-sm text-muted-foreground mt-1">{n.body}</p>}
                      {n.link && (
                        <button
                          onClick={() => navigate({ to: n.link as any })}
                          className="text-xs font-mono underline text-sky mt-1 block"
                        >
                          View →
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {fmt(n.createdAt)}
                      </span>
                      {!n.readAt && (
                        <WakeoutButton
                          size="sm"
                          variant="secondary"
                          disabled={marking === n.id}
                          onClick={() => handleMarkRead(n.id)}
                          title="Mark as read"
                        >
                          {marking === n.id
                            ? <span className="text-xs">…</span>
                            : <><Check className="w-3.5 h-3.5" /><span className="hidden sm:inline">Mark read</span></>}
                        </WakeoutButton>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
