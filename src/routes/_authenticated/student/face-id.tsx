import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Card } from "@/components/brand/page";
import { PassportUpload } from "@/components/brand/passport-upload";
import { FaceIdEnroll } from "@/components/brand/face-id-enroll";
import { registerPassportPhoto } from "@/lib/supabase/face-id";

export const Route = createFileRoute("/_authenticated/student/face-id")({
  head: () => ({ meta: [{ title: "Face ID — Aura" }] }),
  component: FaceIdPage,
});

function FaceIdPage() {
  const [step, setStep] = useState<"upload" | "enroll" | "done">("upload");
  const [passportEmbedding, setPassportEmbedding] = useState<number[]>([]);

  return (
    <>
      <PageHeader
        badge="Identity"
        badgeColor="bg-sky"
        title="Face ID"
        subtitle="Register your identity for exams"
      />
      <Card className="max-w-lg">
        {step === "upload" && (
          <PassportUpload
            onValidated={async (photoBase64, embedding) => {
              await registerPassportPhoto({ data: { photoBase64 } });
              setPassportEmbedding(embedding);
              setStep("enroll");
            }}
          />
        )}
        {step === "enroll" && (
          <FaceIdEnroll passportEmbedding={passportEmbedding} onDone={() => setStep("done")} />
        )}
        {step === "done" && <p className="text-sm text-muted-foreground">Registration complete.</p>}
      </Card>
    </>
  );
}
