import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { Logo } from "./logo";
import { useAuthUser, signOut, type Role } from "@/lib/auth";
import {
  Bell, LogOut, User, ChevronDown, Menu,
  LayoutDashboard, BookOpen, FileText, Library, Scale,
  Users, ScrollText, Shield, ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { getUnreadCount } from "@/lib/supabase/notifications";
import { getPendingAppealsCount } from "@/lib/supabase/appeals";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type NavItem = { to: string; label: string; icon: LucideIcon; badge?: "inbox" | "appeals"; mobileHidden?: boolean };

const PRIMARY_NAV: Record<Role, NavItem[]> = {
  student: [
    { to: "/student",         label: "Dashboard", icon: LayoutDashboard },
    { to: "/student/classes", label: "Classes",   icon: BookOpen },
    { to: "/student/exams",   label: "Exams",     icon: FileText, mobileHidden: true },
    { to: "/student/appeals", label: "Appeals",   icon: Scale, badge: "appeals" },
  ],
  lecturer: [
    { to: "/lecturer",               label: "Dashboard",    icon: LayoutDashboard },
    { to: "/lecturer/classes",       label: "Classes",      icon: BookOpen },
    { to: "/lecturer/question-bank", label: "Question Bank",icon: Library },
    { to: "/lecturer/exams",         label: "Exams",        icon: FileText },
    { to: "/lecturer/appeals",       label: "Appeals",      icon: Scale, badge: "appeals" },
  ],
  admin: [
    { to: "/admin",            label: "Dashboard", icon: LayoutDashboard },
    { to: "/admin/users",      label: "Users",     icon: Users },
    { to: "/admin/classes",    label: "Classes",   icon: BookOpen },
    { to: "/admin/exams",      label: "Exams",     icon: FileText },
    { to: "/admin/integrity",  label: "Integrity", icon: ShieldAlert },
    { to: "/admin/audit-log",  label: "Audit Log", icon: ScrollText },
    { to: "/admin/pdpa",       label: "PDPA",      icon: Shield },
  ],
};

// Pinned below primary nav, above logout. Admin has no notifications/profile routes.
const UTILITY_NAV: Partial<Record<Role, NavItem[]>> = {
  student: [
    { to: "/student/notifications", label: "Inbox",   icon: Bell, badge: "inbox" },
    { to: "/student/profile",       label: "Profile", icon: User },
  ],
  lecturer: [
    { to: "/lecturer/notifications", label: "Inbox",   icon: Bell, badge: "inbox" },
    { to: "/lecturer/profile",       label: "Profile", icon: User },
  ],
};

const ROLE_BG: Record<Role, string> = {
  student: "bg-sky",
  lecturer: "bg-violet text-violet-foreground",
  admin: "bg-lime",
};

// Root dashboard routes must use exact match — startsWith would highlight on every sub-page.
const ROOT_ROUTES = new Set(["/student", "/lecturer", "/admin"]);

const ROLE_ACCENT: Record<Role, string> = {
  student: "bg-sky",
  lecturer: "bg-violet",
  admin: "bg-lime",
};

function isActive(itemTo: string, pathname: string) {
  if (ROOT_ROUTES.has(itemTo)) return pathname === itemTo;
  return pathname === itemTo || pathname.startsWith(itemTo + "/");
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-pink border-2 border-ink text-[10px] font-bold text-white flex items-center justify-center leading-none shrink-0">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NavLink({
  item, role, pathname, badges,
}: {
  item: NavItem; role: Role; pathname: string; badges: Record<string, number>;
}) {
  const Icon = item.icon;
  const active = isActive(item.to, pathname);
  const count = item.badge ? (badges[item.badge] ?? 0) : 0;
  return (
    <Link
      to={item.to}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
        active
          ? `${ROLE_BG[role]} border-ink shadow-brut-sm`
          : "border-transparent hover:bg-accent"
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{item.label}</span>
      <NavBadge count={count} />
    </Link>
  );
}

const BOTTOM_NAV_MAX = 4;

