import { Bell, CalendarDays, ChevronRight, FileText, Heart, LifeBuoy, MessageCircle, Store, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ResendVerificationButton, SignOutButton } from "@/components/account/account-actions";
import { ACCOUNT_SECTIONS } from "@/components/account/sections";
import { Avatar } from "@/components/ui/media";
import { getAccount } from "@/server/services/account";
import { requireViewerPage, shellViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

type Row = { href: string; label: string; description?: string; icon: LucideIcon };

function RowList({ title, rows }: { title: string; rows: Row[] }) {
  const id = `acc-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 px-1 text-[13px] font-medium text-ink-3">
        {title}
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.href}>
              <Link href={r.href} className="flex min-h-14 items-center gap-3.5 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:px-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-ink">{r.label}</span>
                  {r.description && <span className="block text-[13px] leading-snug text-ink-3">{r.description}</span>}
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function AccountPage() {
  const viewer = await requireViewerPage("/account");
  const [account, shell] = await Promise.all([getAccount(viewer.id), shellViewer()]);
  const since = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(account.createdAt);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6 lg:max-w-5xl lg:px-8">
      <header className="flex items-center gap-4">
        <Avatar name={account.name} media={account.avatar} size={64} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[32px] leading-[1.1] tracking-[-0.01em] text-ink sm:text-[38px]">{account.name}</h1>
          <p className="truncate text-sm text-ink-3">{account.email ?? "No email on file"}</p>
          <p className="text-[13px] text-ink-3">Member since {since}</p>
        </div>
      </header>

      {account.email && !account.emailVerifiedAt && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-warn">
            <span className="font-semibold">Confirm your email.</span> We sent a link to {account.email} so businesses can reach you about bookings.
          </p>
          <div className="shrink-0">
            <ResendVerificationButton email={account.email} />
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="space-y-8">
          <RowList
            title="Your activity"
            rows={[
              { href: "/bookings", label: "Bookings", description: "Upcoming and past appointments", icon: CalendarDays },
              { href: "/favorites", label: "Saved", description: "Professionals you've saved", icon: Heart },
              { href: "/messages", label: "Messages", description: "Conversations with businesses", icon: MessageCircle },
              { href: "/notifications", label: "Notifications", description: "Updates about your bookings", icon: Bell },
            ]}
          />
          <RowList title="Settings" rows={ACCOUNT_SECTIONS} />
        </div>
        <div className="space-y-8">
          <RowList
            title="More"
            rows={[
              shell?.hasBusiness
                ? { href: "/pro", label: "Switch to your business", description: "Calendar, services and clients", icon: Store }
                : { href: "/for-business", label: "Offer your services on Kept", description: "Take bookings and grow your business — free to start", icon: Store },
              { href: "/support", label: "Help & support", description: "Get help with a booking, payment or your account", icon: LifeBuoy },
              { href: "/legal/terms", label: "Terms & privacy", description: "How Kept works and how we handle your data", icon: FileText },
            ]}
          />
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
