// src/components/brand/identity-badge.tsx
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

export function IdentityBadge({
  status,
  score,
}: {
  status: "verified" | "unverified" | "mismatch" | null;
  score?: number;
}) {
  if (!status) return <span className="text-xs text-muted-foreground font-mono">-</span>;
  const config = {
    verified: { icon: CheckCircle, label: "Verified", cls: "text-green-700" },
    unverified: { icon: AlertTriangle, label: "Unverified", cls: "text-amber-600" },
    mismatch: { icon: XCircle, label: "Mismatch", cls: "text-pink" },
  }[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono ${config.cls}`}>
      <Icon className="w-3.5 h-3.5" /> {config.label}
      {score !== undefined ? ` (${score.toFixed(2)})` : ""}
    </span>
  );
}