function BottomNav({ role, pathname, badges }: { role: Role; pathname: string; badges: Record<string, number> }) {
  const primaryItems = PRIMARY_NAV[role].filter((i) => !i.mobileHidden);
  const visibleItems = primaryItems.slice(0, BOTTOM_NAV_MAX);
  const overflowItems = primaryItems.slice(BOTTOM_NAV_MAX);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t-2 border-ink flex h-16">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.to, pathname);
        const count = item.badge ? (badges[item.badge] ?? 0) : 0;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors ${
              active ? "text-ink" : "text-muted-foreground"
            }`}
          >
            {active && (
              <span className={`absolute top-0 left-3 right-3 h-[3px] rounded-b-full ${ROLE_ACCENT[role]}`} />
            )}
            <div className="relative">
              <Icon className="w-[22px] h-[22px]" />
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-pink border-2 border-background text-[8px] font-bold text-white flex items-center justify-center leading-none">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold leading-none">{item.label}</span>
          </Link>
        );
      })}
      {overflowItems.length > 0 && (
        <Sheet>
          <SheetTrigger asChild>
            <button className="flex-1 flex flex-col items-center justify-center gap-1 text-muted-foreground">
              <Menu className="w-[22px] h-[22px]" />
              <span className="text-[10px] font-semibold leading-none">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="border-t-2 border-ink rounded-t-2xl p-4">
            <div className="space-y-1 pt-2">
              {overflowItems.map((item) => (
                <NavLink key={item.to} item={item} role={role} pathname={pathname} badges={badges} />
              ))}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const isExamFullscreen = /\/exams\/[^/]+\/take$/.test(pathname);
  const role = user?.role ?? "student";
  const primaryItems = PRIMARY_NAV[role];
  const utilityItems = UTILITY_NAV[role] ?? [];

  const { data: unreadData } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => getUnreadCount(),
    refetchInterval: 30_000,
    enabled: !!user,
  });

  const { data: appealsData } = useQuery({
    queryKey: ["pending-appeals-count"],
    queryFn: () => getPendingAppealsCount(),
    refetchInterval: 60_000,
    enabled: !!user && role !== "admin",
  });

  const badges: Record<string, number> = {
    inbox:   unreadData?.count  ?? 0,
    appeals: appealsData?.count ?? 0,
  };

  const unreadCount = badges.inbox;

  const doLogout = async () => {
    try {
      await signOut();
      toast.success("Logged out successfully");
      navigate({ to: "/" });
    } catch (error: any) {
      toast.error(error.message || "Failed to log out");
    }
  };

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-ink border-t-lime rounded-full animate-spin" />
          <p className="font-mono text-sm uppercase tracking-widest">Loading Aura...</p>
        </div>
      </div>
    );
  }

  if (isExamFullscreen) {
    return <div className="min-h-screen bg-secondary">{children}</div>;
  }

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r-2 border-ink bg-sidebar h-screen sticky top-0 overflow-hidden">
        {/* Logo + role badge */}
        <div className="p-5 border-b-2 border-ink">
          <Logo to={`/${role}`} />
          <div className={`mt-3 inline-block px-2.5 py-1 rounded-full border-2 border-ink text-[10px] font-mono uppercase tracking-widest ${ROLE_BG[role]}`}>
            {role}
          </div>
        </div>

        {/* Primary nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {primaryItems.map((item) => (
            <NavLink key={item.to} item={item} role={role} pathname={pathname} badges={badges} />
          ))}
        </nav>

        {/* Utility nav (Inbox, Profile) — student + lecturer only */}
        {utilityItems.length > 0 && (
          <div className="px-3 pt-3 pb-2 space-y-1 border-t-2 border-ink">
            {utilityItems.map((item) => (
              <NavLink key={item.to} item={item} role={role} pathname={pathname} badges={badges} />
            ))}
          </div>
        )}

        {/* Logout */}
        <div className="p-3 border-t-2 border-ink">
          <button
            onClick={doLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-accent border-2 border-transparent"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 px-4 md:px-6 border-b-2 border-ink bg-background/85 backdrop-blur flex items-center gap-3">
          <div className="md:hidden"><Logo to={`/${role}`} /></div>
          <div className="ml-auto flex items-center gap-2">
            {/* Bell — mobile shortcut (sidebar hidden on mobile) */}
            {role !== "admin" && (
              <Link
                to={`/${role}/notifications`}
                className="relative w-10 h-10 inline-flex items-center justify-center rounded-full border-2 border-ink bg-card hover:bg-accent"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-pink border-2 border-ink text-[10px] font-bold text-white flex items-center justify-center leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 px-3 h-10 rounded-full border-2 border-ink bg-card hover:bg-accent">
                <span className={`w-6 h-6 rounded-full border-2 border-ink ${ROLE_BG[role]}`} />
                <span className="text-sm font-semibold hidden sm:inline">{user?.name ?? "Guest"}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-2 border-ink shadow-brut">
                <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {role !== "admin" && (
                  <DropdownMenuItem asChild>
                    <Link to={`/${role}/profile`}><User className="w-4 h-4 mr-2" /> Profile</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={doLogout}><LogOut className="w-4 h-4 mr-2" /> Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
      <BottomNav role={role} pathname={pathname} badges={badges} />
    </div>
  );
}
