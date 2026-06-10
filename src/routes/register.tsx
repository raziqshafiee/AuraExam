import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MarketingLayout } from "@/components/brand/marketing-layout";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { signUp, ROLE_HOME, type Role } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — Aura Exam" },
      { name: "description", content: "Sign up for Aura Exam." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { needsVerification, role: confirmedRole } = await signUp(email, password, name, role);
      if (needsVerification) {
        navigate({ to: "/verify-email", search: { email } });
      } else {
        navigate({ to: ROLE_HOME[confirmedRole] });
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MarketingLayout>
      <section className="border-b-2 border-ink">
        <div className="max-w-md mx-auto px-6 py-20">
          <span className="inline-block px-4 py-1.5 rounded-full border-2 border-ink bg-pink font-mono text-xs uppercase tracking-widest shadow-brut-sm">Join us</span>
          <h1 className="mt-4 font-display font-extrabold text-5xl tracking-tight">Create account.</h1>
          <p className="mt-3 text-muted-foreground">Free during dev/testing. Lecturer signups require admin approval.</p>
          <form onSubmit={submit} className="mt-8 rounded-3xl border-2 border-ink bg-card p-6 shadow-brut space-y-4">
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Full name</label>
              <input 
                required 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" 
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Email</label>
              <input 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" 
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Password</label>
              <input 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" 
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">I am a</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["student", "lecturer"] as Role[]).map((r) => (
                  <button type="button" key={r} onClick={() => setRole(r)}
                    className={`px-3 py-2 rounded-xl border-2 border-ink font-semibold text-sm capitalize ${role === r ? (r === "student" ? "bg-sky" : "bg-violet text-violet-foreground") : "bg-background"}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <WakeoutButton type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating account..." : "Create account"}
            </WakeoutButton>
            <div className="text-sm text-center">
              Already have one? <Link to="/login" className="underline">Log in</Link>
            </div>
          </form>
        </div>
      </section>
    </MarketingLayout>
  );
}
