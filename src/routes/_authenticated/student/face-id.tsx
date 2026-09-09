import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { PageHeader, Card } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { FaceIdEnroll } from "@/components/brand/face-id-enroll";
import { requestPhotoChange, getMyFacialProfile } from "@/lib/supabase/face-id";
import { FACE_ID } from "@/lib/constants";
import { fmtMY } from "@/lib/datetime";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/student/face-id")({
  head: () => ({ meta: [{ title: "Face ID — Aura" }] }),
  component: FaceIdPage,
});

function FaceIdPage() {
  const queryClient = useQueryClient();
  // "done" is a local override so a freshly finished enrollment doesn't
  // flicker back to the enroll step while the refetch is in flight; null
  // means follow the server status.
  const [step, setStep] = useState<"done" | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-facial-profile"],
    queryFn: () => getMyFacialProfile(),
  });

  async function handleRequestChange() {
    setUnlocking(true);
    try {
      await requestPhotoChange();
      toast.success("Unlocked — you can register again.");
      await queryClient.invalidateQueries({ queryKey: ["my-facial-profile"] });
      setStep(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't unlock your Face ID. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  function body() {
    if (isLoading) {
      return (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your Face ID status…
        </p>
      );
    }

    if (step === "done") {
      return <p className="text-sm text-muted-foreground">Registration complete.</p>;
    }

    if (profile?.status === "VERIFIED") {
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            {profile.photoUrl && (
              <img
                src={profile.photoUrl}
                alt=""
                className="w-16 h-16 rounded-xl border-2 border-ink object-cover shrink-0"
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-lime-600 shrink-0" />
                <div className="font-display font-bold text-lg">Registered</div>
              </div>
              {profile.lastPhotoUpdate && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Registered {fmtMY(profile.lastPhotoUpdate, { dateStyle: "medium" })}
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Your Face ID is verified and locked. To re-register you must request a photo
                change — allowed once every {FACE_ID.COOLDOWN_DAYS} days, and never within{" "}
                {FACE_ID.FREEZE_HOURS} hours of a scheduled exam.
              </p>
            </div>
          </div>
          {!profile.photoChangeEligible && profile.photoChangeReason && (
            <p className="text-sm text-amber-600 flex items-center gap-1.5">
              <Clock className="w-4 h-4 shrink-0" />
              {profile.photoChangeReason}
            </p>
          )}
          <WakeoutButton
            variant="secondary"
            size="default"
            disabled={unlocking || !profile.photoChangeEligible}
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
    }

    return (
      <FaceIdEnroll
        onDone={() => {
          setStep("done");
          queryClient.invalidateQueries({ queryKey: ["my-facial-profile"] });
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        badge="Identity"
        badgeColor="bg-sky"
        title="Face ID"
        subtitle="Register your identity for exams"
      />
      <Card className="max-w-2xl">{body()}</Card>
    </>
  );
}
