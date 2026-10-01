"use client";

import { Dialog as D } from "radix-ui";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  Flag,
  FolderTree,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu as MenuIcon,
  ScrollText,
  Server,
  Star,
  Store,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/shell/logo";
import { Avatar } from "@/components/ui/media";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

export type AdminShellViewer = { name: string; email: string | null; role: "admin" | "support" };
export type AdminCounts = { reports: number; verifications: number; tickets: number; jobs: number };

type Item = { href: string; label: string; icon: typeof Users; level: "support" | "admin"; count?: keyof AdminCounts; exact?: boolean };

const GROUPS: { label: string | null; items: Item[] }[] = [
  { label: null, items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard, level: "support", exact: true }] },
  {
    label: "Marketplace",
    items: [
      { href: "/admin/users", label: "Users", icon: Users, level: "support" },
      { href: "/admin/businesses", label: "Businesses", icon: Store, level: "support" },
      { href: "/admin/appointments", label: "Appointments", icon: CalendarDays, level: "support" },
      { href: "/admin/categories", label: "Categories", icon: FolderTree, level: "admin" },
      { href: "/admin/spotlight", label: "Spotlight", icon: Megaphone, level: "admin" },
    ],
  },
  {
    label: "Trust & safety",
    items: [
      { href: "/admin/verifications", label: "Verifications", icon: BadgeCheck, level: "admin", count: "verifications" },
      { href: "/admin/reports", label: "Reports", icon: Flag, level: "admin", count: "reports" },
      { href: "/admin/reviews", label: "Reviews", icon: Star, level: "admin" },
      { href: "/admin/support", label: "Support inbox", icon: LifeBuoy, level: "support", count: "tickets" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/admin/audit", label: "Audit log", icon: ScrollText, level: "admin" },
      { href: "/admin/system", label: "System", icon: Server, level: "admin", count: "jobs" },
    ],
  },
];

function Nav({ role, counts, onNavigate }: { role: AdminShellViewer["role"]; counts: AdminCounts; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "/admin";
  return (
    <nav aria-label="Admin" className="space-y-5">
      {GROUPS.map((g, gi) => {
        const items = g.items.filter((i) => i.level === "support" || role === "admin");
        if (!items.length) return null;
        return (
          <div key={gi}>
            {g.label && <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{g.label}</p>}
            <ul className="space-y-0.5">
              {items.map((i) => {
                const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
                const n = i.count ? counts[i.count] : 0;
                const Icon = i.icon;
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                        active ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-ink" : "text-ink-3")} aria-hidden />
                      <span className="flex-1 truncate">{i.label}</span>
                      {n > 0 && (
                        <span className={cn("rounded-sm px-1.5 text-[11px] font-semibold leading-5 tabular", i.count === "jobs" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn")}>
                          {n > 999 ? "999+" : n}
                          <span className="sr-only"> pending</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Account({ viewer }: { viewer: AdminShellViewer }) {
  const router = useRouter();
  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    router.push("/");
    router.refresh();
  }
  return (
    <div className="space-y-1 border-t border-line pt-3">
      <div className="flex items-center gap-2.5 px-2.5 py-1.5">
        <Avatar name={viewer.name} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{viewer.name}</p>
          <p className="truncate text-[12px] text-ink-3">{viewer.role === "admin" ? "Platform admin" : "Support agent"}</p>
        </div>
      </div>
      <Link href="/" className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
        <ArrowUpRight className="size-4 text-ink-3" aria-hidden />
        Back to Kept
      </Link>
      <button type="button" onClick={logout} className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
        <LogOut className="size-4 text-ink-3" aria-hidden />
        Sign out
      </button>
    </div>
  );
}

export function AdminShell({ viewer, counts, children }: { viewer: AdminShellViewer; counts: AdminCounts; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <div className="hidden border-r border-line bg-surface-2/40 lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col px-3 py-4">
          <div className="mb-6 px-2.5">
            <Logo href="/admin" suffix="Admin" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Nav role={viewer.role} counts={counts} />
          </div>
          <Account viewer={viewer} />
        </aside>
      </div>

      {/* Mobile top bar + sheet */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur-md safe-top lg:hidden">
        <Logo href="/admin" suffix="Admin" />
        <D.Root open={open} onOpenChange={setOpen}>
          <D.Trigger className="-mr-2 flex size-10 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Open admin menu">
            <MenuIcon className="size-5" />
          </D.Trigger>
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
            <D.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(300px,86vw)] flex-col bg-surface px-3 py-4 shadow-lg outline-none data-[state=open]:animate-fade-in">
              <div className="mb-5 flex items-center justify-between px-2.5">
                <D.Title className="sr-only">Admin navigation</D.Title>
                <D.Description className="sr-only">Sections of the admin console</D.Description>
                <Logo href="/admin" suffix="Admin" />
                <D.Close className="-mr-2 flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close menu">
                  <X className="size-5" />
                </D.Close>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Nav role={viewer.role} counts={counts} onNavigate={() => setOpen(false)} />
              </div>
              <Account viewer={viewer} />
            </D.Content>
          </D.Portal>
        </D.Root>
      </header>

      <main id="main" className="min-w-0 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
