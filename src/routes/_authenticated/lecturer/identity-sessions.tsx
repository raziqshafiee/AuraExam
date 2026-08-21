// src/routes/_authenticated/lecturer/identity-sessions.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, PageHeader, Empty } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getLecturerClasses } from "@/lib/supabase/classes";
import {
  openEnrollmentSession,
  closeEnrollmentSession,
  getEnrollmentSessionRoster,
  getLecturerFaceReviewQueue,
  faceReview,
  getFaceEvidenceUrl,
} from "@/lib/supabase/face";

export const Route = createFileRoute("/_authenticated/lecturer/identity-sessions")({
  head: () => ({ meta: [{ title: "Identity sessions — Aura" }] }),
  loader: async () => ({
    classes: await getLecturerClasses(),
    reviewQueue: await getLecturerFaceReviewQueue(),
  }),
  component: IdentitySessions,
});

function IdentitySessions() {
  const { classes, reviewQueue: initialQueue } = Route.useLoaderData();
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>(classes[0]?.id ?? "");
  const [roster, setRoster] = useState<{ studentId: string; name: string; enrolled: boolean }[]>(
    [],
  );
  const [reviewQueue, setReviewQueue] = useState(initialQueue);

  async function open() {
    const res = await openEnrollmentSession({
      data: { classId: selectedClass, durationMinutes: 30 },
    });
    setOpenSessionId(res.sessionId);
    toast.success(`Window open until ${new Date(res.expiresAt).toLocaleTimeString()}`);
    poll();
  }

  async function poll() {
    const r = await getEnrollmentSessionRoster({ data: selectedClass });
    setRoster(r);
  }

  async function close() {
    if (!openSessionId) return;
    await closeEnrollmentSession({ data: openSessionId });
    setOpenSessionId(null);
  }

  async function refreshReviewQueue() {
    setReviewQueue(await getLecturerFaceReviewQueue());
  }

  return (
    <>
      <PageHeader
        badge="Face Match"
        title="Supervised verification"
        subtitle="Open a window, students enroll in person, no card required."
      />
      <Card className="max-w-xl space-y-4">
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="w-full border-2 border-ink rounded-xl px-3 py-2"
        >
          {classes.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        {!openSessionId ? (
          <WakeoutButton className="w-full" onClick={open}>
            Open 30-minute window
          </WakeoutButton>
        ) : (
          <>
            <p className="text-sm font-mono">
              {roster.filter((r) => r.enrolled).length} / {roster.length} enrolled
            </p>
            <WakeoutButton variant="secondary" className="w-full" onClick={poll}>
              Refresh
            </WakeoutButton>
            <WakeoutButton variant="destructive" className="w-full" onClick={close}>
              Close window
            </WakeoutButton>
          </>
        )}
      </Card>

      <PageHeader
        badge="Face Match"
        title="Card review"
        subtitle="Students whose uploaded matric card couldn't be automatically confirmed."
      />
      <Card className="max-w-xl space-y-4">
        {reviewQueue.length === 0 ? (
          <Empty
            title="Nothing to review"
            hint="Cards that OCR couldn't clearly read will show up here."
          />
        ) : (
          <div className="space-y-3">
            {reviewQueue.map((item) => (
              <ReviewRow key={item.id} item={item} onDecided={refreshReviewQueue} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function ReviewRow({
  item,
  onDecided,
}: {
  item: Awaited<ReturnType<typeof getLecturerFaceReviewQueue>>[number];
  onDecided: () => void;
}) {
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function toggle() {
    if (!expanded && item.cardImagePath && !cardUrl) {
      const r = await getFaceEvidenceUrl({ data: item.cardImagePath });
      setCardUrl(r.url);
    }
    setExpanded((e) => !e);
  }

  async function decide(decision: "approve" | "reject") {
    await faceReview({ data: { enrollmentId: item.id, decision } });
    toast.success(decision === "approve" ? "Approved" : "Rejected");
    onDecided();
  }

  return (
    <div className="border-2 border-ink rounded-xl p-3 space-y-2">
      <button className="w-full text-left" onClick={toggle}>
        <div className="font-display font-bold">{item.studentName}</div>
        <div className="text-xs font-mono text-muted-foreground">
          {item.ocrName && `OCR name: ${item.ocrName}`}
          {item.ocrMatric && ` · OCR matric: ${item.ocrMatric}`}
        </div>
      </button>
      {expanded && (
        <div className="space-y-2">
          {cardUrl && (
            <img
              src={cardUrl}
              alt="Uploaded matric card"
              className="rounded-xl border-2 border-ink w-full max-w-xs"
            />
          )}
          <div className="flex gap-2">
            <WakeoutButton variant="primary" size="sm" onClick={() => decide("approve")}>
              Approve
            </WakeoutButton>
            <WakeoutButton variant="destructive" size="sm" onClick={() => decide("reject")}>
              Reject
            </WakeoutButton>
          </div>
        </div>
      )}
    </div>
  );
}
