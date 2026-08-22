import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { PageHeader, Card } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { PassportUpload } from "@/components/brand/passport-upload";
import { FaceIdEnroll } from "@/components/brand/face-id-enroll";
import {
  registerPassportPhoto,
  requestPhotoChange,
  getMyFacialProfile,
} from "@/lib/supabase/face-id";
import { FACE_ID } from "@/lib/constants";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/student/face-id")({
  head: () => ({ meta: [{ title: "Face ID — Aura" }] }),
  component: FaceIdPage,
});

function FaceIdPage() {
  const queryClient = useQueryClient();
  // null = follow the server status; anything else is a local override for the
  // step the student is currently working through.
  const [step, setStep] = useState<"upload" | "enroll" | "done" | null>(null);
  const [passportEmbedding, setPassportEmbedding] = useState<number[]>([]);
  const [unlocking, setUnlocking] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-facial-profile"],
    queryFn: () => getMyFacialProfile(),
  });

  async function handleRequestChange() {
    setUnlocking(true);
    try {
      await requestPhotoChange();
      toast.success("Photo unlocked — upload your new passport photo.");
      await queryClient.invalidateQueries({ queryKey: ["my-facial-profile"] });
      setStep("upload");
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't unlock your photo. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  const uploadStep = (
    <PassportUpload
      onValidated={(photoBase64, embedding) => {
        registerPassportPhoto({ data: { photoBase64 } })
          .then(() => {
            setPassportEmbedding(embedding);
            setStep("enroll");
          })
          .catch((err: any) => {
            toast.error(err?.message ?? "Couldn't save your passport photo. Try again.");
          });
      }}
    />
  );

  function body() {
    if (isLoading) {
      return (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your Face ID status…
        </p>
      );
    }

    // A step the student started in this session always wins over the stored
    // status, so the upload → enroll → done flow isn't interrupted by a refetch.
    if (step === "upload") return uploadStep;
    if (step === "enroll") {
      return (
        <FaceIdEnroll
          passportEmbedding={passportEmbedding}
          onDone={() => {
            setStep("done");
            queryClient.invalidateQueries({ queryKey: ["my-facial-profile"] });
          }}
        />
      );
    }
    if (step === "done") {
      return <p className="text-sm text-muted-foreground">Registration complete.</p>;
    }

    switch (profile?.status) {
      case "VERIFIED":
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-lime-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-display font-bold text-lg">Registered</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Your Face ID is verified and your photo is locked. To swap it you must request a
                  photo change — allowed once every {FACE_ID.COOLDOWN_DAYS} days, and never within{" "}
                  {FACE_ID.FREEZE_HOURS} hours of a scheduled exam.
                </p>
              </div>
            </div>
            <WakeoutButton
              variant="secondary"
              size="default"
              disabled={unlocking}
              onClick={handleRequestChange}
            >
              {unlocking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Requesting…
                </>
              ) : (
                "Request photo change"
              )}
            </WakeoutButton>
          </div>
        );

      case "PENDING_REVIEW":
        return (
          <div className="flex items-start gap-3">
            <Clock className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-display font-bold text-lg">Awaiting manual review</div>
              <p className="text-sm text-muted-foreground mt-1">
                Your registration is awaiting manual review by your lecturer or an admin. You'll be
                notified as soon as it's decided — nothing else to do for now.
              </p>
            </div>
          </div>
        );

      case "REJECTED":
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-pink shrink-0 mt-0.5" />
              <div>
                <div className="font-display font-bold text-lg">Registration rejected</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {profile.rejectionReason ?? "Please re-register with a clearer passport photo."}
                </p>
              </div>
            </div>
            <WakeoutButton variant="primary" size="default" onClick={() => setStep("upload")}>
              Try again
            </WakeoutButton>
          </div>
        );

      default:
        return uploadStep;
    }
  }

  return (
    <>
      <PageHeader
        badge="Identity"
        badgeColor="bg-sky"
        title="Face ID"
        subtitle="Register your identity for exams"
      />
      <Card className="max-w-lg">{body()}</Card>
    </>
  );
}
