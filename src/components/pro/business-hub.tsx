"use client";

import { Check, ChevronRight, ExternalLink, LayoutGrid, LogOut, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/media";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { visibleNav } from "./nav";
import { PRO_ICONS, type ShellBusiness } from "./pro-shell";

/** Sections that already have a tab in the mobile tab bar. */
const IN_TAB_BAR = new Set(["/pro/today", "/pro/calendar", "/pro/clients", "/pro/messages"]);

const BLURBS: Record<string, string> = {
  "/pro/services": "What clients can book, prices and durations",
  "/pro/availability": "Working hours, breaks and time off",
  "/pro/team": "People, roles and who does what",
  "/pro/work": "Photos and videos of your work",
  "/pro/reviews": "Read and reply to client reviews",
  "/pro/promote": "Promo codes and getting found on Kept",
  "/pro/insights": "Bookings, revenue and returning clients",
  "/pro/settings": "Profile, locations, booking rules, payments",
};

const ROW = "flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-left hover:bg-surface-2/60 sm:px-5";

/** The mobile "Business" tab: every console section that isn't in the tab bar, plus business and account switching. */
export function BusinessHub({ business, businesses, perms, user }: { business: ShellBusiness; businesses: ShellBusiness[]; perms: string[]; user: { name: string; email: string | null } }) {
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);
  const sections = visibleNav(perms).filter((i) => !IN_TAB_BAR.has(i.href));

  async function switchTo(id: string) {
    setSwitching(id);
    try {
      await api("/api/pro/switch", { body: { businessId: id } });
      router.push("/pro/today");
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
      setSwitching(null);
    }
  }
  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">
      <div className="flex items-center gap-3.5">
        <Avatar name={business.name} size={48} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-[-0.01em] text-ink">{business.name}</h1>
          <p className="text-sm text-ink-3">{business.status === "active" ? "Live — clients can book you" : business.status === "draft" ? "Not live yet" : business.status}</p>
        </div>
      </div>

      <nav aria-label="Business sections">
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {sections.map((s) => {
            const Icon = PRO_ICONS[s.icon];
            return (
              <li key={s.href}>
                <Link href={s.href} className={ROW}>
                  <Icon className="size-5 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-ink">{s.label}</span>
                    {BLURBS[s.href] && <span className="block truncate text-[13px] text-ink-3">{BLURBS[s.href]}</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
                </Link>
              </li>
            );
          })}
          <li>
            <Link href={`/${business.slug}`} target="_blank" className={ROW}>
              <ExternalLink className="size-5 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">View public page</span>
                <span className="block truncate text-[13px] text-ink-3 tabular">kept.app/{business.slug}</span>
              </span>
            </Link>
          </li>
        </ul>
      </nav>

      <section aria-labelledby="hub-businesses">
        <h2 id="hub-businesses" className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          {businesses.length > 1 ? "Your businesses" : "Business"}
        </h2>
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {businesses.length > 1 &&
            businesses.map((b) => {
              const current = b.id === business.id;
              return (
                <li key={b.id}>
                  <button type="button" className={cn(ROW, current && "cursor-default hover:bg-transparent")} onClick={() => !current && switchTo(b.id)} disabled={switching != null} aria-current={current ? "true" : undefined}>
                    <Avatar name={b.name} size={28} />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{b.name}</span>
                    {current ? <Check className="size-4 shrink-0 text-accent" aria-label="Current business" /> : switching === b.id ? <span className="text-[13px] text-ink-3">Switching…</span> : null}
                  </button>
                </li>
              );
            })}
          <li>
            <Link href="/pro/onboarding?new=1" className={ROW}>
              <Plus className="size-5 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden />
              <span className="text-[15px] text-ink">Add another business</span>
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="hub-account">
        <h2 id="hub-account" className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          Signed in as {user.name}
        </h2>
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          <li>
            <Link href="/" className={ROW}>
              <LayoutGrid className="size-5 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden />
              <span className="text-[15px] text-ink">Switch to booking</span>
            </Link>
          </li>
          <li>
            <Link href="/account" className={ROW}>
              <UserRound className="size-5 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-ink">Personal account</span>
                {user.email && <span className="block truncate text-[13px] text-ink-3">{user.email}</span>}
              </span>
            </Link>
          </li>
          <li>
            <button type="button" onClick={logout} className={ROW}>
              <LogOut className="size-5 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden />
              <span className="text-[15px] text-ink">Sign out</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}
