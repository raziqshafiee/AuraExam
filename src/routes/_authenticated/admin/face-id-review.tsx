import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Card } from "@/components/brand/page";
import { FacialReviewCard } from "@/components/brand/facial-review-card";
import {
  getFacialReviewQueue,
  reviewFacialProfile,
  getCheckinQueue,
  reviewCheckin,
} from "@/lib/supabase/face-id";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/face-id-review")({
  head: () => ({ meta: [{ title: "Face ID Review — Aura" }] }),
  component: FaceIdReviewPage,
});

function CheckinQueueTab() {
  const queryClient = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["checkin-queue"],
    queryFn: () => getCheckinQueue(),
    // A student can pass check-in on their own retry while this page is
    // open — poll so they drop off the list without a manual refresh.
    refetchInterval: 15_000,
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {(rows ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">No students waiting on check-in review.</p>
      )}
      {(rows ?? []).map((row) => (
        <FacialReviewCard
          key={row.submissionId}
          name={row.studentName}
          subtitle={row.examTitle}
          photoUrl={row.photoUrl}
          snapshotUrl={row.snapshotUrl}
          score={row.score}
          onApprove={async () => {
            await reviewCheckin({ data: { submissionId: row.submissionId, action: "clear" } });
            queryClient.invalidateQueries({ queryKey: ["checkin-queue"] });
          }}
          onReject={async (reason) => {
            await reviewCheckin({
              data: { submissionId: row.submissionId, action: "reject", reason },
            });
            queryClient.invalidateQueries({ queryKey: ["checkin-queue"] });
          }}
        />
      ))}
    </div>
  );
}

function FaceIdReviewPage() {
  const [tab, setTab] = useState<"registrations" | "checkins">("registrations");
  const queryClient = useQueryClient();
  const { data: queue } = useQuery({
    queryKey: ["face-id-review-queue"],
    queryFn: () => getFacialReviewQueue(),
  });

  return (
    <>
      <PageHeader
        badge="Review"
        badgeColor="bg-lime"
        title="Face ID Review"
        subtitle="Registrations awaiting manual verification"
      />
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("registrations")}
          className={`px-3 py-1.5 rounded-full border-2 border-ink text-sm ${tab === "registrations" ? "bg-lime text-lime-foreground" : ""}`}
        >
          Registrations
        </button>
        <button
          onClick={() => setTab("checkins")}
          className={`px-3 py-1.5 rounded-full border-2 border-ink text-sm ${tab === "checkins" ? "bg-lime text-lime-foreground" : ""}`}
        >
          Exam Check-ins
        </button>
      </div>
      {tab === "registrations" && (
        <div className="grid md:grid-cols-2 gap-4">
          {(queue ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No registrations pending review.</p>
          )}
          {(queue ?? []).map((row) => (
            <FacialReviewCard
              key={row.userId}
              name={row.name}
              subtitle={row.email}
              photoUrl={row.photoUrl}
              snapshotUrl={row.snapshotUrl}
              onApprove={async () => {
                await reviewFacialProfile({ data: { userId: row.userId, action: "APPROVE" } });
                toast.success(`${row.name} approved`);
                queryClient.invalidateQueries({ queryKey: ["face-id-review-queue"] });
              }}
              onReject={async (reason) => {
                await reviewFacialProfile({
                  data: { userId: row.userId, action: "REJECT", reason },
                });
                toast.success(`${row.name} rejected`);
                queryClient.invalidateQueries({ queryKey: ["face-id-review-queue"] });
              }}
            />
          ))}
        </div>
      )}
      {tab === "checkins" && <CheckinQueueTab />}
    </>
  );
}
