import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/media";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { STATUS_TONE } from "@/domain/appointment-state";
import { getI18n, getT } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { fmtDate, fmtTime } from "@/lib/format";
import { listCustomerAppointments, pendingReviews } from "@/server/services/customer";
import { requireViewerPage } from "@/server/viewer";
import { LiveRefresh } from "@/components/shell/live-refresh";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("bookings");
  return { title: t("list.title"), robots: { index: false } };
}

const TABS = ["upcoming", "past", "cancelled"] as const;

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const viewer = await requireViewerPage("/bookings");
  const [t, { intl }] = await Promise.all([getT("bookings"), getI18n()]);
  const sp = await searchParams;
  const tab = TABS.find((k) => k === sp.tab) ?? "upcoming";
  const [items, toReview] = await Promise.all([listCustomerAppointments(viewer.id, tab), tab === "upcoming" ? pendingReviews(viewer.id) : Promise.resolve([])]);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <LiveRefresh kinds={["appointment"]} />
      <PageHeader title={t("list.title")} />
      <nav className="mt-6 flex gap-6 border-b border-line" aria-label={t("list.filters")}>
        {TABS.map((k) => (
          <Link key={k} href={k === "upcoming" ? "/bookings" : `/bookings?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px border-b-2 pb-3 text-sm font-medium", tab === k ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
            {t(`list.tabs.${k}`)}
          </Link>
        ))}
      </nav>

      {toReview.length > 0 && (
        <div className="mt-6 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-medium text-ink">{t("list.howDidItGo")}</p>
          <ul className="mt-2 space-y-1">
            {toReview.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-ink-2">
                  {r.serviceName} · {r.businessName}
                </span>
                <Link href={`/bookings/${r.id}?review=1`} className="shrink-0 font-medium text-ink underline underline-offset-4">
                  {t("list.review")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t(`list.empty.${tab}`)}
          description={tab === "upcoming" ? t("list.empty.upcomingBody") : undefined}
          action={tab === "upcoming" ? <ButtonLink href="/explore">{t("list.empty.findPro")}</ButtonLink> : undefined}
        />
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {items.map((a) => (
            <li key={a.id}>
              <Link href={`/bookings/${a.id}`} className="-mx-3 flex items-center gap-4 rounded-lg px-3 py-4 transition-colors hover:bg-surface">
                <div className="flex w-14 shrink-0 flex-col items-center rounded-lg border border-line bg-surface py-1.5 leading-tight">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{fmtDate(a.startsAt, a.timezone, { month: "short" }, intl)}</span>
                  <span className="text-lg font-semibold text-ink tabular">{fmtDate(a.startsAt, a.timezone, { day: "numeric" }, intl)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">{a.snapshot.serviceName}</p>
                  <p className="truncate text-sm text-ink-3">
                    {fmtDate(a.startsAt, a.timezone, { weekday: "short" }, intl)} {fmtTime(a.startsAt, a.timezone, intl)} · {a.businessName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={STATUS_TONE[a.status]}>{t(`status.${a.status}`)}</Badge>
                  <Avatar name={a.businessName} media={a.logo} size={32} className="hidden sm:inline-flex" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
