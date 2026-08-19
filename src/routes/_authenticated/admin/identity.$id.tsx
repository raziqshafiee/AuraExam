// src/routes/_authenticated/admin/identity.$id.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getFaceReviewQueue, faceReview, getFaceEvidenceUrl } from "@/lib/supabase/face";

export const Route = createFileRoute("/_authenticated/admin/identity/$id")({
  loader: () => getFaceReviewQueue(),
  component: IdentityReview,
});

function IdentityReview() {
  const { id } = Route.useParams();
  const queue = Route.useLoaderData();
  const item = queue.find((q) => q.id === id);
  const navigate = useNavigate();
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [checks, setChecks] = useState({ face: false, matric: false, name: false });

  useEffect(() => {
    if (item?.evidencePath) getFaceEvidenceUrl({ data: item.evidencePath }).then((r) => setEvidenceUrl(r.url));
  }, [item?.evidencePath]);

  if (!item) return null;
  const allChecked = checks.face && checks.matric && checks.name;

  async function decide(decision: "approve" | "reject") {
    await faceReview({ data: { enrollmentId: item.id, decision } });
    toast.success(decision === "approve" ? "Approved" : "Rejected");
    navigate({ to: "/admin/identity" });
  }

  return (
    <>
      <PageHeader badge="Face Match" title={item.studentName} subtitle={`Matric ${item.matricNo} - similarity ${item.similarity?.toFixed(2)}`} />
      <Card className="max-w-xl space-y-4">
        {evidenceUrl && <img src={evidenceUrl} alt="Card + face evidence" className="rounded-xl border-2 border-ink" />}
        {(["face", "matric", "name"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />
            {k === "face" && "The face on the card matches the live face"}
            {k === "matric" && "The matric number on the card matches the typed number"}
            {k === "name" && "The name on the card matches the profile name"}
          </label>
        ))}
        <div className="flex gap-2">
          <WakeoutButton variant="primary" disabled={!allChecked} onClick={() => decide("approve")}>Approve</WakeoutButton>
          <WakeoutButton variant="destructive" onClick={() => decide("reject")}>Reject</WakeoutButton>
        </div>
      </Card>
    </>
  );
}
