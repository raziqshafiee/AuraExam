import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/brand/page";
import { FacialReviewCard } from "@/components/brand/facial-review-card";
import { ConfirmModal } from "@/components/brand/confirm-modal";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getCheckinQueue, reviewCheckin, resetFacialProfile } from "@/lib/supabase/face-id";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/face-id-review")({
  head: () => ({ meta: [{ title: "Face ID Review — Aura" }] }),
  component: FaceIdReviewPage,
});

function FaceIdReviewPage() {
  const queryClient = useQueryClient();
  const [resetTarget, setResetTarget] = useState<{ userId: string; name: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const { data: rows } = useQuery({
    queryKey: ["checkin-queue"],
    queryFn: () => getCheckinQueue(),
    // A student can pass check-in on their own retry while this page is
    // open — poll so they drop off the list without a manual refresh.
    refetchInterval: 15_000,
  });

  async function runReset() {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await resetFacialProfile({
        data: { userId: resetTarget.userId, reason: "Manual reset by admin" },
      });
      toast.success(`${resetTarget.name}'s Face ID was reset`);
      queryClient.invalidateQueries({ queryKey: ["checkin-queue"] });
      setResetTarget(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't reset Face ID. Try again.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <PageHeader
        badge="Review"
        badgeColor="bg-lime"
        title="Face ID Review"
        subtitle="Exam check-ins awaiting manual verification"
      />
      <div className="grid md:grid-cols-2 gap-4">
        {(rows ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No students waiting on check-in review.</p>
        )}
        {(rows ?? []).map((row) => (
          <div key={row.submissionId} className="space-y-2">
            <FacialReviewCard
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
            <WakeoutButton
              variant="ghost"
              size="sm"
              onClick={() => setResetTarget({ userId: row.studentId, name: row.studentName })}
            >
              Reset Face ID
            </WakeoutButton>
          </div>
        ))}
      </div>
      <ConfirmModal
        open={resetTarget !== null}
        title="Reset Face ID?"
        message={`"${resetTarget?.name}" will need to re-register their Face ID from scratch before their next exam.`}
        confirmLabel="Reset"
        danger
        loading={resetting}
        onConfirm={runReset}
        onClose={() => {
          if (!resetting) setResetTarget(null);
        }}
      />
    </>
  );
}
