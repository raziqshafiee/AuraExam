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
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [checks, setChecks] = useState({ face: false, matric: false, name: false });

  useEffect(() => {
    if (item?.cardImagePath)
      getFaceEvidenceUrl({ data: item.cardImagePath }).then((r) => setCardUrl(r.url));
    if (item?.profileImagePath)
      getFaceEvidenceUrl({ data: item.profileImagePath }).then((r) => setProfileUrl(r.url));
  }, [item?.cardImagePath, item?.profileImagePath]);

  if (!item) return null;
  const allChecked = checks.face && checks.matric && checks.name;
  const itemId = item.id;

  async function decide(decision: "approve" | "reject") {
    await faceReview({ data: { enrollmentId: itemId, decision } });
    toast.success(decision === "approve" ? "Approved" : "Rejected");
    navigate({ to: "/admin/identity" });
  }

  return (
    <>
      <PageHeader
        badge="Face Match"
        title={item.studentName}
        subtitle={`Matric ${item.matricNo} - similarity ${item.similarity?.toFixed(2)}${item.pendingReason === "ocr_mismatch" ? " - OCR mismatch" : ""}`}
      />
      <Card className="max-w-xl space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {cardUrl && (
            <div>
              <p className="text-[11px] font-mono text-muted-foreground mb-1">Uploaded card</p>
              <img
                src={cardUrl}
                alt="Uploaded matric card"
                className="rounded-xl border-2 border-ink w-full"
              />
            </div>
          )}
          {profileUrl && (
            <div>
              <p className="text-[11px] font-mono text-muted-foreground mb-1">Profile photo</p>
              <img
                src={profileUrl}
                alt="Uploaded profile photo"
                className="rounded-xl border-2 border-ink w-full"
              />
            </div>
          )}
        </div>
        {(item.ocrName || item.ocrMatric) && (
          <div className="text-sm bg-secondary border-2 border-ink rounded-xl p-3 space-y-1">
            <p className="font-mono text-xs text-muted-foreground">OCR read from card</p>
            {item.ocrName && <p>Name: {item.ocrName}</p>}
            {item.ocrMatric && <p>Matric: {item.ocrMatric}</p>}
          </div>
        )}
        {(["face", "matric", "name"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checks[k]}
              onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })}
            />
            {k === "face" && "The face on the card matches the live face"}
            {k === "matric" && "The matric number on the card matches the typed number"}
            {k === "name" && "The name on the card matches the profile name"}
          </label>
        ))}
        <div className="flex gap-2">
          <WakeoutButton variant="primary" disabled={!allChecked} onClick={() => decide("approve")}>
            Approve
          </WakeoutButton>
          <WakeoutButton variant="destructive" onClick={() => decide("reject")}>
            Reject
          </WakeoutButton>
        </div>
      </Card>
    </>
  );
}
