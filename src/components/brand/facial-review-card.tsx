"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { WakeoutButton } from "./wakeout-button";

interface Props {
  name: string;
  subtitle?: string;
  photoUrl: string | null;
  snapshotUrl: string | null;
  score?: number | null;
  onApprove: () => void | Promise<void>;
  onReject: (reason: string) => void | Promise<void>;
}

export function FacialReviewCard({ name, subtitle, photoUrl, snapshotUrl, score, onApprove, onReject }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-2xl border-2 border-ink p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{name}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {typeof score === "number" && (
          <span className="px-2.5 py-1 rounded-full border-2 border-ink text-xs font-mono">
            {Math.round(score * 100)}% match
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {photoUrl && <img src={photoUrl} alt="Registered photo" className="rounded-xl border-2 border-ink aspect-square object-cover" />}
        {snapshotUrl && <img src={snapshotUrl} alt="Live snapshot" className="rounded-xl border-2 border-ink aspect-square object-cover" />}
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Rejection reason (optional)"
        className="w-full border-2 border-ink rounded-xl px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <WakeoutButton
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onApprove();
            setBusy(false);
          }}
        >
          <Check className="w-4 h-4" /> Approve
        </WakeoutButton>
        <WakeoutButton
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onReject(reason);
            setBusy(false);
          }}
        >
          <X className="w-4 h-4" /> Reject
        </WakeoutButton>
      </div>
    </div>
  );
}
