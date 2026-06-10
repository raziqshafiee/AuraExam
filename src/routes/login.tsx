import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MarketingLayout } from "@/components/brand/marketing-layout";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { signIn, ROLE_HOME, type Role } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — Aura Exam" },
      { name: "description", content: "Sign in to Aura Exam." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const user = await signIn(email, password);
      toast.success(`Welcome back, ${user.name}!`);
      navigate({ to: ROLE_HOME[user.role] });
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MarketingLayout>
      <section className="border-b-2 border-ink">
        <div className="max-w-md mx-auto px-6 py-20">
          <span className="inline-block px-4 py-1.5 rounded-full border-2 border-ink bg-lime font-mono text-xs uppercase tracking-widest shadow-brut-sm">Welcome back</span>
          <h1 className="mt-4 font-display font-extrabold text-5xl tracking-tight">Log in.</h1>
          <p className="mt-3 text-muted-foreground">Sign in to your Aura account.</p>

          <form onSubmit={submit} className="mt-8 rounded-3xl border-2 border-ink bg-card p-6 shadow-brut space-y-4">
            <div>
              <label className="text-xs font-mono uppercase tracking-widest">Email</label>
              <input 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
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
                placeholder="••••••••"
                className="mt-1 w-full border-2 border-ink rounded-xl px-4 py-3 bg-background" 
              />
            </div>
            <WakeoutButton type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Log in"}
            </WakeoutButton>
            <div className="flex justify-between text-sm">
              <Link to="/forgot-password" className="underline">Forgot password?</Link>
              <Link to="/register" className="underline">Create account</Link>
            </div>
          </form>
        </div>
      </section>
    </MarketingLayout>
  );
}
