import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { ShieldAlert, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/student/appeals/new")({
  head: () => ({ meta: [{ title: "New appeal — Aura" }] }),
  component: NewAppeal,
});

function NewAppeal() {
  return (
    <>
      <PageHeader
        badge="7-day window"
        badgeColor="bg-amber"
        title="File an appeal"
        subtitle="Choose the type of appeal you want to file."
      />

      <div className="grid sm:grid-cols-2 gap-6 max-w-2xl">
        <Card>
          <FileText className="w-8 h-8 text-lime mb-3" />
          <div className="font-display font-bold text-lg mb-1">Score dispute</div>
          <p className="text-sm text-muted-foreground mb-5">
            A question was marked incorrectly or you disagree with the grading.
            Your lecturer will review the marking.
          </p>
          <WakeoutButton asChild variant="primary" className="w-full rounded-2xl">
            <Link to="/student/appeals/score">File score dispute →</Link>
          </WakeoutButton>
        </Card>

        <Card className="border-amber/60 bg-amber/5">
          <ShieldAlert className="w-8 h-8 text-amber mb-3" />
          <div className="font-display font-bold text-lg mb-1">Integrity appeal</div>
          <p className="text-sm text-muted-foreground mb-5">
            Dispute proctoring flags on a flagged submission. If approved, you
            may retake the exam from scratch.
          </p>
          <WakeoutButton asChild className="w-full rounded-2xl">
            <Link to="/student/appeals/integrity">File integrity appeal →</Link>
          </WakeoutButton>
        </Card>
      </div>
    </>
  );
}
