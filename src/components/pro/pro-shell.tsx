"use client";

import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronsUpDown,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  LayoutGrid,
  LogOut,
  Megaphone,
  MessageCircle,
  Plus,
  Scissors,
  Settings,
  Star,
  Sun,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/shell/logo";
import { useBadges } from "@/components/shell/use-badges";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/media";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { GROUP_LABELS, visibleNav, type ProNavItem } from "./nav";

const ICONS: Record<string, LucideIcon> = {
  sun: Sun,
  calendar: CalendarDays,
  users: Users,
  message: MessageCircle,
  scissors: Scissors,
  clock: Clock,
  team: UsersRound,
  image: ImageIcon,
  star: Star,
  megaphone: Megaphone,
  chart: BarChart3,
  settings: Settings,
};

export type ShellBusiness = { id: string; name: string; slug: string; status: string; role: string };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function Count({ n }: { n: number }) {
  if (!n) return null;
  return <span className="ml-auto rounded-full bg-accent px-1.5 py-px text-[11px] font-semibold text-accent-ink tabular">{n > 99 ? "99+" : n}</span>;
}

export function ProShell({ children, business, businesses, perms, user }: { children: ReactNode; business: ShellBusiness; businesses: ShellBusiness[]; perms: string[]; user: { name: string; email: string | null } }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const nav = visibleNav(perms);
  const { data: badges } = useBadges(true);

  async function switchTo(id: string) {
    await api("/api/pro/switch", { body: { businessId: id } });
    router.push("/pro/today");
    router.refresh();
  }
  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  const groups = (["main", "business", "growth", "settings"] as const).map((g) => ({ g, items: nav.filter((i) => i.group === g) })).filter((x) => x.items.length);
  const mobileTabs: ProNavItem[] = [
    nav.find((i) => i.href === "/pro/today")!,
    nav.find((i) => i.href === "/pro/calendar")!,
    ...(nav.find((i) => i.href === "/pro/clients") ? [nav.find((i) => i.href === "/pro/clients")!] : []),
    ...(nav.find((i) => i.href === "/pro/messages") ? [nav.find((i) => i.href === "/pro/messages")!] : []),
  ];
  const hubActive = !mobileTabs.some((t) => isActive(pathname, t.href));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface/50 lg:flex" aria-label="Business navigation">
        <div className="px-5 pt-5">
          <Logo href="/pro/today" />
        </div>
        <div className="px-3 pt-5">
          <Menu>
            <MenuTrigger className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-left hover:border-line-strong">
              <Avatar name={business.name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{business.name}</span>
                <span className="block text-[12px] text-ink-3">{business.status === "active" ? "Live" : business.status === "draft" ? "Not live yet" : business.status}</span>
              </span>
              <ChevronsUpDown className="size-4 text-ink-3" />
            </MenuTrigger>
            <MenuContent align="start" className="w-60">
              <MenuLabel>Your businesses</MenuLabel>
              {businesses.map((b) => (
                <MenuItem key={b.id} onSelect={() => b.id !== business.id && switchTo(b.id)}>
                  <span className={cn("truncate", b.id === business.id && "font-semibold")}>{b.name}</span>
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem icon={<Plus />} onSelect={() => router.push("/pro/onboarding?new=1")}>
                Add another business
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
          {groups.map(({ g, items }) => (
            <div key={g} className="mb-4">
              {GROUP_LABELS[g] && <p className="px-2.5 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{GROUP_LABELS[g]}</p>}
              <ul className="space-y-0.5">
                {items.map((i) => {
                  const Icon = ICONS[i.icon];
                  const active = isActive(pathname, i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={active ? "page" : undefined}
                        className={cn("flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors", active ? "bg-surface-3/70 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
                      >
                        <Icon className={cn("size-[17px]", active ? "text-ink" : "text-ink-3")} strokeWidth={active ? 2.1 : 1.8} />
                        {i.label}
                        {i.href === "/pro/messages" && <Count n={badges?.messages ?? 0} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <Link href={`/${business.slug}`} target="_blank" className="mb-1 flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
            <ExternalLink className="size-[17px] text-ink-3" /> View public page
          </Link>
          <Menu>
            <MenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-2">
              <Avatar name={user.name} size={26} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{user.name}</span>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuLabel>{user.email}</MenuLabel>
              <MenuItem icon={<LayoutGrid />} onSelect={() => router.push("/")}>
                Switch to booking
              </MenuItem>
              <MenuItem icon={<Settings />} onSelect={() => router.push("/account")}>
                Personal account
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<LogOut />} onSelect={logout}>
                Sign out
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-md safe-top lg:hidden">
        <Avatar name={business.name} size={28} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{business.name}</span>
        <Link href="/notifications" className="relative flex size-10 items-center justify-center rounded-md text-ink-2" aria-label="Notifications">
          <Bell className="size-5" />
          {badges?.notifications ? <span className="absolute right-2 top-2 size-2 rounded-full bg-accent" aria-hidden /> : null}
        </Link>
      </header>

      <main id="main" className="min-w-0 pb-28 lg:pb-0">
        {children}
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 backdrop-blur-md safe-bottom lg:hidden" aria-label="Business">
        <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${mobileTabs.length + 1}, minmax(0, 1fr))` }}>
          {[...mobileTabs, { href: "/pro/business", label: "Business", icon: "grid", group: "main" as const }].map((t) => {
            const Icon = t.icon === "grid" ? LayoutGrid : ICONS[t.icon];
            const active = t.href === "/pro/business" ? hubActive : isActive(pathname, t.href);
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-ink" : "text-ink-3")}>
                  <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  {t.label}
                  {t.href === "/pro/messages" && badges?.messages ? <span className="absolute right-[calc(50%-18px)] top-2 size-2 rounded-full bg-accent" aria-hidden /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export { ICONS as PRO_ICONS };
