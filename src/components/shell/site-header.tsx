"use client";

import { Bell, CalendarDays, Heart, LayoutGrid, LifeBuoy, LogOut, MessageCircle, Search, Settings, Store, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/media";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Logo } from "./logo";
import { useBadges } from "./use-badges";

export type ShellViewer = { id: string; name: string; email: string | null; hasBusiness: boolean; isAdmin: boolean } | null;

function CountDot({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-ink tabular">
      {n > 99 ? "99+" : n}
      <span className="sr-only"> unread</span>
    </span>
  );
}

export function SiteHeader({ viewer }: { viewer: ShellViewer }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: badges } = useBadges(Boolean(viewer));
  const next = encodeURIComponent(pathname ?? "/");

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/85 backdrop-blur-md safe-top supports-[backdrop-filter]:bg-bg/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Logo />
        <Link
          href="/explore"
          className={cn("ml-4 hidden h-10 max-w-sm flex-1 items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-sm text-ink-3 shadow-sm transition-colors hover:border-line-strong md:flex", pathname?.startsWith("/explore") && "md:hidden")}
        >
          <Search className="size-4" />
          <span>Search services or professionals</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1" aria-label="Main">
          <Link href="/explore" className={cn(buttonClass("ghost", "sm"), "hidden md:inline-flex", pathname?.startsWith("/explore") && "text-ink")}>
            Explore
          </Link>
          {viewer?.hasBusiness ? (
            <Link href="/pro" className={cn(buttonClass("ghost", "sm"), "hidden lg:inline-flex")}>
              My business
            </Link>
          ) : (
            <Link href="/for-business" className={cn(buttonClass("ghost", "sm"), "hidden lg:inline-flex")}>
              For professionals
            </Link>
          )}
          {viewer ? (
            <>
              <Link href="/bookings" className={cn(buttonClass("ghost", "sm"), "hidden md:inline-flex")}>
                Bookings
              </Link>
              <Link href="/messages" className={cn(buttonClass("ghost", "icon"), "relative hidden md:inline-flex")} aria-label="Messages">
                <MessageCircle className="size-[19px]" />
                <CountDot n={badges?.messages ?? 0} />
              </Link>
              <Link href="/notifications" className={cn(buttonClass("ghost", "icon"), "relative")} aria-label="Notifications">
                <Bell className="size-[19px]" />
                <CountDot n={badges?.notifications ?? 0} />
              </Link>
              <Menu>
                <MenuTrigger className="ml-1 rounded-full outline-offset-2" aria-label="Account menu">
                  <Avatar name={viewer.name} size={34} />
                </MenuTrigger>
                <MenuContent>
                  <MenuLabel>
                    <span className="block truncate text-sm font-medium text-ink">{viewer.name}</span>
                    <span className="block truncate font-normal">{viewer.email}</span>
                  </MenuLabel>
                  <MenuSeparator />
                  <MenuItem icon={<CalendarDays />} onSelect={() => router.push("/bookings")}>
                    Bookings
                  </MenuItem>
                  <MenuItem icon={<Heart />} onSelect={() => router.push("/favorites")}>
                    Saved
                  </MenuItem>
                  <MenuItem icon={<MessageCircle />} onSelect={() => router.push("/messages")}>
                    Messages
                  </MenuItem>
                  <MenuItem icon={<Settings />} onSelect={() => router.push("/account")}>
                    Account settings
                  </MenuItem>
                  <MenuItem icon={<LifeBuoy />} onSelect={() => router.push("/support")}>
                    Help & support
                  </MenuItem>
                  <MenuSeparator />
                  {viewer.hasBusiness ? (
                    <MenuItem icon={<Store />} onSelect={() => router.push("/pro")}>
                      Switch to business
                    </MenuItem>
                  ) : (
                    <MenuItem icon={<Store />} onSelect={() => router.push("/for-business")}>
                      Offer your services
                    </MenuItem>
                  )}
                  {viewer.isAdmin && (
                    <MenuItem icon={<LayoutGrid />} onSelect={() => router.push("/admin")}>
                      Admin console
                    </MenuItem>
                  )}
                  <MenuSeparator />
                  <MenuItem icon={<LogOut />} onSelect={logout}>
                    Sign out
                  </MenuItem>
                </MenuContent>
              </Menu>
            </>
          ) : (
            <>
              <Link href={`/login?next=${next}`} className={buttonClass("ghost", "sm")}>
                Log in
              </Link>
              <Link href={`/signup?next=${next}`} className={buttonClass("primary", "sm")}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

const TABS = [
  { href: "/", label: "Home", icon: LayoutGrid, match: (p: string) => p === "/" },
  { href: "/explore", label: "Explore", icon: Search, match: (p: string) => p.startsWith("/explore") },
  { href: "/bookings", label: "Bookings", icon: CalendarDays, match: (p: string) => p.startsWith("/bookings") },
  { href: "/messages", label: "Inbox", icon: MessageCircle, match: (p: string) => p.startsWith("/messages") },
  { href: "/account", label: "Account", icon: User, match: (p: string) => p.startsWith("/account") || p.startsWith("/favorites") },
];

/** Bottom tab bar for phones. Signed-out users are sent to sign in for personal tabs. */
export function MobileTabBar({ viewer }: { viewer: ShellViewer }) {
  const pathname = usePathname() ?? "/";
  const { data: badges } = useBadges(Boolean(viewer));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 backdrop-blur-md safe-bottom md:hidden" aria-label="Primary">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((t) => {
          const active = t.match(pathname);
          const personal = t.href !== "/" && t.href !== "/explore";
          const href = personal && !viewer ? `/login?next=${encodeURIComponent(t.href)}` : t.href;
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link href={href} className={cn("relative flex h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-ink" : "text-ink-3")} aria-current={active ? "page" : undefined}>
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  {t.href === "/messages" && <CountDot n={badges?.messages ?? 0} />}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
