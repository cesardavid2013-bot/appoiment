import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/media";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { STATUS_LABELS, STATUS_TONE } from "@/domain/appointment-state";
import { cn } from "@/lib/cn";
import { fmtDate, fmtTime } from "@/lib/format";
import { listCustomerAppointments, pendingReviews } from "@/server/services/customer";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Bookings", robots: { index: false } };

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const viewer = await requireViewerPage("/bookings");
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "upcoming") as (typeof TABS)[number]["key"];
  const [items, toReview] = await Promise.all([listCustomerAppointments(viewer.id, tab), tab === "upcoming" ? pendingReviews(viewer.id) : Promise.resolve([])]);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <PageHeader title="Bookings" />
      <nav className="mt-6 flex gap-6 border-b border-line" aria-label="Booking filters">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "upcoming" ? "/bookings" : `/bookings?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={cn("-mb-px border-b-2 pb-3 text-sm font-medium", tab === t.key ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {toReview.length > 0 && (
        <div className="mt-6 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-medium text-ink">How did it go?</p>
          <ul className="mt-2 space-y-1">
            {toReview.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-ink-2">
                  {r.serviceName} · {r.businessName}
                </span>
                <Link href={`/bookings/${r.id}?review=1`} className="shrink-0 font-medium text-ink underline underline-offset-4">
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={tab === "upcoming" ? "No upcoming appointments" : tab === "past" ? "No past appointments yet" : "Nothing cancelled"}
          description={tab === "upcoming" ? "When you book, your appointments show up here — with directions, reminders and easy rescheduling." : undefined}
          action={tab === "upcoming" ? <ButtonLink href="/explore">Find a professional</ButtonLink> : undefined}
        />
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {items.map((a) => (
            <li key={a.id}>
              <Link href={`/bookings/${a.id}`} className="-mx-3 flex items-center gap-4 rounded-lg px-3 py-4 transition-colors hover:bg-surface">
                <div className="flex w-14 shrink-0 flex-col items-center rounded-lg border border-line bg-surface py-1.5 leading-tight">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{fmtDate(a.startsAt, a.timezone, { month: "short" })}</span>
                  <span className="text-lg font-semibold text-ink tabular">{fmtDate(a.startsAt, a.timezone, { day: "numeric" })}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">{a.snapshot.serviceName}</p>
                  <p className="truncate text-sm text-ink-3">
                    {fmtDate(a.startsAt, a.timezone, { weekday: "short" })} {fmtTime(a.startsAt, a.timezone)} · {a.businessName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABELS[a.status]}</Badge>
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
