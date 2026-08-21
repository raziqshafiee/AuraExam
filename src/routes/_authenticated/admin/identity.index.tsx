// src/routes/_authenticated/admin/identity.index.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHeader, Empty } from "@/components/brand/page";
import { getFaceReviewQueue } from "@/lib/supabase/face";

export const Route = createFileRoute("/_authenticated/admin/identity/")({
  head: () => ({ meta: [{ title: "Identity review — Aura" }] }),
  loader: () => getFaceReviewQueue(),
  component: IdentityQueue,
});

function IdentityQueue() {
  const queue = Route.useLoaderData();
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
    </>
  );
}
