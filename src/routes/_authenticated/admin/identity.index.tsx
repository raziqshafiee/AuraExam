// src/routes/_authenticated/admin/identity.index.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, PageHeader, Empty } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import {
  getFaceReviewQueue,
  getIdentityCheckinQueue,
  decideIdentityCheckin,
} from "@/lib/supabase/face";

export const Route = createFileRoute("/_authenticated/admin/identity/")({
  head: () => ({ meta: [{ title: "Identity review — Aura" }] }),
  loader: async () => ({
    queue: await getFaceReviewQueue(),
    checkinQueue: await getIdentityCheckinQueue(),
  }),
  component: IdentityQueue,
});

function IdentityQueue() {
  const { queue, checkinQueue: initialCheckinQueue } = Route.useLoaderData();
  const [checkinQueue, setCheckinQueue] = useState(initialCheckinQueue);

  async function refreshCheckinQueue() {
    setCheckinQueue(await getIdentityCheckinQueue());
  }

  return (
    <>
      <PageHeader
        badge="Face Match"
        title="Identity review queue"
        subtitle={`${queue.length} pending`}
      />
      {queue.length === 0 ? (
        <Empty
          title="Nothing to review"
          hint="Enrollments needing a human check will show up here."
        />
      ) : (
        <div className="space-y-3">
          {queue.map((q) => (
            <Link key={q.id} to="/admin/identity/$id" params={{ id: q.id }}>
              <Card className="flex items-center justify-between hover:-translate-y-0.5 transition-transform">
                <div>
                  <div className="font-display font-bold">{q.studentName}</div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {q.matricNo} - similarity {q.similarity?.toFixed(2)}
                    {q.pendingReason === "ocr_mismatch" && " - OCR mismatch"}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <PageHeader
        badge="Face Match"
        title="Exam check-in queue"
        subtitle="Students blocked from starting an exam until identity is confirmed."
      />
      <Card className="max-w-xl space-y-4">
        {checkinQueue.length === 0 ? (
          <Empty
            title="Nothing waiting"
            hint="Students stuck at exam check-in will show up here."
          />
        ) : (
          <div className="space-y-3">
            {checkinQueue.map((item: any) => (
              <CheckinRow key={item.id} item={item} onDecided={refreshCheckinQueue} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function CheckinRow({
  item,
  onDecided,
}: {
  item: Awaited<ReturnType<typeof getIdentityCheckinQueue>>[number];
  onDecided: () => void;
}) {
  async function decide(decision: "clear" | "reject") {
    await decideIdentityCheckin({ data: { queueId: item.id, decision } });
    toast.success(decision === "clear" ? "Cleared" : "Rejected");
    onDecided();
  }

  return (
    <div className="border-2 border-ink rounded-xl p-3 space-y-2">
      <div className="font-display font-bold">{item.studentName}</div>
      <div className="text-xs font-mono text-muted-foreground">
        {item.matricNo} · waiting since {new Date(item.queuedAt).toLocaleTimeString()}
      </div>
      <div className="flex gap-2">
        <WakeoutButton variant="primary" size="sm" onClick={() => decide("clear")}>
          Clear
        </WakeoutButton>
        <WakeoutButton variant="destructive" size="sm" onClick={() => decide("reject")}>
          Reject
        </WakeoutButton>
      </div>
    </div>
  );
}
