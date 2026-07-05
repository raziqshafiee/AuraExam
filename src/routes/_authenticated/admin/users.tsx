import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, PageHeader } from "@/components/brand/page";
import { WakeoutButton } from "@/components/brand/wakeout-button";
import { getAllUsers, banUser, unbanUser, type AdminUser } from "@/lib/supabase/users";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Users — Aura" }] }),
  loader: () => getAllUsers(),
  component: UsersPage,
});

function UsersPage() {
  const initial = Route.useLoaderData();
  const [users, setUsers] = useState<AdminUser[]>(initial);
  // Re-sync when loader re-runs (window focus, post-mutation invalidation).
  useEffect(() => { setUsers(initial); }, [initial]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "student" | "lecturer" | "admin">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "banned">("all");
  const [loading, setLoading] = useState<string | null>(null);

  const filtered = users.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  async function handleBan(userId: string) {
    setLoading(userId);
    try {
      await banUser({ data: userId });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, status: "banned" } : u));
      toast.success("User banned");
    } catch {
      toast.error("Failed to ban user");
    } finally {
      setLoading(null);
    }
  }

  async function handleUnban(userId: string) {
    setLoading(userId);
    try {
      await unbanUser({ data: userId });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, status: "active" } : u));
      toast.success("User unbanned");
    } catch {
      toast.error("Failed to unban user");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <PageHeader
        badge="People"
        badgeColor="bg-lime"
        title="Users"
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-2 border-ink rounded-full px-4 py-1.5 text-sm font-mono flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-lime"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          className="border-2 border-ink rounded-full px-3 py-1.5 text-sm font-mono focus:outline-none"
        >
          <option value="all">All roles</option>
          <option value="student">Student</option>
          <option value="lecturer">Lecturer</option>
          <option value="admin">Admin</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="border-2 border-ink rounded-full px-3 py-1.5 text-sm font-mono focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono uppercase tracking-widest text-muted-foreground border-b-2 border-ink">
              <th className="py-3">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-ink/10">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground font-mono text-sm">
                  No users found
                </td>
              </tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id}>
                <td className="py-3 font-semibold">{u.name}</td>
                <td className="font-mono text-xs">{u.email}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full border-2 border-ink text-xs font-mono ${
                    u.role === "admin" ? "bg-lime" : u.role === "lecturer" ? "bg-violet text-violet-foreground" : "bg-sky"
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full border-2 border-ink text-xs font-mono ${
                    u.status === "active" ? "bg-lime" : u.status === "pending" ? "bg-amber" : "bg-pink"
                  }`}>
                    {u.status}
                  </span>
                </td>
                <td className="font-mono text-xs">{u.joined}</td>
                <td className="text-right space-x-1">
                  {u.status === "active" && u.role !== "admin" && (
                    <WakeoutButton
                      size="sm"
                      variant="destructive"
                      disabled={loading === u.id}
                      onClick={() => handleBan(u.id)}
                    >
                      {loading === u.id ? "…" : "Ban"}
                    </WakeoutButton>
                  )}
                  {u.status === "banned" && (
                    <WakeoutButton
                      size="sm"
                      variant="primary"
                      disabled={loading === u.id}
                      onClick={() => handleUnban(u.id)}
                    >
                      {loading === u.id ? "…" : "Unban"}
                    </WakeoutButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
