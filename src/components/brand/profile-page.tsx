import { useState, useEffect } from "react";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getProfile, updateProfileName } from "@/lib/supabase/profile";
import { getSupabaseClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

type Profile = {
  id: string;
  name: string;
  email: string;
  role: "student" | "lecturer" | "admin";
  status: "active" | "banned" | "pending";
};

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const letters =
    parts.length >= 2
      ? parts[0][0] + parts[parts.length - 1][0]
      : (parts[0]?.[0] ?? "?");
  return (
    <div className="w-24 h-24 rounded-full border-2 border-ink bg-lime mx-auto flex items-center justify-center font-display font-bold text-2xl uppercase select-none">
      {letters}
    </div>
  );
}

export function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setProfile(p as Profile);
        setName((p as Profile).name);
        setEmail((p as Profile).email);
      })
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveInfo() {
    if (!name.trim()) { toast.error("Name cannot be empty"); return; }
    setSavingInfo(true);
    try {
      const nameChanged = name.trim() !== profile?.name;
      const emailChanged = email.trim() !== profile?.email;

      if (nameChanged) {
        await updateProfileName({ data: { name: name.trim() } });
        setProfile((p) => p ? { ...p, name: name.trim() } : p);
      }

      if (emailChanged) {
        const { error } = await getSupabaseClient().auth.updateUser({ email: email.trim() });
        if (error) throw new Error(error.message);
        toast.success("Confirmation sent to new email — check your inbox");
        return;
      }

      if (nameChanged) toast.success("Profile updated");
      else toast.info("Nothing changed");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save profile");
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword) { toast.error("Enter your current password"); return; }
    if (newPassword.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }

    setSavingPw(true);
    try {
      // Re-authenticate to verify current password
      const { error: signInErr } = await getSupabaseClient().auth.signInWithPassword({
        email: profile?.email ?? "",
        password: currentPassword,
      });
      if (signInErr) throw new Error("Current password is incorrect");

      const { error } = await getSupabaseClient().auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);

      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to change password");
    } finally {
      setSavingPw(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader badge="You" badgeColor="bg-violet" title="Profile" />
        <div className="text-sm text-muted-foreground">Loading…</div>
      </>
    );
  }

  return (
    <>
      <PageHeader badge="You" badgeColor="bg-violet" title="Profile" />
      <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start">
        {/* Avatar card */}
        <Card className="text-center min-w-[180px]">
          <Initials name={name || profile?.name || "?"} />
          <div className="mt-3 font-display font-bold text-xl">{profile?.name}</div>
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
            {profile?.role}
          </div>
          {profile?.status !== "active" && (
            <div className="mt-2 text-xs font-mono px-2 py-0.5 rounded-full bg-pink/20 text-pink border border-pink/40 inline-block uppercase tracking-widest">
              {profile?.status}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          {/* Info card */}
          <Card className="space-y-4">
            <div className="font-display font-bold text-lg">Account info</div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Display name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Changing email sends a confirmation link to the new address.
              </p>
            </div>
            <WakeoutButton
              variant="primary"
              disabled={savingInfo}
              onClick={handleSaveInfo}
            >
              {savingInfo ? "Saving…" : "Save changes"}
            </WakeoutButton>
          </Card>

          {/* Password card */}
          <Card className="space-y-4">
            <div className="font-display font-bold text-lg">Change password</div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Current password</label>
              <div className="relative mt-1">
                <input
                  type={showPw ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">New password</label>
              <input
                type={showPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none"
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Confirm new password</label>
              <input
                type={showPw ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background focus:outline-none"
                placeholder="Repeat new password"
              />
            </div>
            <WakeoutButton
              variant="secondary"
              disabled={savingPw}
              onClick={handleChangePassword}
            >
              {savingPw ? "Updating…" : "Update password"}
            </WakeoutButton>
          </Card>
        </div>
      </div>
    </>
  );
}
