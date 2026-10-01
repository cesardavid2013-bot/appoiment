"use client";

import { Bell, CalendarDays, Heart, LayoutGrid, LifeBuoy, LogOut, MessageCircle, Search, Settings, Store, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/media";
import { useT } from "@/i18n/client";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { LanguagePicker } from "./language-picker";
import { Logo } from "./logo";
import { useAssistant } from "@/components/assistant/assistant";
import { useBadges } from "./use-badges";

export type ShellViewer = { id: string; name: string; email: string | null; hasBusiness: boolean; isAdmin: boolean } | null;

/** Speech mark with a check — "ask, get it handled". Drawn to match the logo, not a generic AI sparkle. */
function AskIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 15.5V6.5a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 16 6.5v4.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 2Z" />
      <path d="m7.5 9 1.8 1.8L12.8 7.4" />
    </svg>
  );
}

function CountDot({ n }: { n: number }) {
  const t = useT("common");
  if (!n) return null;
  return (
    <span className="absolute -end-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-ink tabular">
      {n > 99 ? "99+" : n}
      <span className="sr-only"> {t("header.unread")}</span>
    </span>
  );
}

export function SiteHeader({ viewer }: { viewer: ShellViewer }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT("common");
  const { data: badges } = useBadges(Boolean(viewer));
  const assistant = useAssistant();
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
          className={cn("ms-4 hidden h-10 max-w-sm flex-1 items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-sm text-ink-3 shadow-sm transition-colors hover:border-line-strong md:flex", pathname?.startsWith("/explore") && "md:hidden")}
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">{t("header.search")}</span>
        </Link>
        <nav className="ms-auto flex items-center gap-1" aria-label={t("header.mainNav")}>
          <button type="button" onClick={() => assistant.open()} className={cn(buttonClass("ghost", "sm"), "gap-1.5")} aria-haspopup="dialog">
            <AskIcon />
            <span className="hidden sm:inline">{t("header.ask")}</span>
            <span className="sr-only sm:hidden">{t("header.askKept")}</span>
          </button>
          <Link href="/explore" className={cn(buttonClass("ghost", "sm"), "hidden md:inline-flex", pathname?.startsWith("/explore") && "text-ink")}>
            {t("header.explore")}
          </Link>
          {viewer?.hasBusiness ? (
            <Link href="/pro" className={cn(buttonClass("ghost", "sm"), "hidden lg:inline-flex")}>
              {t("header.myBusiness")}
            </Link>
          ) : (
            <Link href="/for-business" className={cn(buttonClass("ghost", "sm"), "hidden lg:inline-flex")}>
              {t("header.forPros")}
            </Link>
          )}
          {viewer ? (
            <>
              <Link href="/bookings" className={cn(buttonClass("ghost", "sm"), "hidden md:inline-flex")}>
                {t("header.bookings")}
              </Link>
              <LanguagePicker compact className="hidden md:inline-flex" />
              <Link href="/messages" className={cn(buttonClass("ghost", "icon"), "relative hidden md:inline-flex")} aria-label={t("header.messages")}>
                <MessageCircle className="size-[19px]" />
                <CountDot n={badges?.messages ?? 0} />
              </Link>
              <Link href="/notifications" className={cn(buttonClass("ghost", "icon"), "relative")} aria-label={t("header.notifications")}>
                <Bell className="size-[19px]" />
                <CountDot n={badges?.notifications ?? 0} />
              </Link>
              <Menu>
                <MenuTrigger className="ms-1 rounded-full outline-offset-2" aria-label={t("header.accountMenu")}>
                  <Avatar name={viewer.name} size={34} />
                </MenuTrigger>
                <MenuContent>
                  <MenuLabel>
                    <span className="block truncate text-sm font-medium text-ink">{viewer.name}</span>
                    <span className="block truncate font-normal">{viewer.email}</span>
                  </MenuLabel>
                  <MenuSeparator />
                  <MenuItem icon={<CalendarDays />} onSelect={() => router.push("/bookings")}>
                    {t("accountMenu.bookings")}
                  </MenuItem>
                  <MenuItem icon={<Heart />} onSelect={() => router.push("/favorites")}>
                    {t("accountMenu.saved")}
                  </MenuItem>
                  <MenuItem icon={<MessageCircle />} onSelect={() => router.push("/messages")}>
                    {t("accountMenu.messages")}
                  </MenuItem>
                  <MenuItem icon={<Settings />} onSelect={() => router.push("/account")}>
                    {t("accountMenu.settings")}
                  </MenuItem>
                  <MenuItem icon={<LifeBuoy />} onSelect={() => router.push("/support")}>
                    {t("accountMenu.help")}
                  </MenuItem>
                  <MenuSeparator />
                  {viewer.hasBusiness ? (
                    <MenuItem icon={<Store />} onSelect={() => router.push("/pro")}>
                      {t("accountMenu.switchToBusiness")}
                    </MenuItem>
                  ) : (
                    <MenuItem icon={<Store />} onSelect={() => router.push("/for-business")}>
                      {t("accountMenu.offerServices")}
                    </MenuItem>
                  )}
                  {viewer.isAdmin && (
                    <MenuItem icon={<LayoutGrid />} onSelect={() => router.push("/admin")}>
                      {t("accountMenu.admin")}
                    </MenuItem>
                  )}
                  <MenuSeparator />
                  <MenuItem icon={<LogOut />} onSelect={logout}>
                    {t("accountMenu.signOut")}
                  </MenuItem>
                </MenuContent>
              </Menu>
            </>
          ) : (
            <>
              <LanguagePicker compact className="hidden md:inline-flex" />
              <Link href={`/login?next=${next}`} className={buttonClass("ghost", "sm")}>
                {t("header.logIn")}
              </Link>
              <Link href={`/signup?next=${next}`} className={buttonClass("primary", "sm")}>
                {t("header.signUp")}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

const TABS = [
  { href: "/", key: "home", icon: LayoutGrid, match: (p: string) => p === "/" },
  { href: "/explore", key: "explore", icon: Search, match: (p: string) => p.startsWith("/explore") },
  { href: "/bookings", key: "bookings", icon: CalendarDays, match: (p: string) => p.startsWith("/bookings") },
  { href: "/messages", key: "inbox", icon: MessageCircle, match: (p: string) => p.startsWith("/messages") },
  { href: "/account", key: "account", icon: User, match: (p: string) => p.startsWith("/account") || p.startsWith("/favorites") },
] as const;

/** Bottom tab bar for phones. Signed-out users are sent to sign in for personal tabs. */
export function MobileTabBar({ viewer }: { viewer: ShellViewer }) {
  const pathname = usePathname() ?? "/";
  const t = useT("common");
  const { data: badges } = useBadges(Boolean(viewer));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 backdrop-blur-md safe-bottom md:hidden" aria-label={t("tabs.label")}>
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const personal = tab.href !== "/" && tab.href !== "/explore";
          const href = personal && !viewer ? `/login?next=${encodeURIComponent(tab.href)}` : tab.href;
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link href={href} className={cn("relative flex h-[58px] flex-col items-center justify-center gap-1 px-0.5 text-center text-[11px] font-medium leading-tight transition-colors", active ? "text-ink" : "text-ink-3")} aria-current={active ? "page" : undefined}>
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  {tab.href === "/messages" && <CountDot n={badges?.messages ?? 0} />}
                </span>
                <span className="max-w-full truncate">{t(`tabs.${tab.key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
