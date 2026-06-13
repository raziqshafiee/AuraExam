import { useState, useEffect } from "react";

export function Countdown({ to, expiredLabel = "Ended" }: { to: string; expiredLabel?: string }) {
  const [diff, setDiff] = useState(() => new Date(to).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => setDiff(new Date(to).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [to]);
  if (diff <= 0)
    return <span className="font-mono text-xs font-bold text-pink animate-pulse">{expiredLabel}</span>;
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const str = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
  return (
    <span className={`font-mono text-xs font-bold ${diff < 3_600_000 ? "text-pink" : "text-muted-foreground"}`}>
      {str}
    </span>
  );
}
