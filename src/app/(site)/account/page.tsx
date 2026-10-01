import { Bell, CalendarDays, ChevronRight, FileText, Heart, LifeBuoy, MessageCircle, Store, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ResendVerificationButton, SignOutButton } from "@/components/account/account-actions";
import { rich } from "@/components/account/rich";
import { ACCOUNT_SECTIONS } from "@/components/account/sections";
import { Avatar } from "@/components/ui/media";
import { getI18n, getT } from "@/i18n/server";
import { getAccount } from "@/server/services/account";
import { requireViewerPage, shellViewer } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("account");
  return { title: t("nav.account"), robots: { index: false } };
}

type Row = { href: string; label: string; description?: string; icon: LucideIcon };

function RowList({ id, title, rows }: { id: string; title: string; rows: Row[] }) {
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
                <ChevronRight className="size-4 shrink-0 text-ink-3 rtl:-scale-x-100" aria-hidden />
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
  const [account, shell, t, { intl }] = await Promise.all([getAccount(viewer.id), shellViewer(), getT("account"), getI18n()]);
  const since = new Intl.DateTimeFormat(intl, { month: "long", year: "numeric" }).format(account.createdAt);
  const section = (s: (typeof ACCOUNT_SECTIONS)[number]): Row => ({ href: s.href, icon: s.icon, label: t(`sections.${s.key}.label`), description: t(`sections.${s.key}.description`) });

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6 lg:max-w-5xl lg:px-8">
      <header className="flex items-center gap-4">
        <Avatar name={account.name} media={account.avatar} size={64} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[32px] leading-[1.1] tracking-[-0.01em] text-ink sm:text-[38px]">{account.name}</h1>
          <p className="truncate text-sm text-ink-3">{account.email ?? t("noEmail")}</p>
          <p className="text-[13px] text-ink-3">{t("home.memberSince", { date: since })}</p>
        </div>
      </header>

      {account.email && !account.emailVerifiedAt && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-warn">
            {rich(t("home.confirmEmail", { email: account.email }), { b: (c) => <span className="font-semibold">{c}</span> })}
          </p>
          <div className="shrink-0">
            <ResendVerificationButton email={account.email} />
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="space-y-8">
          <RowList
            id="acc-activity"
            title={t("home.activity")}
            rows={[
              { href: "/bookings", label: t("home.rows.bookings.label"), description: t("home.rows.bookings.description"), icon: CalendarDays },
              { href: "/favorites", label: t("home.rows.saved.label"), description: t("home.rows.saved.description"), icon: Heart },
              { href: "/messages", label: t("home.rows.messages.label"), description: t("home.rows.messages.description"), icon: MessageCircle },
              { href: "/notifications", label: t("home.rows.notifications.label"), description: t("home.rows.notifications.description"), icon: Bell },
            ]}
          />
          <RowList id="acc-settings" title={t("home.settings")} rows={ACCOUNT_SECTIONS.map(section)} />
        </div>
        <div className="space-y-8">
          <RowList
            id="acc-more"
            title={t("home.more")}
            rows={[
              shell?.hasBusiness
                ? { href: "/pro", label: t("home.rows.business.label"), description: t("home.rows.business.description"), icon: Store }
                : { href: "/for-business", label: t("home.rows.offer.label"), description: t("home.rows.offer.description"), icon: Store },
              { href: "/support", label: t("home.rows.support.label"), description: t("home.rows.support.description"), icon: LifeBuoy },
              { href: "/legal/terms", label: t("home.rows.legal.label"), description: t("home.rows.legal.description"), icon: FileText },
            ]}
          />
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
